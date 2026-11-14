// Where a reminder meets the existing notification path.
//
// Nothing here invents a second delivery route: every push goes through
// dispatchNotification (../shared/notificationDispatch.ts), so it is claimed in
// the recipient's NotificationLedger, recorded as one NotificationDelivery row
// and sent once. A reminder is only ever addressed to the person who set it,
// so one send is one banner on one account.
//
// The rules — when it is due, what it says, what it may never say — live in the
// pure module ../shared/reminderSchedule.ts. This file only reads records and
// acts on them.

import { asArray } from "./sharingAccess.ts";
import { notificationEventKey, isHeldByQuietHours, type QuietHours } from "./notificationCore.ts";
import { dispatchNotification } from "./notificationDispatch.ts";
import { isBasalInsulinType } from "./glucoseSuperposition.ts";
import {
  REMINDER_CATEGORY,
  SENSOR_BODIES,
  SENSOR_DURATION_DAYS,
  SENSOR_REMINDER_TITLE,
  clockFireState,
  groupDueItems,
  mealFireState,
  mergedReminderCopy,
  reminderCopy,
  sensorStageDue,
  sensorStages,
  zonedParts,
} from "./reminderSchedule.ts";

export const REMINDER_DESTINATION = "/settings/notifications/reminders";

/** How far back a logged meal can still be the one a reminder is about. */
const MEAL_LOOKBACK_HOURS = 8;
/** How far back a logged basal can count as "today's". */
const BASAL_LOOKBACK_HOURS = 26;

interface SweepInput {
  sr: any;
  nowMs: number;
  absoluteUrl: (path: string) => string;
}

interface SweepCounters {
  reminders: number;
  merged: number;
  sensor: number;
  skipped: number;
}

/**
 * Every account that could have something due: one with an enabled reminder,
 * or one with a sensor session recorded (the three sensor prompts are not on
 * the page and are not switchable, but they only exist once a session exists).
 */
export async function runReminderSweep({ sr, nowMs, absoluteUrl }: SweepInput) {
  const counters: SweepCounters = { reminders: 0, merged: 0, sensor: 0, skipped: 0 };

  const reminderRows = asArray(await sr.entities.Reminder.list({ limit: 500 }));
  const settingsRows = asArray(await sr.entities.UserSettings.list({ limit: 500 }));

  const owners = new Set<string>();
  for (const row of reminderRows) {
    const id = row?.user_id || row?.created_by_id;
    if (id && row?.enabled === true) owners.add(id);
  }
  for (const row of settingsRows) {
    const id = row?.created_by_id || row?.user_id;
    if (id && row?.sensor_session_started_at && SENSOR_DURATION_DAYS[String(row?.cgm_model)]) owners.add(id);
  }

  for (const ownerId of owners) {
    const settings = settingsRows.find((row: any) => (row?.created_by_id || row?.user_id) === ownerId) || null;
    const prefs = asArray(await sr.entities.NotificationPreference.filter({ user_id: ownerId }, { limit: 1 }))[0] || null;

    // Quiet hours are the ones already set on the notifications page. A reminder
    // that asked to be skipped inside them is skipped, never held for later.
    const quiet: QuietHours | null = prefs?.quiet_hours_enabled === true
      ? {
        enabled: true,
        startHour: prefs.quiet_start_hour,
        endHour: prefs.quiet_end_hour,
        timeZone: prefs.quiet_timezone || settings?.timezone || "UTC",
        urgentDuringQuiet: false,
      }
      : null;

    const ledger = await ensureLedger(sr, ownerId);
    const own = reminderRows.filter(
      (row: any) => (row?.user_id || row?.created_by_id) === ownerId && row?.enabled === true
    );

    await sendOwnerReminders({ sr, ownerId, reminders: own, quiet, ledger, nowMs, absoluteUrl, counters });
    await sendSensorReminders({ sr, ownerId, settings, ledger, nowMs, absoluteUrl, counters });
  }

  return counters;
}

