// Daily Balance PRESENTATION helpers.
//
// These are display-only. The underlying Daily Balance percentage and the
// time-in-range / above / below minutes remain authoritative — they are
// computed in ActiveInsulinBanner via computeTimeInRangeFromReadings and the
// dailyTimeBreakdown useMemo. Nothing here re-scores the day or creates a
// second calculation system.

// Four presentation thresholds for the state label. These do NOT modify the
// Daily Balance calculation — they only describe the current number.
export function getDailyBalanceState(percentage) {
  if (percentage == null || !Number.isFinite(percentage)) {
    return { label: "Waiting for today" };
  }
  const p = Math.round(percentage);
  if (p >= 80) return { label: "Looking good" };
  if (p >= 65) return { label: "Looking steady" };
  if (p >= 45) return { label: "A little uneven" };
  return { label: "Needs care" };
}

// Named periods of the day, used for the "What shaped today" observation.
// Each period is described observationally from the readings that fall in it.
// No causation, no recommendations — just where the day spent time.
const PERIODS = [
  { label: "Overnight", start: 0, end: 6 },
  { label: "Morning", start: 6, end: 12 },
  { label: "After lunch", start: 12, end: 18 },
  { label: "Evening", start: 18, end: 24 },
];

const MIN_READINGS_PER_PERIOD = 3;

function describePeriod(inRange, above, below) {
  const total = inRange + above + below;
  if (total === 0) return null;
  const inRatio = inRange / total;
  const aboveRatio = above / total;
  const belowRatio = below / total;
  if (inRatio >= 0.7) return "Mostly steady";
  if (aboveRatio >= 0.4 && aboveRatio > belowRatio) return "Mostly above range";
  if (belowRatio >= 0.4 && belowRatio > aboveRatio) return "Mostly below range";
  return "A mix of highs and lows";
}

// Builds an observational, period-by-period summary of today from the same
// glucose readings the rest of the dashboard uses. Returns [] when there
// isn't enough data to describe any period honestly.
export function describeDayShape(readings, targetLow, targetHigh) {
  if (!Array.isArray(readings) || !readings.length) return [];
  if (!Number.isFinite(targetLow) || !Number.isFinite(targetHigh)) return [];

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startMs = startOfDay.getTime();
  const endMs = startMs + 24 * 60 * 60 * 1000;

  const todayReadings = readings.filter((r) => {
    if (!r || r.source === "system") return false;
    const v = Number(r.value);
    if (!Number.isFinite(v)) return false;
    const t = new Date(r.recorded_at).getTime();
    return t >= startMs && t < endMs;
  });

  const out = [];
  for (const period of PERIODS) {
    let inRange = 0;
    let above = 0;
    let below = 0;
    for (const r of todayReadings) {
      const h = new Date(r.recorded_at).getHours();
      if (h < period.start || h >= period.end) continue;
      const v = Number(r.value);
      if (v < targetLow) below++;
      else if (v > targetHigh) above++;
      else inRange++;
    }
    const total = inRange + above + below;
    if (total < MIN_READINGS_PER_PERIOD) continue;
    const description = describePeriod(inRange, above, below);
    if (!description) continue;
    out.push({ label: period.label, description });
  }
  return out;
}