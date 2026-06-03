import { useMemo } from "react";
import { INSULIN_PROFILES, generateActivityCurve, getDoseStatus, formatMinutes } from "@/lib/insulinPharmacology";

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
  const remainingMs = useMemo(() => getMaxRemainingTime(doses), [doses]);
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

  const getRemainingTimeData = () => {
    if (!remainingMs) return { val: "0", unit: "min", pct: 0, status: "Cleared" };
    const totalMin = Math.round(remainingMs / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    const maxActiveWindow = 6 * 60 * 60 * 1000;
    const pct = Math.min(1, remainingMs / maxActiveWindow);
    if (h > 0) return { val: `${h}h`, unit: `${m}m`, pct, status: "Absorbing" };
    return { val: `${m}`, unit: "min", pct, status: "Absorbing" };
  };

  const getGlucoseColor = (val) => {
    if (!val) return "rgba(255,255,255,0.1)";
    if (val < 70) return "#ef4444";
    if (val > 180) return "#f97316";
    return "#4ade80";
  };

  const getGlucoseStatus = (val) => {
    if (!val) return "—";
    if (val < 70) return "Low";
    if (val > 180) return "High";
    return "Stable";
  };

  const timeData = getRemainingTimeData();

  const renderGauge = (label, val, unit, percentage, color, statusLabel) => {
    const activeColor = color || "rgba(255,255,255,0.15)";
    return (
      <div className="flex flex-col items-center flex-1 min-w-[76px] text-center">
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider mb-2.5 truncate w-full px-1">
          {label}
        </span>
        <div className="relative flex items-center justify-center" style={{ width: 62, height: 62 }}>
          <svg width="62" height="62" viewBox="0 0 62 62">
            <circle cx="31" cy="31" r="25" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4.5" />
            {percentage > 0 && (
              <circle
                cx="31" cy="31" r="25"
                fill="none"
                stroke={activeColor}
                strokeWidth="4.5"
                strokeDasharray={`${2 * Math.PI * 25 * percentage} ${2 * Math.PI * 25}`}
                strokeDashoffset={0}
                strokeLinecap="round"
                style={{ filter: `drop-shadow(0 0 4px ${activeColor}55)` }}
                transform="rotate(-90 31 31)"
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-sm font-extrabold leading-none tracking-tight text-white">{val}</span>
            <span className="text-[8px] text-white/40 font-medium mt-0.5">{unit}</span>
          </div>
        </div>
        <span className="text-[9px] font-bold mt-2 truncate w-full px-1" style={{ color: activeColor }}>
          {statusLabel}
        </span>
      </div>
    );
  };

  return (
    <div className="p-4 rounded-none md:rounded-3xl border-0 flex flex-col gap-6 -mx-4 md:mx-0">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard</h1>
      </div>

      <div className="flex justify-between items-center gap-1.5 md:gap-4">
        {renderGauge(
          "Active Insulin",
          activeUnits.toFixed(1),
          "units",
          Math.min(1, activeUnits / totalAdministered),
          "hsl(162, 50%, 42%)",
          hasActive ? "Active" : "Cleared"
        )}
        {renderGauge(
          "Time Left",
          timeData.val,
          timeData.unit,
          timeData.pct,
          "hsl(195, 60%, 50%)",
          timeData.status
        )}
        {renderGauge(
          "Last Reading",
          latestGlucose ? latestGlucose.value : "—",
          "mg/dL",
          latestGlucose ? Math.min(1, (latestGlucose.value - 40) / 360) : 0,
          getGlucoseColor(latestGlucose?.value),
          getGlucoseStatus(latestGlucose?.value)
        )}
        {renderGauge(
          "Daily Avg",
          avgDailyGlucose || "—",
          "mg/dL",
          avgDailyGlucose ? Math.min(1, (avgDailyGlucose - 40) / 360) : 0,
          getGlucoseColor(avgDailyGlucose),
          getGlucoseStatus(avgDailyGlucose)
        )}
      </div>
    </div>
  );
}