async function sendOwnerReminders({ sr, ownerId, reminders, quiet, ledger, nowMs, absoluteUrl, counters }: {
  sr: any; ownerId: string; reminders: any[]; quiet: QuietHours | null; ledger: any;
  nowMs: number; absoluteUrl: (path: string) => string; counters: SweepCounters;
}) {
  if (!reminders.length) return;

  const basalDoses = asArray(await sr.entities.InsulinDose.filter(
    { administered_at: { $gte: new Date(nowMs - BASAL_LOOKBACK_HOURS * 3600_000).toISOString() } },
    { sort: "-administered_at", limit: 50 }
  )).filter((dose: any) => (dose?.created_by_id || dose?.user_id) === ownerId);

  const meals = asArray(await sr.entities.CarbEntry.filter(
    { consumed_at: { $gte: new Date(nowMs - MEAL_LOOKBACK_HOURS * 3600_000).toISOString() } },
    { sort: "-consumed_at", limit: 50 }
  )).filter((meal: any) => (meal?.created_by_id || meal?.user_id) === ownerId && meal?.classification !== "rescue_carbs");

  const latestMeal = meals[0] || null;

  const due: Array<{ reminder: any; kind: "first" | "retry"; dateKey: string; scheduledAtMs: number; copy: { title: string; body: string } }> = [];

  for (const reminder of reminders) {
    const type = String(reminder?.type || "");
    let firstDue = false;
    let retryDue = false;
    let dateKey = "";
    let scheduledAtMs = nowMs;
    let copy: { title: string; body: string } = { title: "", body: "" };

    if (type === "meal") {
      if (!latestMeal) continue;
      const mealAtMs = Date.parse(latestMeal.consumed_at);
      if (!Number.isFinite(mealAtMs)) continue;
      const state = mealFireState(reminder, mealAtMs, nowMs);
      firstDue = state.firstDue;
      retryDue = state.retryDue;
      dateKey = state.dateKey;
      scheduledAtMs = state.scheduledAtMs;
      if (!firstDue && !retryDue) continue;
      // The condition behind the prompt, checked before both the first send and
      // the retry: once that meal has been reviewed there is nothing to say.
      if (await mealReviewedSince(sr, ownerId, latestMeal, mealAtMs)) {
        counters.skipped += 1;
        continue;
      }
      copy = reminderCopy(reminder, mealAtMs);
    } else {
      const state = clockFireState(reminder, nowMs);
      firstDue = state.firstDue;
      retryDue = state.retryDue;
      dateKey = state.dateKey;
      scheduledAtMs = state.scheduledAtMs;
      if (!firstDue && !retryDue) continue;
      if (type === "basal" && basalLoggedToday(basalDoses, reminder?.timezone, dateKey)) {
        counters.skipped += 1;
        continue;
      }
      copy = reminderCopy(reminder);
    }

    if (reminder?.skip_quiet !== false && isHeldByQuietHours(REMINDER_CATEGORY, quiet, nowMs)) {
      // Skipped, not stacked up for later: the day is closed either way, so the
      // retry cannot resurface after quiet hours have ended.
      await markSent(sr, reminder, firstDue ? "first" : "retry", dateKey);
      counters.skipped += 1;
      continue;
    }

    due.push({
      reminder,
      kind: firstDue ? "first" : "retry",
      dateKey,
      scheduledAtMs,
      copy,
    });
  }

  // Two (or three) reminders landing within ten minutes arrive as one push.
  for (const group of groupDueItems(due)) {
    const members = group;
    const episodeKey = members.map((item) => `${item.reminder.id}:${item.dateKey}:${item.kind}`).join("+");
    const eventKey = notificationEventKey(REMINDER_CATEGORY, ownerId, ownerId, episodeKey);
    const copy = members.length > 1
      ? mergedReminderCopy(members.map((item) => item.copy.title))
      : members[0].copy;

    const outcome = await dispatchNotification(
      {
        enabled: true,
        category: REMINDER_CATEGORY,
        ownerUserId: ownerId,
        recipientUserId: ownerId,
        sharedAccessId: null,
        audience: "self",
        episodeKey,
        eventKey,
        occurredAtMs: members[0].scheduledAtMs,
        expiresAtMs: nowMs + 60_000,
        copy,
        detailShown: false,
        destination: REMINDER_DESTINATION,
        quiet: null,
        // Whether it is still the thing the person asked for, re-read moments
        // before the send. A reminder switched off in the meantime goes quiet.
        coveredEvents: members.map((item) => ({
          category: REMINDER_CATEGORY,
          episodeKey: `${item.reminder.id}:${item.dateKey}:${item.kind}`,
        })),
      },
      dispatchDeps({
        sr, ownerId, ledger, nowMs, absoluteUrl,
        recheck: async () => {
          const fresh = asArray(await sr.entities.Reminder.filter(
            { id: { $in: members.map((item) => item.reminder.id) } },
            { limit: 5 }
          ));
          const stillOn = fresh.length === members.length && fresh.every((row: any) => row?.enabled === true);
          return stillOn ? { ok: true } : { ok: false, reason: "reminder_off" };
        },
      })
    );

    if (outcome.status === "duplicate") continue;
    for (const item of members) await markSent(sr, item.reminder, item.kind, item.dateKey);
    counters.reminders += 1;
    if (members.length > 1) counters.merged += 1;
  }
}

/**
 * 24 hours before the recorded session ends, at expiry, and 12 hours after it
 * with no new session started. These are never held by quiet hours, and they
 * exist only while a session start time is on file.
 */
