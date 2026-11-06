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
import {
  ABOVE_RANGE_DURATION_CHOICES,
  MISSING_DELAY_CHOICES,
  NOTIFICATION_FRESHNESS_MINUTES,
  assertSchedulerCaller,
  buildNotificationCopy,
  decideMissingNotification,
  decideReadingNotification,
  destinationFor,
  effectiveFollowerCategories,
  notificationEventKey,
  relationshipAllowsPush,
  sharerGrants,
  type Category,
  type ReadingDecision,
} from "../../shared/notificationCore.ts";
import { dispatchNotification, keysToPrune } from "../../shared/notificationDispatch.ts";

const READING_PAGE_LIMIT = 12;

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

/**
 * The claim ledger for one recipient scope.
 *
 * Oldest match wins, so every concurrent evaluator picks the same document even
 * if a duplicate was ever created. No ledger, no send: the claim is what keeps
 * a notification to one.
 */
async function ledgerFor(sr: any, userId: string, scopeKey: string) {
  const rows = asArray(
    await sr.entities.NotificationLedger.filter({ user_id: userId, scope_key: scopeKey }, { sort: "created_date", limit: 1 })
  );
  if (rows.length) return rows[0];
  try {
    return await sr.entities.NotificationLedger.create({
      user_id: userId,
      scope_key: scopeKey,
      claimed_keys: [],
    });
  } catch {
    return null;
  }
}

/** One atomic conditional append: true only for the caller that added the key. */
async function claimKey(sr: any, ledgerId: string, eventKey: string) {
  const result = await sr.entities.NotificationLedger.updateMany(
    { id: ledgerId, claimed_keys: { $nin: [eventKey] } },
    { $push: { claimed_keys: [eventKey] } }
  );
  return Number(result?.updated) === 1;
}

async function pruneLedger(sr: any, ledger: any) {
  const stale = keysToPrune(ledger?.claimed_keys);
  if (!stale.length) return;
  try {
    await sr.entities.NotificationLedger.updateMany(
      { id: ledger.id },
      { $pull: { claimed_keys: { $in: stale } }, $set: { pruned_at: new Date().toISOString() } }
    );
  } catch {
    // Pruning is housekeeping only; a failure never affects a send.
  }
}

function quietFrom(prefs: any, fallbackZone: string | null) {
  return {
    enabled: prefs?.quiet_hours_enabled === true,
    startHour: prefs?.quiet_start_hour ?? null,
    endHour: prefs?.quiet_end_hour ?? null,
    timeZone: prefs?.quiet_timezone || fallbackZone || "UTC",
    urgentDuringQuiet: prefs?.urgent_during_quiet === true,
  };
}

function expiresAtFor(decision: ReadingDecision, nowMs: number) {
  if (decision.category === "missing_readings") return nowMs + 15 * 60_000;
  return decision.sample.at + NOTIFICATION_FRESHNESS_MINUTES * 60_000;
}

interface SendContext {
  sr: any;
  req: Request;
  counters: Counters;
}

