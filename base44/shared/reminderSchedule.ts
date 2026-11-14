// Reminder rules: when a reminder is due, what it says, and what it may never say.
//
// Everything here is pure — no database, no clock, no push. The scheduler
// (reminderDelivery.ts) reads the records, calls these functions, and sends
// what they return; the tests in __tests__/reminderSchedule.test.mjs hold both
// the timing rules and the copy to account.
//
// Copy rules, enforced by those tests: a reminder never names a dose, a unit,
// an injection, a glucose value or a threshold. A reminder is a prompt the
// person wrote or approved, never advice, and it never reacts to a reading.

export const REMINDER_TYPES = ["basal", "meal", "custom"] as const;
export type ReminderType = (typeof REMINDER_TYPES)[number];

export const REMINDER_CATEGORY = "reminder";

/** One basal and one meal row per account, and no more than three custom ones. */
export const MAX_CUSTOM_REMINDERS = 3;
export const MAX_REMINDER_NAME = 40;

/** The meal-review delay choices, in minutes. */
export const MEAL_DELAY_CHOICES = [90, 120, 180] as const;

/** How long after its moment a reminder may still be sent by a 5-minute sweep. */
export const FIRE_WINDOW_MINUTES = 15;

/** The single retry, measured from the reminder's own moment. */
export const RETRY_MINUTES = 15;

/** Anything due within this of another is sent as one push. */
export const MERGE_WINDOW_MINUTES = 10;

/** Sensor wear time, mirroring src/lib/sensorSession.js. */
export const SENSOR_DURATION_DAYS: Record<string, number> = { G6: 10, G7: 10, G7_15: 15 };

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
/** Display order: Monday first, Sunday last. */
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const REMINDER_DEFAULTS = {
  basal: { name: "Basal log", days: ALL_DAYS, time_minutes: 21 * 60, delay_minutes: null },
  meal: { name: "Meal review", days: [], time_minutes: 0, delay_minutes: 120 },
  custom: { name: "", days: [1, 3, 5], time_minutes: 8 * 60, delay_minutes: null },
};

export const REMINDER_NOTES = {
  basal: "Skipped when a basal is already logged that day",
  meal: "Skipped once you have reviewed that meal",
  sensor: "Sensor session reminders arrive on their own and can't be changed.",
};

export const BASAL_BODY = "No basal logged today. Is it time?";
export const SENSOR_REMINDER_TITLE = "Sensor session";
export const SENSOR_BODIES: Record<string, string> = {
  warning: "Your sensor session ends tomorrow",
  ended: "Your session has ended",
  overdue: "No session running since yesterday",
};

const DOW_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

export function isValidTimeZone(value: unknown): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The local date, day of week and minute of day in one IANA zone. */
export function zonedParts(nowMs: number, timeZone: unknown) {
  const zone = isValidTimeZone(timeZone) ? String(timeZone) : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  }).formatToParts(new Date(nowMs));
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  const hour = Number(get("hour")) % 24;
  return {
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: hour * 60 + Number(get("minute")),
    dow: DOW_INDEX[get("weekday")] ?? 0,
  };
}

