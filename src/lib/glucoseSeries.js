// One canonical real-reading series for the current value, the current marker
// and the glucose chart, plus the arithmetic for a history window that ends at
// now.
//
// Rules this file exists to guarantee:
//  - only real measurements are included; carry-forward `system` rows are never
//    treated as a measurement
//  - readings are ordered by sensor time, and a duplicated sensor timestamp
//    collapses to ONE point (the latest record written for that bucket)
//  - the history window is the period immediately BEFORE the newest reading, so
//    a 3h / 6h / 12h view is entirely history rather than half future
//
// Pure functions only — no React, no SDK, and no clock read unless the caller
// passes one in, so the behaviour is directly testable.

export const STEP_MS = 5 * 60 * 1000;
export const HOUR_MS = 60 * 60 * 1000;

const readingTime = (r) => new Date(r.recorded_at || r.created_at || r.created_date).getTime();
const readingValue = (r) => r.value ?? r.glucose ?? r.mgdl ?? r.mg_dL;

/**
 * Normalise a reading list into the canonical ascending series.
 *
 * @param {Array} readings — raw GlucoseReading records
 * @param {Object} [opts]
 * @param {boolean} [opts.cgmOnly=false] — keep only sensor sources (dexcom,
 *   dexcom_share) so a hand-entered value never mixes into a CGM line
 * @returns {Array} ascending by `time`, each entry carrying `time` + `value`
 */
export function canonicalGlucoseSeries(readings, { cgmOnly = false } = {}) {
  const list = Array.isArray(readings) ? readings : [];
  const byBucket = new Map();

  for (const reading of list) {
    if (!reading) continue;
    // Carry-forward rows exist to bridge gaps, never to be presented as a
    // measurement.
    if (reading.source === "system") continue;
    if (cgmOnly && reading.source !== "dexcom" && reading.source !== "dexcom_share") continue;

    const sourceTime = readingTime(reading);
    const value = Number(readingValue(reading));
    if (!Number.isFinite(sourceTime) || !Number.isFinite(value)) continue;

    const bucket = Math.round(sourceTime / STEP_MS) * STEP_MS;
    const existing = byBucket.get(bucket);
    // Same sensor bucket twice: keep one point, deterministically the most
    // recently written reading for that bucket.
    if (!existing || sourceTime >= existing.sourceTime) {
      byBucket.set(bucket, { ...reading, time: bucket, sourceTime, value });
    }
  }

  return Array.from(byBucket.values()).sort((a, b) => a.time - b.time);
}

/** The newest real reading, or null when there is none. */
export function newestRealReading(readings) {
  const series = canonicalGlucoseSeries(readings);
  return series.length ? series[series.length - 1] : null;
}

/**
 * The selected history window: the `hours` immediately before the newest
 * reading. The newest reading is the RIGHT EDGE of the window — never its
 * centre, which would spend half the selected duration on the empty future.
 *
 * @param {Object} args
 * @param {number} args.latestMs — sensor time of the newest real reading
 * @param {number} args.hours — selected duration (3, 6, 12, 24)
 * @returns {{startMs:number,endMs:number,hours:number}|null}
 */
export function computeHistoryWindow({ latestMs, hours }) {
  if (!Number.isFinite(latestMs) || !Number.isFinite(hours) || hours <= 0) return null;
  return { startMs: latestMs - hours * HOUR_MS, endMs: latestMs, hours };
}

/** Whether a moment falls inside a window produced by computeHistoryWindow. */
export function isInsideHistoryWindow(ms, window) {
  if (!window || !Number.isFinite(ms)) return false;
  return ms >= window.startMs && ms <= window.endMs;
}

/**
 * How far the scroll container must be scrolled so the history window's right
 * edge (the newest reading) sits at the viewport's right edge, leaving the
 * future area — active insulin tails, an open meal's projection — outside the
 * selected window rather than inside it.
 *
 * @param {Object} args
 * @param {number} args.maxScrollLeft — scroll offset that centres the newest reading
 * @param {number} args.futureMs — width of the future area drawn to the right
 * @param {number} args.chartWidth — full scrollable render width in px
 * @param {number} args.totalMs — full rendered time span in ms
 */
export function nowScrollOffset({ maxScrollLeft, futureMs, chartWidth, totalMs }) {
  if (!Number.isFinite(maxScrollLeft) || maxScrollLeft <= 0) return 0;
  if (!Number.isFinite(futureMs) || !Number.isFinite(chartWidth) || !Number.isFinite(totalMs) || totalMs <= 0) {
    return maxScrollLeft;
  }
  const futurePx = (futureMs / totalMs) * chartWidth;
  return Math.max(0, Math.min(maxScrollLeft, Math.round(maxScrollLeft - futurePx)));
}

/** A CGM normally reports about every five minutes. */
export const GLUCOSE_CADENCE_MS = 5 * 60 * 1000;

/**
 * How long the silence between two readings has to be before it counts as a
 * genuinely missing sample rather than ordinary transmission jitter. The
 * cadence is five minutes, so anything up to 8 minutes still joins up: a
 * slightly early or late reading never draws a false gap, while an actually
 * missed sample (the next one lands at ~10 minutes) does.
 */
export const GLUCOSE_GAP_BREAK_MS = 8 * 60 * 1000;

/**
 * Split real readings into contiguous runs.
 *
 * Each run is drawn as one smooth line through its own samples. A run ends
 * only where a sample is genuinely missing — the next reading is more than
 * `maxGapMs` after the previous one — so the drawn path breaks exactly where
 * no data exists, and nothing is bridged or extrapolated across that hole.
 *
 * @param {Array<{time:number,value:number}>} points — real readings only
 * @param {{maxGapMs?:number}} [options]
 * @returns {Array<Array<{time:number,value:number}>>} runs, ascending in time
 */
export function buildGlucoseSegments(points, { maxGapMs = GLUCOSE_GAP_BREAK_MS } = {}) {
  const gap = Number.isFinite(maxGapMs) && maxGapMs > 0 ? maxGapMs : GLUCOSE_GAP_BREAK_MS;

  const sorted = (Array.isArray(points) ? points : [])
    .map((point) => ({ time: Number(point?.time), value: Number(point?.value ?? point?.glucose) }))
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((a, b) => a.time - b.time);

  const segments = [];
  let current = [];
  let previousTime = null;

  for (const point of sorted) {
    if (previousTime !== null && point.time - previousTime > gap) {
      if (current.length) segments.push(current);
      current = [];
    }
    current.push(point);
    previousTime = point.time;
  }
  if (current.length) segments.push(current);

  return segments;
}