/** The recipient's own notification about their own readings. */
async function sendPersonal(
  ctx: SendContext,
  ownerId: string,
  decision: ReadingDecision,
  settings: any
): Promise<void> {
  const { sr, req, counters } = ctx;
  bump(counters, "evaluated");

  const prefs = await loadPersonalPreferences(sr, ownerId);
  if (!prefs) return bump(counters, "no_preferences");
  if (prefs.master_enabled !== true) return bump(counters, "off");
  if ((prefs.categories || {})[decision.category] !== true) return bump(counters, "category_off");

  const ledger = await ledgerFor(sr, ownerId, "self");
  if (!ledger) return bump(counters, "no_ledger");

  const timeZone = prefs.quiet_timezone || settings?.timezone || "UTC";
  const units = settings?.glucose_units || "mg/dL";
  const copy = buildNotificationCopy({
    category: decision.category,
    value: decision.sample?.value ?? null,
    units,
    readingAt: decision.sample?.at ?? null,
    timeZone,
    showDetails: prefs.show_health_details === true,
    durationMinutes: decision.durationMinutes ?? null,
  });

  const outcome = await dispatchNotification(
    {
      enabled: true,
      category: decision.category,
      ownerUserId: ownerId,
      recipientUserId: ownerId,
      sharedAccessId: null,
      audience: "self",
      episodeKey: decision.episodeKey,
      eventKey: notificationEventKey(decision.category, ownerId, ownerId, decision.episodeKey),
      occurredAtMs: decision.sample?.at ?? Date.now(),
      expiresAtMs: expiresAtFor(decision, Date.now()),
      copy,
      detailShown: prefs.show_health_details === true,
      destination: destinationFor("self"),
      quiet: quietFrom(prefs, settings?.timezone || null),
      permissionVersion: null,
    },
    {
      claim: (key) => claimKey(sr, ledger.id, key),
      createRecord: (row) => sr.entities.NotificationDelivery.create(row),
      updateRecord: (id, patch) => sr.entities.NotificationDelivery.update(id, patch),
      recheck: async () => {
        const fresh = await sr.entities.NotificationPreference.get(prefs.id).catch(() => null);
        if (!fresh) return { ok: false, reason: "preference_removed" };
        if (fresh.master_enabled !== true) return { ok: false, reason: "preference_off" };
        if ((fresh.categories || {})[decision.category] !== true) return { ok: false, reason: "category_off" };
        return { ok: true };
      },
      send: (message) => sr.integrations.Core.SendPushNotification(message),
      nowMs: Date.now(),
      absoluteUrl: (path) => `${appOrigin(req)}${path}`,
    }
  );

  bump(counters, outcome.status);
  if (outcome.reason) bump(counters, `reason:${outcome.reason}`);
  await pruneLedger(sr, ledger);
}

/**
 * One follower's notification about a person they follow.
 *
 * Both layers are required: the sharer permitted this category on this
 * relationship, and the follower opted into it. The relationship and both
 * preference records are re-read immediately before the send.
 */
async function sendFollower(
  ctx: SendContext,
  relationship: any,
  decision: ReadingDecision,
  settings: any
): Promise<void> {
  const { sr, req, counters } = ctx;
  const followerId = relationship.follower_user_id;
  if (!followerId) return bump(counters, "no_follower");

  const prefsRows = asArray(
    await sr.entities.FollowNotificationPreference.filter(
      { user_id: followerId, shared_access_id: relationship.id },
      { sort: "-created_date", limit: 1 }
    )
  );
  const prefs = prefsRows[0];
  if (!prefs) return bump(counters, "follower_no_preferences");
  if (prefs.master_enabled !== true) return bump(counters, "follower_off");

  const effective = effectiveFollowerCategories(relationship, prefs.categories);
  if (!effective[decision.category as Category]) return bump(counters, "follower_category_off");

  const ledger = await ledgerFor(sr, followerId, `follow:${relationship.id}`);
  if (!ledger) return bump(counters, "no_ledger");

  const timeZone = prefs.quiet_timezone || settings?.timezone || "UTC";
  const showDetails = prefs.show_health_details === true;
  const copy = buildNotificationCopy({
    category: decision.category,
    value: decision.sample?.value ?? null,
    units: settings?.glucose_units || "mg/dL",
    readingAt: decision.sample?.at ?? null,
    timeZone,
    showDetails,
    personName: showDetails ? relationship.sharer_display_name || null : null,
    durationMinutes: decision.durationMinutes ?? null,
  });

  const outcome = await dispatchNotification(
    {
      enabled: true,
      category: decision.category,
      ownerUserId: relationship.sharer_user_id,
      recipientUserId: followerId,
      sharedAccessId: relationship.id,
      audience: "follower",
      episodeKey: decision.episodeKey,
      eventKey: notificationEventKey(decision.category, relationship.sharer_user_id, followerId, decision.episodeKey),
      occurredAtMs: decision.sample?.at ?? Date.now(),
      expiresAtMs: expiresAtFor(decision, Date.now()),
      copy,
      detailShown: showDetails,
      destination: destinationFor("follower"),
      quiet: quietFrom(prefs, settings?.timezone || null),
      permissionVersion: Number(relationship.permission_version) || null,
    },
    {
      claim: (key) => claimKey(sr, ledger.id, key),
      createRecord: (row) => sr.entities.NotificationDelivery.create(row),
      updateRecord: (id, patch) => sr.entities.NotificationDelivery.update(id, patch),
      recheck: async () => {
        const freshRelationship = await sr.entities.SharedAccess.get(relationship.id).catch(() => null);
        if (!relationshipAllowsPush(freshRelationship, Date.now())) return { ok: false, reason: "access_revoked" };
        if (!sharerGrants(freshRelationship)[decision.category as Category]) {
          return { ok: false, reason: "grant_withdrawn" };
        }
        const freshPrefs = await sr.entities.FollowNotificationPreference.get(prefs.id).catch(() => null);
        if (!freshPrefs) return { ok: false, reason: "preference_removed" };
        if (freshPrefs.master_enabled !== true) return { ok: false, reason: "preference_off" };
        if ((freshPrefs.categories || {})[decision.category] !== true) return { ok: false, reason: "category_off" };
        return { ok: true };
      },
      send: (message) => sr.integrations.Core.SendPushNotification(message),
      nowMs: Date.now(),
      absoluteUrl: (path) => `${appOrigin(req)}${path}`,
    }
  );

  bump(counters, outcome.status);
  if (outcome.reason) bump(counters, `reason:${outcome.reason}`);
  await pruneLedger(sr, ledger);
}

