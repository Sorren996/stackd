// Reminder wording and defaults, mirrored from base44/shared/reminderSchedule.ts
// so the row under a switch reads exactly what the scheduler will do.
//
// Nothing here names a dose, a unit or a reading: a reminder is a prompt the
// person set, never advice, and it never reacts to a glucose value.

export const REMINDER_TYPES = ["basal", "meal", "custom"];
export const MAX_CUSTOM_REMINDERS = 3;
export const MAX_REMINDER_NAME = 40;
export const MEAL_DELAY_CHOICES = [90, 120, 180];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

/** Chips are shown Sunday-first, matching the stored 0–6 order. */
export const DAY_CHIPS = [
  { value: 0, label: "S", name: "Sunday" },
  { value: 1, label: "M", name: "Monday" },
  { value: 2, label: "T", name: "Tuesday" },
  { value: 3, label: "W", name: "Wednesday" },
  { value: 4, label: "T", name: "Thursday" },
  { value: 5, label: "F", name: "Friday" },
  { value: 6, label: "S", name: "Saturday" },
];

const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];


/** What each type looks like before it is first saved. Off, always. */
export const DEFAULT_ROWS = {
  basal: {
    type: "basal", name: "Basal log", days: ALL_DAYS, time_minutes: 21 * 60,
    delay_minutes: null, enabled: false, skip_quiet: true,
  },
  meal: {
    type: "meal", name: "Meal review", days: [], time_minutes: 0,
    delay_minutes: 120, enabled: false, skip_quiet: true,
  },
  custom: {
    type: "custom", name: "", days: [1, 3, 5], time_minutes: 8 * 60,
    delay_minutes: null, enabled: false, skip_quiet: true,
  },
};

export const REMINDER_NOTES = {
  basal: "Skipped when a basal is already logged that day",
  meal: "Skipped once you have reviewed that meal",
  sensor: "Sensor session reminders arrive on their own and can't be changed.",
};

export const REMINDER_TITLES = { basal: "Basal log", meal: "Meal review", custom: "Reminder" };

/** "9:00 PM" — the exact time, never rounded. */
export function formatReminderClock(minutes) {
  const total = ((Math.round(Number(minutes) || 0) % 1440) + 1440) % 1440;
  const hour24 = Math.floor(total / 60);
  const suffix = hour24 < 12 ? "AM" : "PM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(total % 60).padStart(2, "0")} ${suffix}`;
}

export function daysLabel(days) {
  const list = Array.isArray(days) ? [...new Set(days.map(Number))].filter((d) => d >= 0 && d <= 6) : [];
  if (list.length === 7) return "Daily";
  if (!list.length) return "No day chosen";
  // Ordered as the chips are drawn (Sunday first), so the line and the chips
  // can never disagree about which days were chosen.
  return list.map((day) => DAY_SHORT[day]).join(", ");
}

export function mealDelayLabel(delayMinutes) {
  const delay = Number(delayMinutes) || 120;
  if (delay === 120) return "2 hours after you log a meal";
  if (delay === 180) return "3 hours after you log a meal";
  if (delay === 90) return "90 minutes after you log a meal";
  if (delay % 60 === 0) return `${delay / 60} hours after you log a meal`;
  return `${delay} minutes after you log a meal`;
}

/** The one timing line shown under a reminder's name. */
export function reminderTimingLine(row) {
  if (row?.type === "meal") return mealDelayLabel(row?.delay_minutes);
  return `${daysLabel(row?.days)} at ${formatReminderClock(row?.time_minutes)}`;
}

export function reminderCount(rows) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row?.enabled === true).length;
}

export function reminderCountLabel(rows) {
  const count = reminderCount(rows);
  return count > 0 ? `${count} on` : "Off";
}

/** "21:00" for a native time field. */
export function minutesToTimeValue(minutes) {
  const total = ((Math.round(Number(minutes) || 0) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function timeValueToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (hours > 23 || mins > 59) return null;
  return hours * 60 + mins;
}

/** Only the fields the server accepts, so a save can never carry a stray value. */
export function reminderPayloadFrom(row, timezone) {
  return {
    type: row.type,
    name: row.name,
    days: row.days,
    time_minutes: row.time_minutes,
    delay_minutes: row.type === "meal" ? row.delay_minutes : null,
    enabled: row.enabled === true,
    skip_quiet: row.skip_quiet !== false,
    timezone,
  };
}