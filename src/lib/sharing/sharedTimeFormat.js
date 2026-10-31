// Shared 12-hour clock formatting for the followed person's glucose views.
//
// One place decides how a time is written, so the chart axis and any reading
// time shown beside it can never disagree. Formatting only: the same local
// Date is read with getHours()/getMinutes(), exactly as before, so no timestamp
// is shifted and nothing stored is changed. A fixed 12-hour output is used
// rather than a locale call, because a device set to a 24-hour region would
// otherwise quietly render "13:05" again.

const toDate = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

/** Hour on a 12-hour clock, plus its AM/PM suffix. Midnight is 12 AM, noon 12 PM. */
function splitHour(hours) {
  const suffix = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return { hour12, suffix };
}

/**
 * Hour tick for a chart axis: "1 PM".
 *
 * @param {Date|string|number} value — local time of the tick
 * @returns {string} "" when the value is not a valid date
 */
export function formatSharedHourTick(value) {
  const date = toDate(value);
  if (!date) return "";
  const { hour12, suffix } = splitHour(date.getHours());
  return `${hour12} ${suffix}`;
}

/**
 * A reading's clock time: "1:05 PM" (13:05 → 1:05 PM, 00:05 → 12:05 AM,
 * 12:05 → 12:05 PM).
 *
 * @param {Date|string|number} value — local time of the reading
 * @returns {string} "" when the value is not a valid date
 */
export function formatSharedClockTime(value) {
  const date = toDate(value);
  if (!date) return "";
  const { hour12, suffix } = splitHour(date.getHours());
  return `${hour12}:${String(date.getMinutes()).padStart(2, "0")} ${suffix}`;
}