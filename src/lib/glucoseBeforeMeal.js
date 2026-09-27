/**
 * Shared before-meal glucose helper.
 *
 * Returns the glucose reading closest BEFORE (at or before) the meal
 * timestamp, within `maxBeforeMinutes`. Used by both the dashboard meal
 * review and the journal meal outcome card so the "before meal" value
 * always agrees between surfaces.
 *
 * Accepts either raw entity records ({ recorded_at, value }) or already
 * normalized readings ({ time, value }) — detected automatically.
 */

export function normalizeGlucoseReadings(readings) {
  return (Array.isArray(readings) ? readings : [])
    .map((r) => ({ time: new Date(r.recorded_at).getTime(), value: Number(r.value) }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
    .sort((a, b) => a.time - b.time);
}

export function getGlucoseBeforeMeal(readings, mealTime, maxBeforeMinutes = 30) {
  if (!Number.isFinite(mealTime)) return null;

  const first = Array.isArray(readings) ? readings[0] : null;
  const normalized = first && Number.isFinite(first.time)
    ? readings
    : normalizeGlucoseReadings(readings);

  if (!normalized.length) return null;

  const cutoff = mealTime - maxBeforeMinutes * 60 * 1000;
  let best = null;

  for (const r of normalized) {
    if (r.time > mealTime) break; // sorted ascending; nothing past the meal
    if (r.time >= cutoff) {
      if (!best || mealTime - r.time < mealTime - best.time) best = r;
    }
  }

  return best;
}