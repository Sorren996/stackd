// Shared server-side helpers for the Stackd follower-sharing feature.
//
// Every function in this feature goes through these helpers so that:
//   * the caller is ALWAYS resolved from the request, never from the payload,
//   * a relationship is loaded and its ownership (or follower binding)
//     verified before a single field is read from it,
//   * scope decisions always come from ./sharingCore.ts — never from a request
//     body, and never re-implemented per function.

import {
  sanitizeScopes,
  sanitizeAlertScopes,
  sanitizeFollowerPrefs,
  effectiveScopes,
  effectiveAlertScopes,
  effectiveStatus,
  accessBlockReason,
  normalizeEmail,
  isPlausibleEmail,
} from "./sharingCore.ts";

/** Invitations live for 48 hours by default. */
export const INVITE_TTL_HOURS = 48;

/** How many invitations one account may create per hour. */
export const MAX_INVITES_PER_HOUR = 10;

/** Max followers one account may hold at once. */
export const MAX_FOLLOWERS = 25;

export function ok(body: Record<string, any> = {}, status = 200): Response {
  return Response.json({ ok: true, ...body }, { status });
}

export function fail(reason: string, status = 400, extra: Record<string, any> = {}): Response {
  return Response.json({ ok: false, reason, ...extra }, { status });
}

/**
 * Entity queries return either a plain array (no options) or a page
 * (`{ items, next_cursor }`, with options). Normalising here removes a whole
 * class of silent "empty list" bugs.
 */
export function asArray(result: any): any[] {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.items)) return result.items;
  return [];
}

/** Resolve the caller from the request. Never trust an id from the payload. */
export async function currentUser(base44: any): Promise<any | null> {
  try {
    const user = await base44.auth.me();
    return user || null;
  } catch {
    return null;
  }
}

/** Read a JSON body without ever throwing on malformed input. */
export async function readBody(req: Request): Promise<Record<string, any>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body : {};
  } catch {
    return {};
  }
}

export function appOrigin(req: Request): string {
  const header = req.headers.get("X-Base44-App-Url");
  const origin = header && header.startsWith("http") ? header.replace(/\/+$/, "") : "";
  return origin || "https://stackdinsight.base44.app";
}

export function buildInviteUrl(req: Request, token: string): string {
  return `${appOrigin(req)}/follow?token=${encodeURIComponent(token)}`;
}

/** True when the submitted email is usable as an invitation target. */
export function readInviteEmail(value: unknown): string | null {
  const email = normalizeEmail(value);
  return isPlausibleEmail(email) ? email : null;
}

export function readDisplayName(value: unknown, fallback: string): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) return fallback;
  return name.slice(0, 60);
}

/**
 * Load a relationship as the SHARER and verify ownership.
 * Returns { access } or { error, status }.
 */
export async function loadOwnedRelationship(
  base44: any,
  userId: string,
  accessId: unknown
): Promise<{ access?: any; error?: string; status?: number }> {
  if (typeof accessId !== "string" || !accessId) return { error: "missing_access_id", status: 400 };
  let access: any;
  try {
    access = await base44.asServiceRole.entities.SharedAccess.get(accessId);
  } catch {
    return { error: "not_found", status: 404 };
  }
  if (!access?.id) return { error: "not_found", status: 404 };
  if (access.sharer_user_id !== userId) return { error: "forbidden", status: 403 };
  return { access };
}

/**
 * Load a relationship as the FOLLOWER. The follower id is always taken from the
 * authenticated caller, so swapping an id in the request body grants nothing.
 */
export async function loadFollowedRelationship(
  base44: any,
  userId: string,
  accessId: unknown
): Promise<{ access?: any; error?: string; status?: number }> {
  if (typeof accessId !== "string" || !accessId) return { error: "missing_access_id", status: 400 };
  let access: any;
  try {
    access = await base44.asServiceRole.entities.SharedAccess.get(accessId);
  } catch {
    return { error: "not_found", status: 404 };
  }
  if (!access?.id) return { error: "not_found", status: 404 };
  if (!access.follower_user_id || access.follower_user_id !== userId) {
    return { error: "forbidden", status: 403 };
  }
  return { access };
}