/** Every active relationship for one sharer, evaluated in order. */
async function fanOutToFollowers(
  ctx: SendContext,
  ownerId: string,
  decision: ReadingDecision,
  settings: any
): Promise<void> {
  const relationships = asArray(
    await ctx.sr.entities.SharedAccess.filter({ sharer_user_id: ownerId, status: "active" }, { limit: 50 })
  );
  for (const relationship of relationships) {
    if (!relationshipAllowsPush(relationship, Date.now())) continue;
    if (!sharerGrants(relationship)[decision.category as Category]) continue;
    await sendFollower(ctx, relationship, decision, settings);
  }
}

/** Decide from the newest reading, then hand it to the recipient paths. */
async function evaluateOwner(
  ctx: SendContext,
  ownerId: string,
  options: { aboveMinutes: number | null; missingDelay: number | null; rows?: any[]; settings?: any }
): Promise<void> {
  const { sr } = ctx;
  const settings = options.settings ?? (await loadSettings(sr, ownerId));
  const rows = options.rows ?? (await loadReadings(sr, ownerId));
  const now = Date.now();

  const targetLow = Number(settings?.target_range_low);
  const targetHigh = Number(settings?.target_range_high);

  // Only the categories this person actually turned on can produce a send; the
  // decision itself still uses the app's own thresholds.
  const decision = decideReadingNotification({
    rows,
    nowMs: now,
    targetLow,
    targetHigh,
    aboveMinutes: options.aboveMinutes,
  });

  if (decision) {
    await sendPersonal(ctx, ownerId, decision, settings);
    await fanOutToFollowers(ctx, ownerId, decision, settings);
  }

  if (options.missingDelay != null) {
    const connectionRows = asArray(
      await sr.entities.DexcomConnection.filter({ created_by_id: ownerId }, { sort: "-created_at", limit: 1 })
    );
    const missing = decideMissingNotification({
      rows,
      nowMs: now,
      delayMinutes: options.missingDelay,
      connection: connectionRows[0] || null,
    });
    if (missing) {
      const missingDecision: ReadingDecision = {
        category: "missing_readings",
        episodeKey: missing.episodeKey,
        sample: missing.lastSample,
        durationMinutes: null,
      };
      await sendPersonal(ctx, ownerId, missingDecision, settings);
      await fanOutToFollowers(ctx, ownerId, missingDecision, settings);
    }
  }
}

