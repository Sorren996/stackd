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
  mealReviewDestination,
  mealReviewFireState,
  mealReviewSendDecision,
  mergedReminderCopy,
  reminderCopy,
  sensorStageDue,
  sensorStages,
  zonedParts,
} from "./reminderSchedule.ts";

export const REMINDER_DESTINATION = "/settings/notifications/reminders";

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

/** One reminder that is due now, whichever kind it is. */
interface DueItem {
  kind: "first" | "retry";
  /** Stable identity: the reminder row plus its day, or the meal plus its id. */
  key: string;
  scheduledAtMs: number;
  copy: { title: string; body: string };
  destination: string;
  reminder: any;
  /** The meal this prompt is about, or null for a clock reminder. */
  mealId: string | null;
  dateKey: string;
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
  // A meal's own review reminder lives on the meal, so its owner is in this
  // sweep even when nothing else is switched on.
  const heldMealReviews = asArray(await sr.entities.CarbEntry.filter(
    { reminder_state: { $in: ["scheduled", "sent"] } },
    { sort: "-consumed_at", limit: 200 }
  ));
  for (const row of heldMealReviews) {
    const id = row?.created_by_id || row?.user_id;
    if (id) owners.add(id);
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
  // Meal review reminders are kept ON THE MEAL they belong to, one per meal that
  // asked for one. The settings row carries only whether the feature is on and
  // how long the delay is — a meal never has a weekly schedule to consult.
  const heldMealReviews = asArray(await sr.entities.CarbEntry.filter(
    { created_by_id: ownerId, reminder_state: { $in: ["scheduled", "sent"] } },
    { sort: "-consumed_at", limit: 20 }
  ));

  if (!reminders.length) {
    // Meal review is off, so any promise it still holds is closed in silence.
    for (const meal of heldMealReviews) await cancelMealReminder(sr, meal.id);
    return;
  }

  const basalDoses = asArray(await sr.entities.InsulinDose.filter(
    { administered_at: { $gte: new Date(nowMs - BASAL_LOOKBACK_HOURS * 3600_000).toISOString() } },
    { sort: "-administered_at", limit: 50 }
  )).filter((dose: any) => (dose?.created_by_id || dose?.user_id) === ownerId);

  const mealReminder = reminders.find((row: any) => String(row?.type) === "meal") || null;
  const mealReviewRows = mealReminder ? heldMealReviews : [];
  if (!mealReminder) {
    // Off means off: nothing already promised by this feature may still fire.
    for (const meal of heldMealReviews) await cancelMealReminder(sr, meal.id);
  }

  const due: DueItem[] = [];

  for (const meal of mealReviewRows) {
    const state = mealReviewFireState(meal, nowMs);
    if (!state.firstDue && !state.retryDue) continue;
    const mealAtMs = Date.parse(String(meal?.consumed_at ?? ""));
    if (!Number.isFinite(mealAtMs)) continue;
    // The meal itself is re-read here, at the moment the prompt would go out —
    // never the copy this sweep started with. A meal the person has reviewed or
    // dismissed goes quiet, and so does one that has since been deleted.
    const freshMeal = await readMealForSend(sr, meal.id);
    const decision = mealReviewSendDecision(freshMeal, state.firstDue ? "first" : "retry");
    if (!decision.send) {
      if (freshMeal) await cancelMealReminder(sr, freshMeal.id);
      counters.skipped += 1;
      continue;
    }
    if (mealReminder?.skip_quiet !== false && isHeldByQuietHours(REMINDER_CATEGORY, quiet, nowMs)) {
      // Skipped inside quiet hours, never deferred to after them.
      await cancelMealReminder(sr, meal.id);
      counters.skipped += 1;
      continue;
    }
    due.push({
      kind: state.firstDue ? "first" : "retry",
      key: `meal:${meal.id}`,
      scheduledAtMs: state.scheduledAtMs,
      copy: reminderCopy(mealReminder, mealAtMs),
      destination: mealReviewDestination(meal.id),
      reminder: mealReminder,
      mealId: String(meal.id),
      dateKey: "",
    });
  }

  for (const reminder of reminders) {
    const type = String(reminder?.type || "");
    // The meal row is expressed per meal above, so it has no clock of its own.
    if (type === "meal") continue;

    const state = clockFireState(reminder, nowMs);
    if (!state.firstDue && !state.retryDue) continue;
    if (type === "basal" && basalLoggedToday(basalDoses, reminder?.timezone, state.dateKey)) {
      counters.skipped += 1;
      continue;
    }

    if (reminder?.skip_quiet !== false && isHeldByQuietHours(REMINDER_CATEGORY, quiet, nowMs)) {
      // Skipped, not stacked up for later: the day is closed either way, so the
      // retry cannot resurface after quiet hours have ended.
      await markSent(sr, reminder, state.firstDue ? "first" : "retry", state.dateKey);
      counters.skipped += 1;
      continue;
    }

    due.push({
      reminder,
      kind: state.firstDue ? "first" : "retry",
      key: `${reminder.id}:${state.dateKey}`,
      scheduledAtMs: state.scheduledAtMs,
      copy: reminderCopy(reminder),
      destination: REMINDER_DESTINATION,
      mealId: null,
      dateKey: state.dateKey,
    });
  }

  // Two (or three) reminders landing within ten minutes arrive as one push.
  for (const group of groupDueItems(due)) {
    const members = group;
    const episodeKey = members.map((item) => `${item.key}:${item.kind}`).join("+");
    // One destination when every member opens the same place; a merged push
    // that spans different places simply opens the home screen.
    const destination = members.every((item) => item.destination === members[0].destination)
      ? members[0].destination
      : "/";
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
        destination,
        quiet: null,
        // Whether it is still the thing the person asked for, re-read moments
        // before the send. A reminder switched off in the meantime goes quiet.
        coveredEvents: members.map((item) => ({
          category: REMINDER_CATEGORY,
          episodeKey: `${item.key}:${item.kind}`,
        })),
      },
      dispatchDeps({
        sr, ownerId, ledger, nowMs, absoluteUrl,
        recheck: async () => {
          const clockIds = members.filter((item) => !item.mealId).map((item) => item.reminder.id);
          if (clockIds.length) {
            const fresh = asArray(await sr.entities.Reminder.filter({ id: { $in: clockIds } }, { limit: 5 }));
            const stillOn = fresh.length === clockIds.length && fresh.every((row: any) => row?.enabled === true);
            if (!stillOn) return { ok: false, reason: "reminder_off" };
          }
          const mealIds = members.filter((item) => item.mealId).map((item) => String(item.mealId));
          if (mealIds.length) {
            // The feature must still be on, and every meal must still be waiting
            // for its own prompt — an undone or reviewed meal goes quiet.
            const mealRows = asArray(await sr.entities.Reminder.filter(
              { created_by_id: ownerId, type: "meal" },
              { limit: 1 }
            ));
            if (mealRows[0]?.enabled !== true) return { ok: false, reason: "meal_review_off" };
            const meals = asArray(await sr.entities.CarbEntry.filter({ id: { $in: mealIds } }, { limit: 5 }));
            const waiting =
              meals.length === mealIds.length &&
              meals.every((meal: any) => meal?.reminder_state === "scheduled" || meal?.reminder_state === "sent");
            if (!waiting) return { ok: false, reason: "meal_reminder_cancelled" };
            // Read again seconds before the send, for the same reason the retry
            // is: a review opened or settled in the meantime is not chased.
            for (const item of members.filter((member) => member.mealId)) {
              const freshMeal = meals.find((meal: any) => String(meal?.id) === String(item.mealId)) || null;
              const decision = mealReviewSendDecision(freshMeal, item.kind);
              if (!decision.send) return { ok: false, reason: decision.reason };
            }
          }
          return { ok: true };
        },
      })
    );