/**
 * The one shape a relationship is ever rendered from.
 * Scopes are resolved for THIS instant, so a revoked relationship reports no
 * access and the permission version travels with it so a follower client can
 * detect that its cached data is stale.
 */
export function publicRelationship(access: any, now: number = Date.now()): Record<string, any> {
  return {
    id: access.id,
    sharer_user_id: access.sharer_user_id ?? null,
    sharer_display_name: access.sharer_display_name ?? null,
    invited_email: access.invited_email ?? null,
    follower_bound: Boolean(access.follower_user_id),
    status: effectiveStatus(access, now),
    scopes: effectiveScopes(access, now),
    alert_scopes: effectiveAlertScopes(access, now),
    contact_shared: Boolean(access.contact_shared),
    permission_version: Number(access.permission_version) || 1,
    invitation_id: access.invitation_id ?? null,
    invitation_expires_at: access.invitation_expires_at ?? null,
    accepted_at: access.accepted_at ?? null,
    paused_at: access.paused_at ?? null,
    revoked_at: access.revoked_at ?? null,
    last_scope_change_at: access.last_scope_change_at ?? null,
    follower_prefs: sanitizeFollowerPrefs(access.follower_prefs),
    created_date: access.created_date ?? null,
  };
}

/** Effective status gate for a data read. `null` means the read may proceed. */
export function relationshipBlockReason(access: any, now: number = Date.now()): string | null {
  const reason = accessBlockReason(access, now);
  return reason === "ok" ? null : reason;
}

/** Normalise a scope patch so only real boolean keys ever reach the database. */
export function scopePatch(value: unknown): Record<string, boolean> {
  return sanitizeScopes(value);
}

export function alertScopePatch(value: unknown): Record<string, boolean> {
  return sanitizeAlertScopes(value);
}

/** Bounded, non-PHI audit trail. Never carries a token or a health value. */
export async function audit(base44: any, entry: Record<string, any>): Promise<void> {
  try {
    await base44.asServiceRole.entities.AuditLog.create({
      action: entry.action,
      admin_user_id: entry.actor_user_id ?? null,
      admin_email: entry.actor_email ?? null,
      affected_user_id: entry.subject_user_id ?? null,
      affected_user_email: entry.subject_user_email ?? null,
      reason: entry.reason ?? null,
      metadata: entry.metadata || {},
    });
  } catch (error: any) {
    console.error("[sharingAccess] audit write failed:", error?.message || error);
  }
}

/** Count the caller's invitations opened in the last hour, for rate limiting. */
export async function invitesThisHour(base44: any, userId: string): Promise<number> {
  const cutoff = Date.now() - 60 * 60 * 1000;
  try {
    const page = await base44.asServiceRole.entities.SharedAccess.filter(
      { sharer_user_id: userId },
      { sort: "-created_date", limit: 50 }
    );
    const items = Array.isArray(page) ? page : page?.items || [];
    return items.filter((r: any) => new Date(r.created_date).getTime() >= cutoff).length;
  } catch {
    return 0;
  }
}

/**
 * A prior delivery under the same event key means the notice was already
 * evaluated. A key is never reused for a different event or channel.
 */
export async function findPriorDelivery(
  base44: any,
  eventKey: string,
  channel: string
): Promise<any | null> {
  try {
    const rows = await base44.asServiceRole.entities.FollowerAlertDelivery.filter({
      event_key: eventKey,
      channel,
    });
    const items = Array.isArray(rows) ? rows : rows?.items || [];
    return items[0] || null;
  } catch {
    return null;
  }
}

export async function recordDelivery(base44: any, record: Record<string, any>): Promise<void> {
  try {
    await base44.asServiceRole.entities.FollowerAlertDelivery.create(record);
  } catch (error: any) {
    console.error("[sharingAccess] delivery record failed:", error?.message || error);
  }
}