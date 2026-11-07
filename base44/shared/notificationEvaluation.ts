// The one place a Stackd notification is decided and sent.
//
// It lives here, not in an HTTP entry point, so every server-side caller runs
// the exact same rules in-process — there is no second implementation and no
// unawaited background call whose lifetime ingestion could cut short:
//
//   • evaluateNotifications       — the entity trigger / explicit admin call
//   • notifyAfterPersist          — immediately after a real reading is stored
//   • the 5-minute sweep          — time-based conditions and retry of deferred work
//
// The caller never supplies an owner, a recipient, a value or a category: the
// owner is read from the stored reading, and recipients come from stored
// preferences and relationships. Every send still passes the atomic claim in
// notificationDispatch.ts, so a reading evaluated by two routes at once can
// only produce one notification.

import { asArray } from './sharingAccess.ts';
import { relationshipAllowsPush, sharerGrants } from './notificationCore.ts';
import { evaluateRecipient } from './notificationRecipient.ts';

/** Enough history for the freshness, continuity and pace windows. */
const READING_PAGE_LIMIT = 16;

type Counters = Record<string, number>;

function bump(counters: Counters, key: string) {
  counters[key] = (counters[key] || 0) + 1;
}

/** Readings for one owner, newest first. Ownership is checked by the caller. */
export async function loadReadings(sr: any, ownerId: string) {
  const rows = await sr.entities.GlucoseReading.filter(
    { $or: [{ user_id: ownerId }, { created_by_id: ownerId }] },
    { sort: '-recorded_at', limit: READING_PAGE_LIMIT }
  );
  return asArray(rows);
}

async function loadSettings(sr: any, ownerId: string) {
  const rows = asArray(
    await sr.entities.UserSettings.filter({ created_by_id: ownerId }, { sort: '-updated_date', limit: 1 })
  );
  return rows[0] || null;
}

async function loadPersonalPreferences(sr: any, userId: string) {
  const byField = asArray(
    await sr.entities.NotificationPreference.filter({ user_id: userId }, { sort: '-created_date', limit: 1 })
  );
  if (byField.length) return byField[0];
  const byOwner = asArray(
    await sr.entities.NotificationPreference.filter({ created_by_id: userId }, { sort: '-created_date', limit: 1 })
  );
  return byOwner[0] || null;
}

/** Walk every page of a query, so a large relationship set is never truncated. */
export async function allRows(entity: any, query: any, sort = '-created_date') {
  const rows: any[] = [];
  let cursor: string | null = null;
  do {
    const page: any = await entity.filter(query, { sort, limit: 100, ...(cursor ? { cursor } : {}) });
    rows.push(...asArray(page));
    cursor = page?.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

/**
 * Evaluate every permitted recipient for one owner and return what happened.
 *
 * Fixed low/urgent consider distinct fresh measurements from the bounded
 * reading window; other categories use the newest measurement. Stale and
 * backfilled rows never become a queue of historical alerts.
 */
export async function evaluateOwnerNotifications({
  sr,
  ownerId,
  nowMs = Date.now(),
  absoluteUrl,
}: {
  sr: any;
  ownerId: string;
  nowMs?: number;
  absoluteUrl: (path: string) => string;
}) {
  const counters: Counters = {};
  const [settings, rows, personal, relationships, connectionRows] = await Promise.all([
    loadSettings(sr, ownerId),
    loadReadings(sr, ownerId),
    loadPersonalPreferences(sr, ownerId),
    allRows(sr.entities.SharedAccess, { sharer_user_id: ownerId, status: 'active' }),
    sr.entities.DexcomConnection.filter({ created_by_id: ownerId }, { sort: '-created_date', limit: 1 }),
  ]);

  const active = relationships.filter((r: any) => relationshipAllowsPush(r, nowMs));
  const followPrefs = active.length
    ? await allRows(sr.entities.FollowNotificationPreference, {
        shared_access_id: { $in: active.map((r: any) => r.id) },
        master_enabled: true,
      })
    : [];
  const followerIds = [...new Set(followPrefs.map((p: any) => p.user_id).filter(Boolean))];
  const recipientSettings = followerIds.length
    ? await allRows(sr.entities.UserSettings, { created_by_id: { $in: followerIds } }, '-updated_date')
    : [];

  const recipients: Array<{ prefs: any; relationship: any }> = [];
  if (personal?.master_enabled) recipients.push({ prefs: personal, relationship: null });
  const seen = new Set<string>();
  for (const prefs of followPrefs) {
    const relationship = active.find(
      (r: any) => r.id === prefs.shared_access_id && r.follower_user_id === prefs.user_id
    );
    const key = `${prefs.user_id}:${prefs.shared_access_id}`;
    if (relationship && !seen.has(key)) {
      seen.add(key);
      recipients.push({
        prefs: {
          ...prefs,
          above_range_minutes: prefs.above_range_minutes ?? personal?.above_range_minutes ?? null,
        },
        relationship,
      });
    }
  }

  for (const recipient of recipients) {
    const status = await evaluateRecipient({
      sr,
      ownerId,
      ...recipient,
      settings,
      rows,
      recipientSettings: recipientSettings.find((s: any) => s.created_by_id === recipient.prefs.user_id) || null,
      connection: asArray(connectionRows)[0],
      nowMs,
      absoluteUrl,
    });
    bump(counters, status);
  }

  return { recipients: recipients.length, counters };
}

/**
 * Owners worth evaluating on a timer: anyone with notifications on, plus any
 * sharer who has granted a follower a push category. Derived entirely from
 * stored data — never from a request.
 */
export async function sweepOwnerIds(sr: any, nowMs: number = Date.now()) {
  const [personalPrefs, followPrefs] = await Promise.all([
    allRows(sr.entities.NotificationPreference, { master_enabled: true }),
    allRows(sr.entities.FollowNotificationPreference, { master_enabled: true }),
  ]);
  const owners = new Set<string>(
    personalPrefs.map((p: any) => p.user_id || p.created_by_id).filter(Boolean)
  );
  const ids = [...new Set(followPrefs.map((p: any) => p.shared_access_id).filter(Boolean))];
  const relationships = ids.length
    ? await allRows(sr.entities.SharedAccess, { id: { $in: ids }, status: 'active' })
    : [];
  for (const relationship of relationships) {
    if (relationshipAllowsPush(relationship, nowMs) && Object.values(sharerGrants(relationship)).some(Boolean)) {
      owners.add(relationship.sharer_user_id);
    }
  }
  return [...owners].filter(Boolean);
}