    if (outcome.status === "duplicate") continue;
    for (const item of members) {
      if (item.mealId) await markMealReminderSent(sr, item.mealId, item.kind, nowMs);
      else await markSent(sr, item.reminder, item.kind, item.dateKey);
    }
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
    // The one push transport, the same integration the reading alerts use.
    // Without it a reminder was claimed and recorded but never handed to the
    // push service, so it was stored as transport_unknown and nothing arrived.
    send: (message: { user_id: string; title: string; content: string; action_url: string }) =>
      sr.integrations.Core.SendPushNotification(message),
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

/**
 * The meal's own state after a send. The first prompt moves it to "sent" and
 * records when, so the single retry is measured fifteen minutes from that
 * moment rather than from a sweep that may have run late. The retry itself
 * needs no further mark: its ledger claim is what makes it happen once.
 */
async function markMealReminderSent(sr: any, mealId: string, kind: "first" | "retry", nowMs: number) {
  if (kind === "retry") return;
  await sr.entities.CarbEntry.update(mealId, {
    reminder_state: "sent",
    reminder_sent_at: new Date(nowMs).toISOString(),
  });
}

/** Quietly closes a meal's reminder without sending anything. */
async function cancelMealReminder(sr: any, mealId: string) {
  if (!mealId) return;
  await sr.entities.CarbEntry.update(mealId, { reminder_state: "cancelled" });
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
 * That meal's own record, freshly read for one send decision. Null means the
 * record is gone, which is itself the answer: nothing is owed to a deleted meal.
 */
async function readMealForSend(sr: any, mealId: any): Promise<any | null> {
  if (!mealId) return null;
  const rows = asArray(await sr.entities.CarbEntry.filter({ id: String(mealId) }, { limit: 1 }));
  return rows[0] || null;
}