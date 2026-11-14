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
  type DeliveryCategory,
  type PushCopy,
  formatClock,
  isHeldByQuietHours,
  type QuietHours,
} from "./notificationCore.ts";
import { classifyRecipientRefusal, NO_DEVICE_REASON, NOT_MEMBER_REASON } from "./notificationReachability.ts";

const RETRYABLE_RECIPIENT_REASONS = [NO_DEVICE_REASON, NOT_MEMBER_REASON];

export type DispatchStatus = "skipped" | "submitted" | "failed" | "unknown" | "duplicate";

export interface DispatchInput {
  /** Master switch AND the category permission, already resolved server-side. */
  enabled: boolean;
  category: DeliveryCategory;
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
  send: (message: { user_id: string; title: string; content: string; action_url: string }) => Promise<any>;
  /** Gives an unspent claim back: nothing left the server. */
  releaseClaim?: (eventKey: string) => Promise<void>;
  /**
   * Durable record of a send that already left the server for this event key.
   * The ledger claim can be handed back (a recipient the transport could not
   * address yet), so the delivery row — written before transport — is what
   * guarantees a retry never re-sends a push that was already accepted.
   */
  alreadySent?: (eventKey: string) => Promise<boolean>;
  /** Schedules a bounded backoff retry for a recipient with no device yet. */
  scheduleRetry?: (reason: string) => Promise<void>;
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

  // 4b. A push already handed to the service for this key is never sent again,
  //     even when a released claim let this attempt through. "unknown" counts as
  //     sent, and so does a lingering "claimed" row (the row is written before
  //     transport, so the message may already be out).
  if (deps.alreadySent) {
    try {
      if (await deps.alreadySent(input.eventKey)) {
        return { status: "duplicate", reason: "already_sent", deliveryId: null };
      }
    } catch {
      // A failed lookup must not swallow a legitimate notice; the claim holds.
    }
  }

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
    const reason = check.reason || "not_eligible";
    if (deliveryId) await deps.updateRecord(deliveryId, { status: "skipped", reason });
    // A recipient who cannot be addressed yet has not received anything, so the
    // claim goes back and a bounded retry is scheduled — never a silent drop.
    if (RETRYABLE_RECIPIENT_REASONS.includes(reason)) {
      if (deps.releaseClaim) {
        try { await deps.releaseClaim(input.eventKey); } catch { /* the claim stays spent */ }
      }
      if (deps.scheduleRetry) {
        try { await deps.scheduleRetry(reason); } catch { /* the sweep still re-evaluates */ }
      }
    }
    return { status: "skipped", reason, deliveryId };
  }

  // 7. One attempt, never retried.
  try {
    const message = {
      user_id: input.recipientUserId,
      title: input.copy.title,
      content: input.copy.body,
      action_url: deps.absoluteUrl(input.destination),
    };
    logPushPayload(message);
    const response = await deps.send(message);
    if (response?.success === false || response?.ok === false) throw Object.assign(new Error('Push service refused submission'), { status: 422 });
  } catch (error: any) {
    // A recipient the push service cannot address at all is not a transport
    // failure: nothing was sent and no device could receive it. The claim is
    // released and a bounded backoff retry is scheduled, so the notice is not
    // dropped — and the reason is recorded honestly instead of as a guess.
    const refusal = classifyRecipientRefusal(error);
    if (refusal) {
      console.warn("[dispatchNotification] recipient not addressable:", refusal, Number(error?.status || 0));
      if (deliveryId) await deps.updateRecord(deliveryId, { status: "skipped", reason: refusal });
      if (deps.releaseClaim) {
        try { await deps.releaseClaim(input.eventKey); } catch { /* the claim stays spent */ }
      }
      if (deps.scheduleRetry) {
        try { await deps.scheduleRetry(refusal); } catch { /* the sweep still re-evaluates */ }
      }
      return { status: "skipped", reason: refusal, deliveryId };
    }
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
  // Measured, not assumed: how long the pipeline itself took between the
  // moment that fired this notice and the moment it was handed to the push
  // service. Category and duration only — never a value, never a person.
  console.log(JSON.stringify({
    diagStage: "NOTIFICATION_SUBMITTED",
    category: input.category,
    audience: input.audience,
    latency_ms: Math.max(0, deps.nowMs - input.occurredAtMs),
  }));
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

/**
 * The documented fields of the platform's native push integration.
 *
 * Deliberately closed: the integration schema has no sound, interruption level
 * or raw APNs key, so this app cannot request `aps.sound` and must not pretend
 * to by inventing a field the provider ignores. The alert tone and haptics are
 * chosen by iOS and by the person's own Stackd notification settings.
 */
export const PUSH_MESSAGE_FIELDS = ['action_url', 'content', 'title', 'user_id'];

/**
 * The custom tone each category asks for, named as the file a native iOS target
 * must carry at its bundle root — APNs only plays a sound that ships inside the
 * app. `null` (every category not listed) means the platform's own alert tone
 * stays in charge.
 *
 * This table is the server-side rule for an alert's tone; the in-app chime in
 * src/lib/notificationFeedback.js mirrors it exactly, so the two can never
 * disagree about which way a pace alert should sound.
 *
 * It is deliberately NOT added to the payload: the integration's documented
 * input schema has no sound field (see PUSH_SOUND_SUPPORTED below), so sending
 * one would be a field the provider ignores and a promise this app cannot keep.
 */
export const PUSH_SOUND_BY_CATEGORY: Record<string, string | null> = {
  rising_fast: 'stackd_tone_rising.wav',
  falling_fast: 'stackd_tone_falling.wav',
};

/** The native-bundle sound file a category asks for, or null for the default. */
export function pushSoundFor(category: string): string | null {
  return PUSH_SOUND_BY_CATEGORY[category] || null;
}

/**
 * Whether THIS APP is able to ask for a sound on a remote notification.
 *
 * It is not. The documented input schema of the platform's push integration is
 * { app_id, app_owner, user_id, title, content, action_label, action_url }.
 * There is no `sound`, no interruption level and no raw APNs body, so
 * `aps.sound` — and with it the alert tone while the phone is locked or the app
 * is closed — is decided entirely by Base44's own push service and by the
 * person's iOS Stackd notification settings. No field this app can set reaches
 * that decision, so none is invented here.
 *
 * The chime in src/lib/notificationFeedback.js is Web Audio played by the open
 * app on the device that triggers a test. It confirms the request left Stackd.
 * It is never evidence that the remote alert is audible on a locked phone.
 */
export const PUSH_SOUND_SUPPORTED = false;

/**
 * Field NAMES only — never a title, a body, a link or an account. This makes the
 * serialized payload verifiable in the server logs without exposing health
 * content, tokens or credentials.
 */
function logPushPayload(message: Record<string, unknown>) {
  try {
    console.log(JSON.stringify({ diagStage: 'PUSH_PAYLOAD', fields: Object.keys(message).sort() }));
  } catch {
    // Diagnostics never block a send.
  }
}

/** Human clock for a delivery row, in the recipient's own zone. */
export function deliveryTimeLabel(iso: string | null | undefined, timeZone: string | null | undefined): string | null {
  return formatClock(iso, timeZone);
}