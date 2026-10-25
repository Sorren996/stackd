// Follower-side Daily Balance.
//
// IMPORTANT — this is NOT a second calculation system. It calls the same
// `filterReadingsForStats` and `getDailyBalanceState` helpers the patient's
// own dashboard uses, over the same count-based rule, so a follower and the
// sharer always read the same number for the same day.
//
// The only thing this adds is that the day boundary is the SHARER's local
// midnight (computed server-side from their saved timezone and returned as
// `today_start`), not the follower's — so a follower in another time zone
// still sees the sharer's day.
//
// Relative imports with explicit extensions keep this module importable by
// both Vite and the Node test runner.

import { filterReadingsForStats } from "../timeInRange.js";
import { getDailyBalanceState } from "../dailyBalanceState.js";

/**
 * @param {Array} readings — readings already windowed by the server
 * @param {number} targetLow
 * @param {number} targetHigh
 * @param {string} todayStartIso — sharer-local midnight, from the server
 * @param {number|Date} [now]
 * @returns {{ percent: number, label: string, readingCount: number }|null}
 */
export function computeSharedDailyBalance(readings, targetLow, targetHigh, todayStartIso, now = Date.now()) {
  if (!Array.isArray(readings) || readings.length === 0) return null;

  const low = Number(targetLow);
  const high = Number(targetHigh);
  if (!Number.isFinite(low) || !Number.isFinite(high) || high <= low) return null;

  const startMs = new Date(todayStartIso).getTime();
  if (!Number.isFinite(startMs)) return null;

  const today = filterReadingsForStats(
    readings.filter((reading) => {
      const t = new Date(reading?.recorded_at).getTime();
      return Number.isFinite(t) && t >= startMs;
    }),
    true
  );

  if (today.length === 0) return null;

  const inRange = today.filter((r) => r.value >= low && r.value <= high).length;
  const percent = Math.round((inRange / today.length) * 100);

  return {
    percent,
    label: getDailyBalanceState(percent).label,
    readingCount: today.length,
  };
}