/** "9:00 PM" — the exact time, never rounded or described. */
export function formatReminderClock(minutes: unknown): string {
  const total = ((Math.round(Number(minutes) || 0) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(total / 60);
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(total % 60).padStart(2, "0")} ${suffix}`;
}

/** The meal's own clock time in the reminder's zone. */
export function formatMealClock(mealAtMs: number, timeZone: unknown): string {
  const zone = isValidTimeZone(timeZone) ? String(timeZone) : "UTC";
  return new Intl.DateTimeFormat("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).format(new Date(mealAtMs));
}

export function normalizeDays(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<number>();
  for (const entry of value) {
    const day = Number(entry);
    if (Number.isInteger(day) && day >= 0 && day <= 6) seen.add(day);
  }
  return [...seen].sort((a, b) => a - b);
}

export function daysLabel(days: unknown): string {
  const list = normalizeDays(days);
  if (list.length === 7) return "Daily";
  if (!list.length) return "No day chosen";
  // Ordered the way the chips are drawn, Sunday first, so the line under a
  // reminder and the chips in its sheet can never disagree.
  return list.map((day) => DAY_SHORT[day]).join(", ");
}

export function mealDelayLabel(delayMinutes: unknown): string {
  const delay = Number(delayMinutes) || 120;
  if (delay === 120) return "2 hours after you log a meal";
  if (delay === 180) return "3 hours after you log a meal";
  if (delay === 90) return "90 minutes after you log a meal";
  if (delay % 60 === 0) return `${delay / 60} hours after you log a meal`;
  return `${delay} minutes after you log a meal`;
}

/** The one timing line shown under a reminder's name. */
export function reminderTimingLine(reminder: any): string {
  if (reminder?.type === "meal") return mealDelayLabel(reminder?.delay_minutes);
  return `${daysLabel(reminder?.days)} at ${formatReminderClock(reminder?.time_minutes)}`;
}

/** How many switchable reminders are on, and the value shown on the row. */
export function enabledReminderCount(reminders: any[]): number {
  return (Array.isArray(reminders) ? reminders : []).filter((row) => row?.enabled === true).length;
}

export function reminderCountLabel(reminders: any[]): string {
  const count = enabledReminderCount(reminders);
  return count > 0 ? `${count} on` : "Off";
}

/**
 * The push a reminder produces. The title is the reminder's own name; the body
 * is one plain line, with no number of units and no reaction to any reading.
 */
export function reminderCopy(reminder: any, mealAtMs?: number | null): { title: string; body: string } {
  const type = String(reminder?.type || "custom");
  if (type === "basal") return { title: "Basal log", body: BASAL_BODY };
  if (type === "meal") {
    const clock = Number.isFinite(Number(mealAtMs)) ? formatMealClock(Number(mealAtMs), reminder?.timezone) : null;
    return { title: "Meal review", body: clock ? `Your ${clock} meal is ready to review` : "A meal is ready to review" };
  }
  const name = String(reminder?.name || "").trim();
  return { title: name, body: name };
}

/** Two (or three) reminders landing within ten minutes arrive as one push. */
export function mergedReminderCopy(names: string[]): { title: string; body: string } {
  const list = (Array.isArray(names) ? names : []).map((name) => String(name || "").trim()).filter(Boolean);
  const title = list.length >= 3 ? "Three reminders" : "Two reminders";
  return { title, body: list.join(", ") };
}

/** The first send is due, or the one retry, for a reminder with a clock time. */
export function clockFireState(reminder: any, nowMs: number) {
  const now = zonedParts(nowMs, reminder?.timezone);
  const days = normalizeDays(reminder?.days);
  const onDay = days.length ? days.includes(now.dow) : true;
  const target = Number(reminder?.time_minutes ?? 0);
  const sentToday = reminder?.last_sent_date === now.dateKey;
  const retriedToday = reminder?.last_retry_sent_date === now.dateKey;
  const elapsed = now.minutes - target;
  return {
    dateKey: now.dateKey,
    minutes: now.minutes,
    scheduledAtMs: nowMs - elapsed * 60_000,
    firstDue: onDay && !sentToday && elapsed >= 0 && elapsed < FIRE_WINDOW_MINUTES,
    retryDue:
      onDay && sentToday && !retriedToday &&
      now.minutes >= target + RETRY_MINUTES &&
      now.minutes - target - RETRY_MINUTES < FIRE_WINDOW_MINUTES,
  };
}

/**
 * A meal review reminder belongs to ONE meal, never to a weekly schedule.
 *
 * Its moment is written on the meal itself (reminder_at, from that meal's own
 * consumed_at plus the chosen delay), so the settings row only carries whether
 * the feature is on and how long the delay is. There is one prompt, then one
 * retry fifteen minutes after that prompt was actually sent, and nothing else.
 */
export function mealReminderAtMs(meal: any): number {
  const at = Date.parse(String(meal?.reminder_at ?? ""));
  return Number.isFinite(at) ? at : Number.NaN;
}

export function mealReviewFireState(meal: any, nowMs: number) {
  const scheduledAtMs = mealReminderAtMs(meal);
  const state = String(meal?.reminder_state || "none");
  const sentAtMs = Date.parse(String(meal?.reminder_sent_at ?? ""));
  const sinceScheduled = nowMs - scheduledAtMs;
  const sinceSent = nowMs - sentAtMs;
  return {
    scheduledAtMs,
    firstDue:
      state === "scheduled" && Number.isFinite(scheduledAtMs) &&
      sinceScheduled >= 0 && sinceScheduled < FIRE_WINDOW_MINUTES * 60_000,
    retryDue:
      state === "sent" && Number.isFinite(sentAtMs) &&
      sinceSent >= RETRY_MINUTES * 60_000 &&
      sinceSent - RETRY_MINUTES * 60_000 < FIRE_WINDOW_MINUTES * 60_000,
  };
}

/** Opening this link lands on the home screen with that meal's review open. */
export function mealReviewDestination(mealId: unknown): string {
  const id = String(mealId ?? "").trim();
  return id ? `/?meal=${encodeURIComponent(id)}` : "/";
}

/**
 * The three sensor prompts, measured from the session that is actually
 * recorded. Nothing exists here without a session start time, and the third
 * only makes sense while that same session is still the current one.
 */
export function sensorStages(startedAtMs: number, modelId: unknown) {
  const days = SENSOR_DURATION_DAYS[String(modelId)];
  if (!days || !Number.isFinite(startedAtMs)) return [] as Array<{ stage: string; atMs: number }>;
  const endMs = startedAtMs + days * 24 * 60 * 60 * 1000;
  return [
    { stage: "warning", atMs: endMs - 24 * 60 * 60 * 1000 },
    { stage: "ended", atMs: endMs },
    { stage: "overdue", atMs: endMs + 12 * 60 * 60 * 1000 },
  ];
}

export function sensorStageDue(atMs: number, nowMs: number): boolean {
  return nowMs >= atMs && nowMs - atMs < FIRE_WINDOW_MINUTES * 60_000;
}

/** Free text, whitespace-collapsed, never templated, capped at 40 characters. */
export function cleanReminderName(value: unknown): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_REMINDER_NAME);
}

/**
 * What may be stored, from what the sheet submitted. Anything unrecognised is
 * refused rather than silently corrected, so a saved reminder always matches
 * the row that was shown.
 */
export function reminderPayload(input: any) {
  const type = String(input?.type || "");
  if (!(REMINDER_TYPES as readonly string[]).includes(type)) return { error: "unknown_type" as const };
  const enabled = input?.enabled === true;
  const skip_quiet = input?.skip_quiet !== false;
  const timezone = isValidTimeZone(input?.timezone) ? String(input.timezone) : "UTC";

  if (type === "meal") {
    const delay = Number(input?.delay_minutes);
    if (!(MEAL_DELAY_CHOICES as readonly number[]).includes(delay)) return { error: "unknown_delay" as const };
    return {
      value: {
        type, name: "Meal review", days: [], time_minutes: 0,
        delay_minutes: delay, enabled, skip_quiet, timezone,
      },
    };
  }

  const days = normalizeDays(input?.days);
  if (!days.length) return { error: "no_days" as const };
  const minutes = Number(input?.time_minutes);
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) return { error: "bad_time" as const };
  const name = type === "basal" ? "Basal log" : cleanReminderName(input?.name);
  if (type === "custom" && !name) return { error: "name_required" as const };
  return {
    value: {
      type, name, days, time_minutes: minutes,
      delay_minutes: null, enabled, skip_quiet, timezone,
    },
  };
}

/** The server-side cap: one basal, one meal, three custom. */
export function createLimitError(type: unknown, existing: any[]): string | null {
  const ofType = (Array.isArray(existing) ? existing : []).filter((row) => row?.type === type);
  if (type === "custom") return ofType.length >= MAX_CUSTOM_REMINDERS ? "custom_limit" : null;
  return ofType.length >= 1 ? "already_exists" : null;
}

/** Groups what is due now: anything within ten minutes of the first is one push. */
export function groupDueItems<T extends { scheduledAtMs: number }>(items: T[]): T[][] {
  const sorted = [...(Array.isArray(items) ? items : [])].sort((a, b) => a.scheduledAtMs - b.scheduledAtMs);
  const groups: T[][] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last && item.scheduledAtMs - last[0].scheduledAtMs < MERGE_WINDOW_MINUTES * 60_000 && last.length < 3) {
      last.push(item);
    } else {
      groups.push([item]);
    }
  }
  return groups;
}