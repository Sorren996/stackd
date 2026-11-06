// The one place a Stackd notification is decided and sent.
//
// Two callers, one code path:
//   • the entity workflow, after a glucose reading is saved  -> { reading_id }
//   • the 5-minute sweep, which never depends on a reading arriving -> { mode: "sweep" }
//
// Authorization: the platform's workflow run arrives as an admin, so the caller
// must be signed in AND an admin. No owner, recipient, value or category is ever
// read from the request: the reading is fetched again from the database, the
// owner comes from the stored record, and recipients come from stored
// preferences and relationships. A rejected or absent caller gets 401/403.
//
// Every send goes through dispatchNotification, which claims the event
// atomically on the recipient's ledger before anything is transmitted, re-checks
// permissions immediately before transport, and sends at most once.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, asArray, currentUser, readBody, appOrigin } from "../../shared/sharingAccess.ts";
import { assertSchedulerCaller, relationshipAllowsPush, sharerGrants } from '../../shared/notificationCore.ts';
import { evaluateRecipient } from '../../shared/notificationRecipient.ts';

const READING_PAGE_LIMIT = 16;

type Counters = Record<string, number>;

function bump(counters: Counters, key: string) {
  counters[key] = (counters[key] || 0) + 1;
}

/** Readings for one owner, newest first. Ownership is checked by the caller. */
async function loadReadings(sr: any, ownerId: string) {
  const rows = await sr.entities.GlucoseReading.filter(
    { $or: [{ user_id: ownerId }, { created_by_id: ownerId }] },
    { sort: "-recorded_at", limit: READING_PAGE_LIMIT }
  );
  return asArray(rows);
}

async function loadSettings(sr: any, ownerId: string) {
  const rows = asArray(
    await sr.entities.UserSettings.filter({ created_by_id: ownerId }, { sort: "-updated_date", limit: 1 })
  );
  return rows[0] || null;
}

async function loadPersonalPreferences(sr: any, userId: string) {
  const byField = asArray(
    await sr.entities.NotificationPreference.filter({ user_id: userId }, { sort: "-created_date", limit: 1 })
  );
  if (byField.length) return byField[0];
  const byOwner = asArray(
    await sr.entities.NotificationPreference.filter({ created_by_id: userId }, { sort: "-created_date", limit: 1 })
  );
  return byOwner[0] || null;
}

async function allRows(entity: any, query: any, sort = '-created_date') {
  const rows = [];
  let cursor;
  do {
    const page = await entity.filter(query, { sort, limit: 100, ...(cursor ? { cursor } : {}) });
    rows.push(...asArray(page));
    cursor = page.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

async function evaluateOwner(ctx: any, ownerId: string) {
  const { sr, req, counters } = ctx;
  const [settings, rows, personal, relationships, connectionRows] = await Promise.all([
    loadSettings(sr, ownerId), loadReadings(sr, ownerId), loadPersonalPreferences(sr, ownerId),
    allRows(sr.entities.SharedAccess, { sharer_user_id: ownerId, status: 'active' }),
    sr.entities.DexcomConnection.filter({ created_by_id: ownerId }, { sort: '-created_date', limit: 1 }),
  ]);
  const active = relationships.filter(r => relationshipAllowsPush(r, Date.now()));
  const followPrefs = active.length ? await allRows(sr.entities.FollowNotificationPreference, { shared_access_id: { $in: active.map(r => r.id) }, master_enabled: true }) : [];
  const followerIds = [...new Set(followPrefs.map(p => p.user_id).filter(Boolean))];
  const recipientSettings = followerIds.length ? await allRows(sr.entities.UserSettings, { created_by_id: { $in: followerIds } }, '-updated_date') : [];
  const recipients = [];
  if (personal?.master_enabled) recipients.push({ prefs: personal, relationship: null });
  const seen = new Set();
  for (const prefs of followPrefs) {
    const relationship = active.find(r => r.id === prefs.shared_access_id && r.follower_user_id === prefs.user_id);
    const key = `${prefs.user_id}:${prefs.shared_access_id}`;
    if (relationship && !seen.has(key)) { seen.add(key); recipients.push({ prefs: { ...prefs, above_range_minutes: prefs.above_range_minutes ?? personal?.above_range_minutes ?? null }, relationship }); }
  }
  for (const recipient of recipients) {
    const status = await evaluateRecipient({ sr, ownerId, ...recipient, settings, rows,
      recipientSettings: recipientSettings.find(s => s.created_by_id === recipient.prefs.user_id) || null,
      connection: asArray(connectionRows)[0], nowMs: Date.now(), absoluteUrl: path => `${appOrigin(req)}${path}` });
    bump(counters, status);
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    const guard = assertSchedulerCaller(user);
    if (guard.error) return fail(guard.error, guard.status);

    const body = await readBody(req);
    const sr = base44.asServiceRole;
    const ctx = { sr, req, counters: {} };

    // ── A genuine saved reading ──────────────────────────────────────────
    if (typeof body.reading_id === "string" && body.reading_id) {
      let reading: any = null;
      try {
        reading = await sr.entities.GlucoseReading.get(body.reading_id);
      } catch {
        reading = null;
      }
      if (!reading?.id) return ok({ mode: "reading", evaluated: 0, reason: "no_reading" });

      // The owner comes from the stored record, never from the request.
      const ownerId = reading.user_id || reading.created_by_id;
      if (!ownerId) return ok({ mode: "reading", evaluated: 0, reason: "no_owner" });

      // Always decides from the newest stored measurement, never the event's
      // historic reading. Backlog callbacks cannot replay old crossings.
      await evaluateOwner(ctx, ownerId);

      return ok({ mode: "reading", evaluated: 1, ...ctx.counters });
    }

    // ── The periodic sweep ───────────────────────────────────────────────
    // Never depends on a reading arriving: it is how a silent sensor is
    // noticed. Recipients with notifications off cost one query and nothing else.
    const [personalPrefs, followPrefs] = await Promise.all([
      allRows(sr.entities.NotificationPreference, { master_enabled: true }),
      allRows(sr.entities.FollowNotificationPreference, { master_enabled: true }),
    ]);
    const owners = new Set(personalPrefs.map(p => p.user_id || p.created_by_id).filter(Boolean));
    const ids = [...new Set(followPrefs.map(p => p.shared_access_id).filter(Boolean))];
    const relationships = ids.length ? await allRows(sr.entities.SharedAccess, { id: { $in: ids }, status: 'active' }) : [];
    for (const relationship of relationships) {
      if (relationshipAllowsPush(relationship, Date.now()) && Object.values(sharerGrants(relationship)).some(Boolean)) owners.add(relationship.sharer_user_id);
    }
    for (const ownerId of owners) await evaluateOwner(ctx, ownerId);
    return ok({ mode: 'sweep', owners: owners.size, ...ctx.counters });
  } catch (error: any) {
    console.error("[evaluateNotifications] failed:", error?.message || "unexpected error");
    return fail("server_error", 500);
  }
}