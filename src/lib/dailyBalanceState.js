// Range-summary PRESENTATION helpers.
//
// These are display-only. The underlying percentage and the time-in-zone /
// above / below minutes remain authoritative — they are computed in
// ActiveInsulinBanner via computeTimeInRangeFromReadings and the
// dailyTimeBreakdown useMemo. Nothing here re-scores the day or creates a
// second calculation system.
//
// The percentage says one thing only: how much of the observed time sat inside
// the person's own configured comfort zone. It is not a day score, a grade, or
// a statement about stability — rises and dips are a separate question this
// app does not classify. So the copy names the range and stops there.

export const RANGE_NEUTRAL_LABEL = "Time in your comfort zone";
export const RANGE_MOSTLY_LABEL = "Mostly in your comfort zone";

// Factual comfort-zone tiers. Each one describes where the day's time sat —
// inside the person's own comfort zone, outside it, or an even split. No tier
// grades the day, names a quality, or implies a cause, and every percentage
// from 0 to 100 lands on one of them, so a headline always exists.
const COMFORT_ZONE_TIERS = [
  { min: 85, label: "Most of the day in your comfort zone" },
  { min: 70, label: RANGE_MOSTLY_LABEL },
  { min: 55, label: "More in than out of your comfort zone" },
  { min: 45, label: "About half the day in your comfort zone" },
  { min: 30, label: "More out than in your comfort zone" },
  { min: -1, label: "Mostly outside your comfort zone" },
];

// The tier phrase for a percentage, or null when there is no number to
// describe yet. Rounds first, so the boundary behaviour stays identical to the
// figure the person was shown.
export function getComfortZoneTier(percentage) {
  if (percentage == null || !Number.isFinite(percentage)) return null;
  const rounded = Math.round(percentage);
  const tier = COMFORT_ZONE_TIERS.find((entry) => rounded >= entry.min);
  return tier ? tier.label : null;
}

// The headline for a day. Never empty once a percentage exists: the neutral
// heading above it names what is being measured, and this names the tier.
export function getDailyBalanceState(percentage) {
  return { label: getComfortZoneTier(percentage) || "Waiting for today" };
}

// The qualifier on its own, for surfaces that already print the neutral
// heading and must not repeat it. null only when there is no percentage yet.
export function getRangeSummaryQualifier(percentage) {
  return getComfortZoneTier(percentage);
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
  if (inRatio >= 0.7) return RANGE_MOSTLY_LABEL;
  if (aboveRatio >= 0.4 && aboveRatio > belowRatio) return "Mostly above your comfort zone";
  if (belowRatio >= 0.4 && belowRatio > aboveRatio) return "Mostly below your comfort zone";
  return "A mix of above and below";
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