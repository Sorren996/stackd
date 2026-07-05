export const HIGH_PROTEIN_FAT_MONITORING_HOURS = 6;
const MONITORING_MS = HIGH_PROTEIN_FAT_MONITORING_HOURS * 60 * 60 * 1000;

export function getHighProteinFatMonitoringStatus(carbEntries) {
  const now = Date.now();
  const qualifying = (Array.isArray(carbEntries) ? carbEntries : []).filter((entry) => {
    if (!entry.is_high_protein_fat_meal) return false;
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

export function formatMonitoringEndTime(endTime) {
  if (!endTime) return "";
  const date = new Date(endTime);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay) return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}