async function sendSensorReminders({ sr, ownerId, settings, ledger, nowMs, absoluteUrl, counters }: {
  sr: any; ownerId: string; settings: any; ledger: any;
  nowMs: number; absoluteUrl: (path: string) => string; counters: SweepCounters;
}) {
  const startedAtMs = Date.parse(settings?.sensor_session_started_at);
  if (!Number.isFinite(startedAtMs)) return;

  for (const stage of sensorStages(startedAtMs, settings?.cgm_model)) {
    if (!sensorStageDue(stage.atMs, nowMs)) continue;
    const episodeKey = `sensor:${startedAtMs}:${stage.stage}`;
    const eventKey = notificationEventKey(REMINDER_CATEGORY, ownerId, ownerId, episodeKey);

    const outcome = await dispatchNotification(
      {
        enabled: true,
        category: REMINDER_CATEGORY,
        ownerUserId: ownerId,
        recipientUserId: ownerId,
        sharedAccessId: null,
        audience: "self",
        episodeKey,
        eventKey,
        occurredAtMs: stage.atMs,
        expiresAtMs: nowMs + 60_000,
        copy: { title: SENSOR_REMINDER_TITLE, body: SENSOR_BODIES[stage.stage] },
        detailShown: false,
        destination: REMINDER_DESTINATION,
        // A sensor prompt may pass through quiet hours, so no window is applied.
        quiet: null,
        coveredEvents: [{ category: REMINDER_CATEGORY, episodeKey }],
      },
      dispatchDeps({
        sr, ownerId, ledger, nowMs, absoluteUrl,
        recheck: async () => {
          const fresh = asArray(await sr.entities.UserSettings.filter({ id: settings.id }, { limit: 1 }))[0];
          const sameSession =
            Date.parse(fresh?.sensor_session_started_at) === startedAtMs &&
            String(fresh?.cgm_model) === String(settings?.cgm_model);
          return sameSession ? { ok: true } : { ok: false, reason: "session_changed" };
        },
      })
    );

    if (outcome.status !== "duplicate") counters.sensor += 1;
  }
}

function dispatchDeps({ sr, ownerId, ledger, nowMs, absoluteUrl, recheck }: {
  sr: any; ownerId: string; ledger: any; nowMs: number;
  absoluteUrl: (path: string) => string;
  recheck: () => Promise<{ ok: boolean; reason?: string }>;
}) {
  return {
    nowMs,
    absoluteUrl,
    recheck,
    // The same atomic claim the reading alerts use: one caller wins a key.
    claim: async (key: string) => {
      const result = await sr.entities.NotificationLedger.updateMany(
        { id: ledger.id, user_id: ownerId, scope_key: "self", claimed_keys: { $nin: [key] } },
        { $push: { claimed_keys: key } }
      );
      return Number(result?.updated) === 1;
    },
    createRecord: (row: Record<string, unknown>) => sr.entities.NotificationDelivery.create(row),
    updateRecord: (id: string, patch: Record<string, unknown>) => sr.entities.NotificationDelivery.update(id, patch),
    alreadySent: async (key: string) =>
      asArray(await sr.entities.NotificationDelivery.filter(
        { event_key: key, status: { $in: ["submitted", "unknown", "claimed"] } },
        { limit: 1 }
      )).length > 0,
    releaseClaim: async (key: string) => {
      await sr.entities.NotificationLedger.updateMany(
        { id: ledger.id, claimed_keys: key },
        { $pull: { claimed_keys: key } }
      );
    },
  };
}

async function ensureLedger(sr: any, ownerId: string) {
  const held = asArray(await sr.entities.NotificationLedger.filter(
    { user_id: ownerId, scope_key: "self" },
    { limit: 1 }
  ));
  if (held.length) return held[0];
  return await sr.entities.NotificationLedger.create({ user_id: ownerId, scope_key: "self", claimed_keys: [] });
}

async function markSent(sr: any, reminder: any, kind: "first" | "retry", dateKey: string) {
  if (!reminder?.id) return;
  const patch = kind === "first"
    ? { last_sent_date: dateKey, last_retry_sent_date: null }
    : { last_retry_sent_date: dateKey };
  await sr.entities.Reminder.update(reminder.id, patch);
}

/** Whether a basal was already logged on this reminder's own local day. */
function basalLoggedToday(doses: any[], timeZone: unknown, dateKey: string): boolean {
  return (Array.isArray(doses) ? doses : []).some((dose) => {
    const at = Date.parse(dose?.administered_at);
    if (!Number.isFinite(at)) return false;
    if (!isBasalInsulinType(String(dose?.insulin_type || ""))) return false;
    return zonedParts(at, timeZone).dateKey === dateKey;
  });
}

/**
 * Whether that meal has already been reviewed — either its analysis is complete
 * or a reflection has been written since it was logged. Anything less than a
 * record is not treated as reviewed, so the prompt is never withheld on a guess.
 */
async function mealReviewedSince(sr: any, ownerId: string, meal: any, mealAtMs: number): Promise<boolean> {
  if (meal?.id) {
    const analyses = asArray(await sr.entities.MealResponseAnalysis.filter(
      { meal_log_id: meal.id, analysis_status: "complete" },
      { limit: 1 }
    ));
    if (analyses.length) return true;
  }
  const reflections = asArray(await sr.entities.JournalEntry.filter(
    { created_by_id: ownerId, entry_date: { $gte: new Date(mealAtMs).toISOString() } },
    { limit: 1 }
  ));
  return reflections.length > 0;
}