// Period shaping for the Insights view.
//
// This module only SLICES the readings the app already stores: it never
// changes a metric formula. Every value it hands back is produced by the
// app's existing single source of truth (`computeDayTirPercent`), so a day's
// number here matches the same day in the journal exactly.
//
// Two things the view needs and the raw reading list cannot give:
//   1. every calendar day in the selected period, including days with no
//      readings at all (a missing day must never render as a 0% day), and
//   2. a fixed window (N calendar days ending now) so the headline, the
//      coverage line and the charts all describe the same span.

import { eachDayOfInterval, format, startOfDay, subDays } from "date-fns";
import { computeDayTirPercent } from "./timeInRange.js";

export const HOUR_LABELS = [
  "12 AM", "1 AM", "2 AM", "3 AM", "4 AM", "5 AM",
  "6 AM", "7 AM", "8 AM", "9 AM", "10 AM", "11 AM",
  "12 PM", "1 PM", "2 PM", "3 PM", "4 PM", "5 PM",
  "6 PM", "7 PM", "8 PM", "9 PM", "10 PM", "11 PM",
];

/** N calendar days ending now — the one window every section reads from. */
export function periodWindow(rangeDays, now = new Date()) {
  const end = now instanceof Date ? now : new Date(now);
  const days = Number(rangeDays) > 0 ? Number(rangeDays) : 30;
  return { start: startOfDay(subDays(end, days - 1)), end };
}

/** Real readings inside the window, with a usable numeric value. */
export function readingsInWindow(readings, start, end) {
  const from = new Date(start).getTime();
  const to = new Date(end).getTime();
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
  return (Array.isArray(readings) ? readings : []).filter((r) => {
    const t = new Date(r.recorded_at).getTime();
    return Number.isFinite(t) && t >= from && t <= to && Number.isFinite(Number(r.value));
  });
}

/**
 * One entry per calendar day in the period, oldest first.
 * `tir` is the app's duration-weighted day value, or null when the day has no
 * readings (or too few for a duration to exist).
 */
export function buildDaySeries(readings, targetLow, targetHigh, rangeDays, now = new Date()) {
  const { start, end } = periodWindow(rangeDays, now);
  const buckets = new Map();
  for (const r of readingsInWindow(readings, start, end)) {
    const key = format(new Date(r.recorded_at), "yyyy-MM-dd");
    const list = buckets.get(key);
    if (list) list.push(r);
    else buckets.set(key, [r]);
  }

  return eachDayOfInterval({ start, end: startOfDay(end) }).map((day) => {
    const key = format(day, "yyyy-MM-dd");
    const list = buckets.get(key) || [];
    return {
      date: key,
      label: format(day, "MMM d"),
      count: list.length,
      tir: list.length ? computeDayTirPercent(list, targetLow, targetHigh) : null,
    };
  });
}

/** Mean reading per hour of the local day, across the period. */
export function hourlyAverages(readings) {
  const buckets = Array.from({ length: 24 }, () => []);
  for (const r of Array.isArray(readings) ? readings : []) {
    const d = new Date(r.recorded_at);
    const v = Number(r.value);
    if (!Number.isFinite(d.getTime()) || !Number.isFinite(v)) continue;
    buckets[d.getHours()].push(v);
  }
  return buckets.map((values, hour) => ({
    hour,
    label: HOUR_LABELS[hour],
    avg: values.length ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length) : null,
    count: values.length,
  }));
}

/** Days that actually hold readings, against the days in the period. */
export function dayCoverage(series) {
  const list = Array.isArray(series) ? series : [];
  return {
    daysWithReadings: list.filter((d) => d.count > 0).length,
    totalDays: list.length,
  };
}

/**
 * The hour with the highest average, only when the period genuinely supports
 * the claim: enough hours populated and enough readings behind the peak.
 */
export function peakHour(averages, { minHours = 12, minReadings = 5 } = {}) {
  const populated = (Array.isArray(averages) ? averages : []).filter((a) => a.avg != null);
  if (populated.length < minHours) return null;
  const peak = populated.reduce((best, a) => (a.avg > best.avg ? a : best), populated[0]);
  if (peak.count < minReadings) return null;
  return peak;
}

/** Plain wording for an hour, e.g. "noon", "midnight", "3 PM". */
export function hourPhrase(hour) {
  if (hour === 0) return "midnight";
  if (hour === 12) return "noon";
  return HOUR_LABELS[hour] || "";
}