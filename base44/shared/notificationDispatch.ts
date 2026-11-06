// One notification, once.
//
// The claim is the heart of this file. Base44 entities have no unique index, so
// a plain "list, then create" cannot dedupe: two triggers can both see nothing
// and both create. What the platform DOES give us is a single conditional
// update that reports whether it changed a record:
//
//   updateMany({ id, claimed_keys: { $nin: [key] } }, { $push: { claimed_keys: key } })
//     -> { updated: 1 }  we claimed this key
//     -> { updated: 0 }  someone else already did
//
// Verified against the live app: five simultaneous attempts at the same key
// produced exactly one `updated: 1`. The ledger document is the recipient's own
// preference record, which exists only after that person opted in, so the
// anchor is selected consistently and is never created by a concurrent
// evaluator; per-stage compare-and-set state additionally serializes decisions.
//
// Everything after the claim is deliberately conservative. A send is attempted
// once. If the push service clearly refused it, the outcome is "failed". If the
// outcome is ambiguous (timeout, 5xx, connection dropped), the attempt is
// recorded as "unknown" and is NEVER resent — the provider has no idempotency
// key, so a resend could produce a second notification.

import {
  PUSH_CHANNEL,
  type Category,
  type PushCopy,
  formatClock,
  isHeldByQuietHours,
  type QuietHours,
} from "./notificationCore.ts";

export type DispatchStatus = "skipped" | "submitted" | "failed" | "unknown" | "duplicate";

export interface DispatchInput {
  /** Master switch AND the category permission, already resolved server-side. */
  enabled: boolean;
  category: Category;
  ownerUserId: string;
  recipientUserId: string;
  sharedAccessId: string | null;
  audience: "self" | "follower";
  episodeKey: string;
  eventKey: string;
  /** Epoch ms of the measurement this notification is about. */
  occurredAtMs: number;
  /** Epoch ms after which the news is too old to send. */
  expiresAtMs: number;
  copy: PushCopy;
  detailShown: boolean;
  destination: string;
  quiet: QuietHours | null;
  permissionVersion?: number | null;
  coveredEvents?: Array<{ category: string; episodeKey: string; repeatIndex?: number }>;
}

export interface DispatchDeps {
  /** Resolves true only for the caller that atomically claimed this event key. */
  claim: (eventKey: string) => Promise<boolean>;
  createRecord: (row: Record<string, unknown>) => Promise<any>;
  updateRecord: (id: string, patch: Record<string, unknown>) => Promise<void>;
  /** Re-reads permissions and access. Runs immediately before transport. */
  recheck: () => Promise<{ ok: boolean; reason?: string }>;
  /** The platform's own native push integration. */
  send: (message: { user_id: string; title: string; content: string; action_url: string }) => Promise<void>;
  nowMs: number;
  /** Builds the absolute link the OS opens when the notification is tapped. */
  absoluteUrl: (path: string) => string;
}

export interface DispatchOutcome {
  status: DispatchStatus;
  reason: string | null;
  deliveryId: string | null;
}

/**
 * Whether a push failure clearly means "not accepted" or might have been
 * accepted. Only the first kind is safe to describe as failed; the second is
 * recorded as unknown and never retried.
 */
export function classifySendOutcome(error: any): "ambiguous" | "not_accepted" {
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || "");
  if (status === 429) return "not_accepted";
  if (status >= 500) return "ambiguous";
  if (status >= 400) return "not_accepted";
  if (/timeout|timed out|network|fetch|abort|socket|econn|unavailable/i.test(message)) return "ambiguous";
  // Anything we cannot classify is treated as possibly accepted.
  return "ambiguous";
}

