// Stackd Insight Engine — Measured glucose velocity
//
// ONE velocity function, used by two surfaces that must never disagree: the
// projection (as its opening rate) and the trend arrow beside the reading.
// Before this, the arrow ran its own two-point override with absolute-change
// thresholds while the projection read the last two points of a 30-minute
// window, so a falling morning could show a falling arrow over a rising
// forecast.
//
// The estimate is a Theil–Sen slope (the median of all pairwise slopes) over
// the last 15 minutes of real readings. Compared with a two-point difference it
// survives a single bad sample: three points at 100, 60, 55 give a median slope
// of a fall rather than the cliff the middle sample implies. It needs THREE
// samples, because two points cannot be checked against each other.
//
// It returns nothing at all — never a zero — when the series is too short, too
// old, has two readings at the same instant, or contains a carried-forward
// (interpolated) sample. "We cannot measure" is never flattened into "steady".

import { trendLevelFromRate } from '../trendPresentation.js';

export const VELOCITY_WINDOW_MIN = 15;
export const VELOCITY_MIN_SAMPLES = 3;
export const VELOCITY_STALE_MIN = 15;
export const VELOCITY_MAX_MGDL_PER_MIN = 3;

// The arrow thresholds. The projection shares them, so a "Falling quickly"
// arrow and a forecast that opens falling quickly are the same measurement.
export const TREND_FAST_RATE = 3;   // >= +3 rising quickly, <= -3 falling quickly
export const TREND_SLOW_RATE = 1;   // >= +1 slowly rising, <= -1 slowly falling

const MINUTE_MS = 60 * 1000;

function median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Readings arrive in several shapes across the app: entity records
// ({ recorded_at, value, source }), engine points ({ time, value, source }), and
// chart points ({ t, v }). All resolve to { t, v, source, interpolated }.
export function normalizeReadingSamples(readings) {
  if (!Array.isArray(readings)) return [];
  return readings
    .map((r) => {
      if (!r) return null;
      const rawTime = r.time != null ? r.time : r.recorded_at != null ? r.recorded_at : r.t;
      const t = rawTime instanceof Date ? rawTime.getTime() : typeof rawTime === "number" ? rawTime : new Date(rawTime).getTime();
      const v = Number(r.value != null ? r.value : r.v);
      if (!Number.isFinite(t) || !Number.isFinite(v)) return null;
      const source = String(r.source || "");
      // "system" readings are carried forward across a sensor gap, not measured,
      // so a slope built on one describes the carry-forward, not glucose.
      const interpolated = r.interpolated === true || source === "system";
      return { t, v, source, interpolated };
    })
    .filter(Boolean)
    .sort((a, b) => a.t - b.t);
}

/**
 * Robust measured velocity in mg/dL per minute.
 *
 * Returns { velocity, sampleCount, spanMin, method, reason }. `velocity` is null
 * whenever the series cannot be measured, with `reason` saying why:
 * "too_few_readings" | "stale" | "duplicate_readings" | "interpolated_readings".
 */
export function measureVelocity(rawReadings, atTime, options = {}) {
  const windowMin = Number(options.windowMin) > 0 ? Number(options.windowMin) : VELOCITY_WINDOW_MIN;
  const minSamples = Number(options.minSamples) > 0
    ? Math.max(2, Number(options.minSamples))
    : VELOCITY_MIN_SAMPLES;

  const points = normalizeReadingSamples(rawReadings);
  const newest = points.length ? points[points.length - 1] : null;
  const anchorMs = Number.isFinite(Number(atTime)) ? Number(atTime) : newest?.t;

  const unusable = (reason, sampleCount = 0) => ({
    velocity: null,
    sampleCount,
    spanMin: null,
    method: "theil_sen",
    reason,
  });

  if (!points.length || !Number.isFinite(anchorMs)) return unusable("too_few_readings");

  // A stale series is not a slow series: the newest reading is too old for the
  // last 15 minutes to describe anything about now.
  if ((anchorMs - newest.t) / MINUTE_MS > VELOCITY_STALE_MIN) return unusable("stale", points.length);

  const window = points.filter(
    (p) => p.t <= anchorMs && p.t >= anchorMs - windowMin * MINUTE_MS
  );
  if (window.length < minSamples) return unusable("too_few_readings", window.length);

  const seen = new Set();
  for (const p of window) {
    if (seen.has(p.t)) return unusable("duplicate_readings", window.length);
    seen.add(p.t);
  }
  if (window.some((p) => p.interpolated)) return unusable("interpolated_readings", window.length);

  // Theil–Sen: the median of every pairwise slope. One outlying sample moves a
  // single pair, so it cannot drag the whole estimate the way a two-point
  // difference can.
  const slopes = [];
  for (let i = 0; i < window.length; i++) {
    for (let j = i + 1; j < window.length; j++) {
      const dtMin = (window[j].t - window[i].t) / MINUTE_MS;
      if (!(dtMin > 0)) continue;
      slopes.push((window[j].v - window[i].v) / dtMin);
    }
  }
  const velocity = median(slopes);
  if (velocity == null) return unusable("too_few_readings", window.length);

  return {
    velocity: Math.round(velocity * 100) / 100,
    sampleCount: window.length,
    spanMin: Math.round(((window[window.length - 1].t - window[0].t) / MINUTE_MS) * 10) / 10,
    method: "theil_sen",
    reason: null,
  };
}

// The one mapping from a measured rate to the arrow beside the reading. Labels
// and icons are unchanged; only the way the rate is measured has.
export function trendFromVelocity(velocity) {
  const pair = trendLevelFromRate(velocity);
  return pair ? { ...pair, label: pair.word } : null;
}