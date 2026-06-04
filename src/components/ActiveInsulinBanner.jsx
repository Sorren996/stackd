import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { INSULIN_PROFILES, generateActivityCurve } from "@/lib/insulinPharmacology";

function getTotalActiveUnits(doses) {
  const now = Date.now();
  return doses.reduce((sum, dose) => {
    const curve = generateActivityCurve(dose, 3);
    if (!curve.length) return sum;
    const last = curve[curve.length - 1];
    const first = curve[0];
    if (now < first.time || now > last.time) return sum;
    let lo = 0;
    for (let i = 0; i < curve.length - 1; i++) {
      if (curve[i].time <= now && curve[i + 1].time >= now) { lo = i; break; }
    }
    const hi = lo + 1;
    const ratio = hi >= curve.length ? 0 : (now - curve[lo].time) / (curve[hi].time - curve[lo].time);
    const activity = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
    return sum + activity * dose.units;
  }, 0);
}

function getMaxRemainingTime(doses) {
  const now = Date.now();
  let maxMs = 0;
  doses.forEach((dose) => {
    const profile = INSULIN_PROFILES[dose.insulin_type];
    if (!profile) return;
    const administered = new Date(dose.administered_at).getTime();
    const end = administered + profile.durationMin * 60000;
    if (end > now) maxMs = Math.max(maxMs, end - now);
  });
  return maxMs;
}

export default function ActiveInsulinBanner({ doses, latestGlucose, glucoseReadings = [] }) {
  const activeUnits = useMemo(() => getTotalActiveUnits(doses), [doses]);
  const hasActive = activeUnits > 0.01;

  const totalAdministered = useMemo(() => {
    return doses.reduce((sum, d) => sum + d.units, 0) || 1;
  }, [doses]);

  const avgDailyGlucose = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysReadings = glucoseReadings.filter((g) => new Date(g.recorded_at) >= today);
    if (!todaysReadings.length) return null;
    const sum = todaysReadings.reduce((acc, curr) => acc + curr.value, 0);
    return Math.round(sum / todaysReadings.length);
  }, [glucoseReadings]);

  const getGlucoseColor = (val) => {
    if (!val) return "rgba(255,255,255,0.1)";
    if (val < 70) return "#d19422";
    if (val > 180) return "#c54d16";
    return "#149142";
  };

  const getGlucoseStatus = (val) => {
    if (!val) return "—";
    if (val < 70) return "Low";
    if (val > 180) return "High";
    return "Stable";
  };

  const renderLargeGauge = (label, val, unit, percentage, color, hasArrow = false) => {
    const activeColor = color || "rgba(255,255,255,0.15)";
    return (
      <div className="flex flex-col items-center text-center shrink-0">
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider mb-3.5">{label}</span>
        <div className="relative flex items-center justify-center w-36 h-36">
          <svg width="144" height="144" viewBox="0 0 144 144">
            <circle cx={72} cy={72} r={58} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
            {percentage > 0 && (
              <circle cx={72} cy={72} r={58} fill="none" stroke={activeColor} strokeWidth={6}
                strokeDasharray={`${2 * Math.PI * 58 * percentage} ${2 * Math.PI * 58}`}
                strokeDashoffset={0} strokeLinecap="round" transform="rotate(-90 72 72)"
                style={{ filter: `drop-shadow(0 0 8px ${activeColor}90)` }} />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="flex items-center gap-1 justify-center">
              <span className="text-2xl font-extrabold leading-none tracking-tight text-white">{val}</span>
              {hasArrow && <ArrowRight className="w-4 h-4 shrink-0 text-white" />}
            </div>
            <span className="text-[10px] text-white/40 font-medium mt-1">{unit}</span>
          </div>
        </div>
        <span className="text-[11px] font-bold mt-2.5" style={{ color: activeColor }}>
          {getGlucoseStatus(latestGlucose?.value)}
        </span>
      </div>
    );
  };

  const renderSmallGauge = (label, val, unit, percentage, color, statusLabel) => {
    const activeColor = color || "rgba(255,255,255,0.15)";
    return (
      <div className="flex flex-col items-center text-center">
        <span className="text-[9px] font-bold text-white/35 uppercase tracking-wider mb-1.5">{label}</span>
        <div className="relative flex items-center justify-center w-14 h-14">
          <svg width="56" height="56" viewBox="0 0 56 56">
            <circle cx={28} cy={28} r={22} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={4} />
            {percentage > 0 && (
              <circle cx={28} cy={28} r={22} fill="none" stroke={activeColor} strokeWidth={4}
                strokeDasharray={`${2 * Math.PI * 22 * percentage} ${2 * Math.PI * 22}`}
                strokeDashoffset={0} strokeLinecap="round" transform="rotate(-90 28 28)"
                style={{ filter: `drop-shadow(0 0 5px ${activeColor}90)` }} />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-extrabold leading-none text-white">{val}</span>
            <span className="text-[7px] text-white/40 font-medium mt-0.5">{unit}</span>
          </div>
        </div>
        <span className="text-[10px] font-bold mt-1.5" style={{ color: activeColor }}>{statusLabel}</span>
      </div>
    );
  };

  return (
    <div className="p-9 rounded-none md:rounded-3xl border-0 -mx-4 md:mx-0">
      <div className="flex justify-center items-center gap-6">
        {renderLargeGauge(
          "Last Reading",
          latestGlucose ? latestGlucose.value : "—",
          "mg/dL",
          latestGlucose ? Math.min(1, (latestGlucose.value - 40) / 360) : 0,
          getGlucoseColor(latestGlucose?.value),
          true
        )}
        <div className="flex flex-col gap-4">
          {renderSmallGauge(
            "Daily Avg",
            avgDailyGlucose || "—",
            "mg/dL",
            avgDailyGlucose ? Math.min(1, (avgDailyGlucose - 40) / 360) : 0,
            getGlucoseColor(avgDailyGlucose),
            getGlucoseStatus(avgDailyGlucose)
            // 1. Update the function signature to accept a className:
const renderSmallGauge = (label, val, unit, percentage, color, statusLabel, className = "") => {
  return (
    <div className={`flex flex-col items-center text-center ${className}`}>
      {/* rest of the function remains the same */}
    </div>
  );
};

// 2. Pass your desired padding or margin class (e.g., pb-0 or mb-0) to "Daily Avg":
{renderSmallGauge(
  "Daily Avg",
  avgDailyGlucose || "—",
  "mg/dL",
  avgDailyGlucose ? Math.min(1, (avgDailyGlucose - 40) / 360) : 0,
  getGlucoseColor(avgDailyGlucose),
  getGlucoseStatus(avgDailyGlucose),
  "pb-1" // <-- Your custom padding/margin class here
)}
          )}
          {renderSmallGauge(
            "Active Insulin",
            activeUnits.toFixed(1),
            "units",
            Math.min(1, activeUnits / totalAdministered),
            "hsl(162, 50%, 42%)",
            hasActive ? "Active" : "Cleared"
          )}
        </div>
      </div>
    </div>
  );
}