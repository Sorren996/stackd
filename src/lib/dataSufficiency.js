// Wellness-focused sufficiency checks for the My Rhythms page.
// A time range is considered to have "enough data" only when it meets BOTH:
//   - a minimum number of distinct calendar days with at least one reading
//   - a minimum total reading count
// Thresholds are intentionally gentle so honest logging is rewarded, while
// still guarding against showing figures built from a handful of points.

export const MIN_TOTAL_READINGS = 50;

// Minimum days-with-data scales gently with the selected range so a longer
// window asks for slightly broader coverage before it claims to represent a
// rhythm.
export function minDaysCovered(rangeDays) {
  if (rangeDays <= 7) return 3;
  if (rangeDays <= 14) return 5;
  if (rangeDays <= 30) return 8;
  if (rangeDays <= 60) return 12;
  return 16;
}

export function evaluateSufficiency(readings, rangeDays) {
  const list = Array.isArray(readings) ? readings : [];
  const totalReadings = list.length;
  if (!totalReadings) {
    return { hasEnough: false, daysCovered: 0, totalReadings: 0 };
  }
  const dayKeys = new Set();
  for (const r of list) {
    const d = new Date(r.recorded_at);
    if (Number.isNaN(d.getTime())) continue;
    dayKeys.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }
  const daysCovered = dayKeys.size;
  const hasEnough =
    daysCovered >= minDaysCovered(rangeDays) && totalReadings >= MIN_TOTAL_READINGS;
  return { hasEnough, daysCovered, totalReadings };
}