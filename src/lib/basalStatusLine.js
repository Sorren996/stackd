import { getDoseStatus, getDoseTimingInfo } from "@/lib/insulinPharmacology";

function formatRemainingDuration(min) {
  if (!Number.isFinite(min) || min <= 0) return null;
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

// Dynamic basal status derived from real elapsed time vs that basal's published
// duration — shared by the Insulin on Board card and the Daily Flow dose popover
// so both surfaces always render identical basal status wording.
export function basalStatusLine(dose, now = Date.now()) {
  const doseObj = {
    insulin_type: dose.type,
    units: dose.units,
    administered_at: new Date(dose.time).toISOString(),
  };
  const status = getDoseStatus(doseObj, now);
  const timing = getDoseTimingInfo(doseObj, now);
  if (status.phase === "expired" || status.iob <= 0) {
    return { label: "Estimate complete", remaining: null };
  }
  const remaining = formatRemainingDuration(timing.remainingMin);
  const map = {
    waiting: { label: "Absorbing gently" },
    steady: { label: "Steady background coverage" },
    declining: { label: "Coverage winding down" },
    low_activity: { label: "Lingering gently" },
  };
  const entry = map[status.phase] || { label: status.label };
  return { label: entry.label, remaining };
}