function readChoice(value: unknown, choices: readonly number[]) {
  const n = Number(value);
  return choices.includes(n) ? n : null;
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
    const ctx: SendContext = { sr, req, counters: {} };

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

      const settings = await loadSettings(sr, ownerId);
      const prefs = await loadPersonalPreferences(sr, ownerId);

      // Cheap opt-out: with nothing enabled for this person and no relationship
      // that permits push, no reading history is even read.
      const personalOn =
        prefs?.master_enabled === true &&
        Object.values(prefs.categories || {}).some((value) => value === true);
      const relationships = asArray(
        await sr.entities.SharedAccess.filter({ sharer_user_id: ownerId, status: "active" }, { limit: 50 })
      );
      const anyGrant = relationships.some(
        (row: any) => relationshipAllowsPush(row, Date.now()) && Object.values(sharerGrants(row)).some(Boolean)
      );
      if (!personalOn && !anyGrant) {
        return ok({ mode: "reading", evaluated: 0, reason: "not_opted_in" });
      }

      const rows = await loadReadings(sr, ownerId);

      await evaluateOwner(ctx, ownerId, {
        aboveMinutes: readChoice(prefs?.above_range_minutes, ABOVE_RANGE_DURATION_CHOICES),
        missingDelay: null,
        rows,
        settings,
      });

      return ok({ mode: "reading", evaluated: 1, ...ctx.counters });
    }

    // ── The periodic sweep ───────────────────────────────────────────────
    // Never depends on a reading arriving: it is how a silent sensor is
    // noticed. Recipients with notifications off cost one query and nothing else.
    const personalPrefs = asArray(
      await sr.entities.NotificationPreference.filter({ master_enabled: true }, { limit: 500 })
    );

    const settingsCache = new Map<string, any>();
    const rowsCache = new Map<string, any[]>();

    for (const prefs of personalPrefs) {
      const ownerId = prefs.user_id || prefs.created_by_id;
      if (!ownerId) continue;
      const categoryOn = prefs.categories || {};
      if (!categoryOn.above_range && !categoryOn.missing_readings && !categoryOn.urgent_low && !categoryOn.below_range) {
        continue;
      }

      if (!settingsCache.has(ownerId)) settingsCache.set(ownerId, await loadSettings(sr, ownerId));
      if (!rowsCache.has(ownerId)) rowsCache.set(ownerId, await loadReadings(sr, ownerId));

      await evaluateOwner(ctx, ownerId, {
        aboveMinutes: readChoice(prefs.above_range_minutes, ABOVE_RANGE_DURATION_CHOICES),
        missingDelay: readChoice(prefs.missing_delay_minutes, MISSING_DELAY_CHOICES),
        rows: rowsCache.get(ownerId),
        settings: settingsCache.get(ownerId),
      });
    }

    // Followers whose own preferences are on, evaluated against the person they
    // follow. The relationship is re-checked here as well as before each send.
    const followPrefs = asArray(
      await sr.entities.FollowNotificationPreference.filter({ master_enabled: true }, { limit: 500 })
    );

    for (const prefs of followPrefs) {
      const followerId = prefs.user_id || prefs.created_by_id;
      if (!followerId) continue;
      const wantsMissing = (prefs.categories || {}).missing_readings === true;
      if (!wantsMissing) continue;

      const relationship = await sr.entities.SharedAccess.get(prefs.shared_access_id).catch(() => null);
      if (!relationshipAllowsPush(relationship, Date.now())) continue;
      if (relationship.follower_user_id !== followerId) continue;
      if (!sharerGrants(relationship).missing_readings) continue;

      const ownerId = relationship.sharer_user_id;
      if (!settingsCache.has(ownerId)) settingsCache.set(ownerId, await loadSettings(sr, ownerId));
      if (!rowsCache.has(ownerId)) rowsCache.set(ownerId, await loadReadings(sr, ownerId));

      const settings = settingsCache.get(ownerId);
      const rows = rowsCache.get(ownerId);
      const connectionRows = asArray(
        await sr.entities.DexcomConnection.filter({ created_by_id: ownerId }, { sort: "-created_at", limit: 1 })
      );
      const missing = decideMissingNotification({
        rows,
        nowMs: Date.now(),
        // The follower chose this delay themselves when they turned the category on.
        delayMinutes: readChoice(prefs.missing_delay_minutes, MISSING_DELAY_CHOICES),
        connection: connectionRows[0] || null,
      });
      if (!missing) continue;

      await sendFollower(
        ctx,
        relationship,
        {
          category: "missing_readings",
          episodeKey: missing.episodeKey,
          sample: missing.lastSample,
          durationMinutes: null,
        },
        settings
      );
    }

    return ok({ mode: "sweep", personal: personalPrefs.length, followers: followPrefs.length, ...ctx.counters });
  } catch (error: any) {
    console.error("[evaluateNotifications] failed:", error?.message || "unexpected error");
    return fail("server_error", 500);
  }
}