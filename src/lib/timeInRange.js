// Time-weighted Time-in-Range estimation.
//
// Manual glucose logs are sparse and often biased toward moments the user feels
// "off", so a naive point-count underestimates how much of the day was actually
// spent in the comfort zone. Instead we treat each log as an anchor point on a
// continuous timeline: glucose is linearly interpolated between consecutive
// readings and held constant from the last reading until now. We then sample
// the interpolated curve at a 5-minute cadence (matching a typical CGM) and
// measure the share of covered time spent inside the target range.

const STEP_MS = 5 * 60 * 1000; // 5-minute sampling cadence

export function computeTimeInRange(readings, targetLow, targetHigh, now = Date.now()) {
  if (!Array.isArray(readings) || !readings.length) return null;
  if (!Number.isFinite(targetLow) || !Number.isFinite(targetHigh) || targetHigh <= targetLow) return null;

  const points = readings
    .map((r) => ({ t: new Date(r.recorded_at).getTime(), v: Number(r.value) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t <= now)
    .sort((a, b) => a.t - b.t);

  if (!points.length) return null;

  const start = points[0].t;
  const end = Math.min(now, points[points.length - 1].t + 24 * 60 * 60 * 1000);
  if (end <= start) return null;

  const valueAt = (time) => {
    if (time <= points[0].t) return points[0].v;
    const last = points[points.length - 1];
    if (time >= last.t) return last.v;
    for (let i = 1; i < points.length; i++) {
      if (time <= points[i].t) {
        const a = points[i - 1];
        const b = points[i];
        const span = b.t - a.t || 1;
        return a.v + ((time - a.t) / span) * (b.v - a.v);
      }
    }
    return last.v;
  };

  let inRangeMs = 0;
  let totalMs = 0;
  for (let t = start; t < end; t += STEP_MS) {
    const stepEnd = Math.min(t + STEP_MS, end);
    const value = valueAt(t);
    if (value >= targetLow && value <= targetHigh) inRangeMs += stepEnd - t;
    totalMs += stepEnd - t;
  }

  return totalMs > 0 ? (inRangeMs / totalMs) * 100 : null;
}

// Filters readings for TIR and average calculations. Includes every real
// reading (manual + CGM); only carry-forward "system" entries are excluded
// so they don't skew metrics.
export function filterReadingsForStats(readings, dexcomConnected) {
  if (!Array.isArray(readings)) return [];
  return readings.filter((r) => r.source !== "system");
}

// Simple point-count TIR for dense CGM data where time-weighted
// interpolation isn't needed — each reading represents a real sensor scan.
export function computeTimeInRangeFromReadings(readings, targetLow, targetHigh) {
  if (!Array.isArray(readings) || !readings.length) return null;
  if (!Number.isFinite(targetLow) || !Number.isFinite(targetHigh) || targetHigh <= targetLow) return null;

  let inRange = 0;
  let total = 0;
  for (const r of readings) {
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    total++;
    if (v >= targetLow && v <= targetHigh) inRange++;
  }
  return total > 0 ? (inRange / total) * 100 : null;
}