export async function dispatchNotification(
  input: DispatchInput,
  deps: DispatchDeps
): Promise<DispatchOutcome> {
  // 1. Off is off. No claim, no record, no transport.
  if (!input.enabled) return { status: "skipped", reason: "preference_off", deliveryId: null };

  // 2. Quiet hours hold it back before the episode is consumed, so the next
  //    evaluation re-checks the CURRENT condition rather than replaying this one.
  if (isHeldByQuietHours(input.category, input.quiet, deps.nowMs)) {
    return { status: "skipped", reason: "quiet_hours", deliveryId: null };
  }

  // 3. The news has gone stale between evaluation and send.
  if (deps.nowMs > input.expiresAtMs) {
    return { status: "skipped", reason: "expired", deliveryId: null };
  }

  // 4. Atomic claim. Exactly one caller wins a given event key.
  const claimed = await deps.claim(input.eventKey);
  if (!claimed) return { status: "duplicate", reason: "already_claimed", deliveryId: null };

  // 5. Record the attempt before anything leaves the server.
  let delivery: any = null;
  try {
    delivery = await deps.createRecord({
      recipient_user_id: input.recipientUserId,
      owner_user_id: input.ownerUserId,
      shared_access_id: input.sharedAccessId,
      audience: input.audience,
      category: input.category,
      channel: PUSH_CHANNEL,
      event_key: input.eventKey,
      episode_key: input.episodeKey,
      occurred_at: new Date(input.occurredAtMs).toISOString(),
      status: "claimed",
      detail_shown: input.detailShown,
      destination: input.destination,
      permission_version: input.permissionVersion ?? null,
      covered_events: input.coveredEvents || [{ category: input.category, episodeKey: input.episodeKey }],
    });
  } catch (error: any) {
    // The claim is spent and nothing was sent. Recording the failure is not
    // worth risking a second claim; report it so the run is visible.
    console.error("[dispatchNotification] could not record the attempt:", error?.message || "");
    return { status: "failed", reason: "record_failed", deliveryId: null };
  }

  const deliveryId = delivery?.id ?? null;

  // 6. Permissions are checked AGAIN, moments before the send.
  const check = await deps.recheck();
  if (!check.ok) {
    if (deliveryId) {
      await deps.updateRecord(deliveryId, { status: "skipped", reason: check.reason || "not_eligible" });
    }
    return { status: "skipped", reason: check.reason || "not_eligible", deliveryId };
  }

  // 7. One attempt, never retried.
  try {
    await deps.send({
      user_id: input.recipientUserId,
      title: input.copy.title,
      content: input.copy.body,
      action_url: deps.absoluteUrl(input.destination),
    });
  } catch (error: any) {
    const kind = classifySendOutcome(error);
    const status = kind === "ambiguous" ? "unknown" : "failed";
    console.error(
      "[dispatchNotification] push not confirmed:",
      status,
      Number(error?.status || 0),
      String(error?.message || "").slice(0, 200)
    );
    if (deliveryId) {
      await deps.updateRecord(deliveryId, { status, reason: kind === "ambiguous" ? "transport_unknown" : "transport_failed" });
    }
    return { status, reason: kind === "ambiguous" ? "transport_unknown" : "transport_failed", deliveryId };
  }

  // "Submitted", never "delivered": the push service accepting a message is all
  // we can know. There is no provider receipt in this integration.
  if (deliveryId) {
    await deps.updateRecord(deliveryId, {
      status: "submitted",
      submitted_at: new Date(deps.nowMs).toISOString(),
      reason: null,
    });
  }
  return { status: "submitted", reason: null, deliveryId };
}

/**
 * Keep the claim ledger bounded. Old keys are pulled once the list grows past
 * the cap; the matching delivery rows remain as history.
 */
export function keysToPrune(claimedKeys: unknown, keep = 200): string[] {
  const keys = Array.isArray(claimedKeys) ? claimedKeys.filter((k) => typeof k === "string") : [];
  if (keys.length <= keep + 100) return [];
  return keys.slice(0, keys.length - keep);
}

/** Human clock for a delivery row, in the recipient's own zone. */
export function deliveryTimeLabel(iso: string | null | undefined, timeZone: string | null | undefined): string | null {
  return formatClock(iso, timeZone);
}