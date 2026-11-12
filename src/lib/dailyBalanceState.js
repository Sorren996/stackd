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

// The existing 70% tier (previously "Mostly steady") is kept exactly — only
// the words changed. At or above it the phrase may carry the qualifier; below
// it the neutral heading stands alone and the percentage plus the above/below
// breakdown do the explaining. An empty or unknown result is never described
// as "mostly" anything.
export function getDailyBalanceState(percentage) {
  if (percentage == null || !Number.isFinite(percentage)) {
    return { label: "Waiting for today" };
  }
  return { label: Math.round(percentage) >= 70 ? RANGE_MOSTLY_LABEL : RANGE_NEUTRAL_LABEL };
}

// The qualifier on its own, for surfaces that already print the neutral
// heading and must not repeat it. null whenever there is nothing extra to say.
export function getRangeSummaryQualifier(percentage) {
  if (percentage == null || !Number.isFinite(percentage)) return null;
  return Math.round(percentage) >= 70 ? RANGE_MOSTLY_LABEL : null;
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
  if (inRatio >= 0.7) return "Mostly in your comfort zone";
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