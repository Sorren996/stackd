export const HIGH_PROTEIN_FAT_MONITORING_HOURS = 8;
const MONITORING_MS = HIGH_PROTEIN_FAT_MONITORING_HOURS * 60 * 60 * 1000;

/**
 * Auto-detection of a "delayed rise" meal based on fat and protein grams
 * captured at logging time. The app decides, not the user. A meal qualifies
 * when it meets ANY of these clinical thresholds (ADA/ISPAD-backed guidance):
 *
 *   - Fat >= 40 g (regardless of carbs)
 *   - Protein >= 30 g AND the meal contains carbs (carb grams > 0)
 *   - Protein >= 75 g with no carbs (protein eaten alone needs a higher bar)
 *
 * Decimal, zero, and null/undefined values are all handled safely so repeated
 * edits never double-fire or stick.
 */
export function hasDelayedRise(entry) {
  if (!entry) return false;
  const fat = Number(entry.fat_grams ?? entry.fat ?? 0);
  const protein = Number(entry.protein_grams ?? entry.protein ?? 0);
  const carbs = Number(entry.carbs ?? 0);
  if (!Number.isFinite(fat) || !Number.isFinite(protein) || !Number.isFinite(carbs)) return false;
  if (fat >= 40) return true;
  if (protein >= 30 && carbs > 0) return true;
  if (protein >= 75 && carbs === 0) return true;
  return false;
}

export function getHighProteinFatMonitoringStatus(carbEntries) {
  const now = Date.now();
  const qualifying = (Array.isArray(carbEntries) ? carbEntries : []).filter((entry) => {
    if (!hasDelayedRise(entry)) return false;
    if (!entry.consumed_at) return false;
    const time = new Date(entry.consumed_at).getTime();
    return Number.isFinite(time) && now < time + MONITORING_MS;
  });

  if (!qualifying.length) return { isActive: false, endTime: null, remainingMs: 0, qualifyingCount: 0 };

  const endTime = Math.max(...qualifying.map((e) => new Date(e.consumed_at).getTime() + MONITORING_MS));

  return {
    isActive: true,
    endTime,
    remainingMs: Math.max(0, endTime - now),
    qualifyingCount: qualifying.length,
  };
}

/**
 * Caution status for the inline card under the activity graph. Returns the
 * qualifying meals whose monitoring window still includes now, plus a merged
 * end time. Multiple qualifying meals merge into one card.
 */
export function getDelayedRiseCautionStatus(carbEntries, now = Date.now()) {
  const qualifying = (Array.isArray(carbEntries) ? carbEntries : []).filter((entry) => {
    if (!hasDelayedRise(entry)) return false;
    if (!entry.consumed_at) return false;
    const time = new Date(entry.consumed_at).getTime();
    return Number.isFinite(time) && now < time + MONITORING_MS;
  });

  if (!qualifying.length) return { active: false, meals: [], endTime: null };

  const endTime = Math.max(...qualifying.map((e) => new Date(e.consumed_at).getTime() + MONITORING_MS));
  return { active: true, meals: qualifying, endTime };
}

export function mergeMonitoringIntervals(intervals) {
  if (!intervals.length) return [];
  const sorted = intervals.slice().sort((a, b) => a.start - b.start);
  const merged = [{ start: sorted[0].start, end: sorted[0].end }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ start: sorted[i].start, end: sorted[i].end });
    }
  }
  return merged;
}

export function formatMonitoringEndTime(endTime) {
  if (!endTime) return "";
  const date = new Date(endTime);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}