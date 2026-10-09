// Unified Time-in-Range (TIR) computation — single source of truth.
//
// All surfaces in the app (Dashboard comfort zone, Analytics, History, day
// recap, Meal Review) MUST use `computeTirPercent` so the number is identical
// everywhere for the same set of readings.
//
// METHOD: Duration-weighted. Glucose is linearly interpolated between
// consecutive readings; each segment is classified in-range / above / below
// by its midpoint value. The percentage is (in-range minutes) / (total
// covered minutes). Both numerator and denominator cover the SAME span
// (from the first reading to the last reading, or to `now` if `extendToNow`
// is true), so 100% in-range readings always return exactly 100%.
//
// Boundaries are inclusive: a reading exactly at targetLow or targetHigh is
// in range.
//
// This is an informational wellness metric, not a clinical measurement.

const MINUTE_MS = 60 * 1000;

/**
 * Unified duration-weighted TIR percentage.
 *
 * @param {Array} readings — Glucose readings with { recorded_at, value }
 * @param {number} targetLow — Lower bound (inclusive)
 * @param {number} targetHigh — Upper bound (inclusive)
 * @param {Object} [opts]
 * @param {number|Date} [opts.now=Date.now()] — End of the coverage window
 * @param {number|Date} [opts.startTime] — Start of the coverage window (defaults to first reading)
 * @param {boolean} [opts.extendToNow=true] — Extend coverage from last reading to `now`
 * @returns {number|null} — 0-100, or null when no valid readings
 */
export function computeTirPercent(readings, targetLow, targetHigh, opts = {}) {
  if (!Array.isArray(readings) || !readings.length) return null;
  if (!Number.isFinite(targetLow) || !Number.isFinite(targetHigh) || targetHigh <= targetLow) return null;

  const now = opts.now != null ? new Date(opts.now).getTime() : Date.now();
  const extendToNow = opts.extendToNow !== false;

  const points = readings
    .map((r) => ({ t: new Date(r.recorded_at || r.recordedAt || r.time).getTime(), v: Number(r.value) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t <= now)
    .sort((a, b) => a.t - b.t);

  if (points.length === 0) return null;

  // Coverage window: from the first reading (or opts.startTime) to the last
  // reading (or `now` if extendToNow). Both numerator and denominator use
  // the SAME window so 100% in-range returns exactly 100%.
  const windowStart = opts.startTime != null
    ? Math.min(new Date(opts.startTime).getTime(), points[0].t)
    : points[0].t;
  const windowEnd = extendToNow
    ? Math.max(now, points[points.length - 1].t)
    : points[points.length - 1].t;

  if (windowEnd <= windowStart) return null;

  let inRangeMs = 0;
  let totalMs = windowEnd - windowStart;

  // Segment from windowStart to the first reading: hold the first reading's
  // value backward so the gap is counted (not silently dropped).
  if (points[0].t > windowStart) {
    const segMs = points[0].t - windowStart;
    if (points[0].v >= targetLow && points[0].v <= targetHigh) inRangeMs += segMs;
  }

  // Segments between consecutive readings: interpolate, classify by midpoint.
  for (let i = 1; i < points.length; i++) {
    const segMs = points[i].t - points[i - 1].t;
    if (segMs <= 0) continue;
    const avgVal = (points[i].v + points[i - 1].v) / 2;
    if (avgVal >= targetLow && avgVal <= targetHigh) inRangeMs += segMs;
  }

  // Segment from the last reading to windowEnd: hold the last reading's value
  // forward so the gap is counted.
  if (extendToNow && points[points.length - 1].t < windowEnd) {
    const segMs = windowEnd - points[points.length - 1].t;
    const lastVal = points[points.length - 1].v;
    if (lastVal >= targetLow && lastVal <= targetHigh) inRangeMs += segMs;
  }

  return totalMs > 0 ? Math.round((inRangeMs / totalMs) * 100) : null;
}

/**
 * Convenience: TIR for a single day (midnight to now, or midnight to midnight
 * for past days). Uses the same duration-weighted method as computeTirPercent.
 *
 * @param {Array} readings — Glucose readings (will be filtered to the day)
 * @param {number} targetLow
 * @param {number} targetHigh
 * @param {Date|number} [dayStart] — Start of the day (defaults to today midnight)
 * @param {Object} [opts] — Passed through to computeTirPercent
 */
export function computeDayTirPercent(readings, targetLow, targetHigh, opts = {}) {
  if (!Array.isArray(readings) || !readings.length) return null;
  if (!Number.isFinite(targetLow) || !Number.isFinite(targetHigh) || targetHigh <= targetLow) return null;

  const now = opts.now != null ? new Date(opts.now).getTime() : Date.now();
  const dayStart = opts.dayStart != null ? new Date(opts.dayStart) : new Date();
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = Math.min(now, dayStartMs + 24 * 60 * 60 * 1000);

  const dayReadings = readings.filter((r) => {
    const t = new Date(r.recorded_at || r.recordedAt || r.time).getTime();
    return Number.isFinite(t) && t >= dayStartMs && t <= dayEndMs;
  });

  if (!dayReadings.length) return null;

  return computeTirPercent(dayReadings, targetLow, targetHigh, {
    ...opts,
    startTime: dayStartMs,
    now: dayEndMs,
    extendToNow: dayEndMs >= now, // extend to now only if the day is today
  });
}

// Filters readings for TIR and average calculations. Includes every real
// reading (manual + CGM); only carry-forward "system" entries are excluded
// so they don't skew metrics.
export function filterReadingsForStats(readings, dexcomConnected) {
  if (!Array.isArray(readings)) return [];
  return readings.filter((r) => r.source !== "system");
}

// Legacy alias — delegates to the unified function. Kept so existing imports
// don't break during the transition.
export function computeTimeInRangeFromReadings(readings, targetLow, targetHigh, opts = {}) {
  return computeTirPercent(readings, targetLow, targetHigh, opts);
}

// Legacy alias — the old time-weighted interpolation function. Kept for
// backward compatibility but now delegates to the unified method.
export function computeTimeInRange(readings, targetLow, targetHigh, now = Date.now()) {
  return computeTirPercent(readings, targetLow, targetHigh, { now, extendToNow: true });
}