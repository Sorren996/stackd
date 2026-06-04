import { useMemo, useState } from "react";
import { Info, X } from "lucide-react";
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
    if (val < 70) return "#d19422ff";
    if (val > 180) return "#c54d16ff";
    return "#149142ff";
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
        <span className="text-[8px] font-bold text-white/35 uppercase tracking-wider mb-2.5 truncate w-full px-1">
          {label}
        </span>
        <div className="relative flex items-center justify-center" style={{ width: 62, height: 62 }}>
          <svg width="70" height="70" viewBox="0 0 62 62">
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

  const [tooltipOpen, setTooltipOpen] = useState(false);

  return (
    <div className="p-10 rounded-none md:rounded-3xl border-0 flex flex-col gap-6 -mx-4 md:mx-0">


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

      {/* Info tooltip trigger */}
      <div className="relative self-start">
        <button
          onClick={() => setTooltipOpen((v) => !v)}
          className="flex items-center gap-1.5 text-white/25 hover:text-white/50 transition-colors text-[10px]"
        >
          <Info className="w-3 h-3" />
          <span>How to read this</span>
        </button>

        {tooltipOpen && (
          <div
            className="absolute left-0 z-50 w-64 rounded-xl p-3.5 text-xs space-y-2 shadow-xl"
            style={{ background: "rgba(18,28,22,0.97)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-white/70 text-[11px]">Reading the gauges</span>
              <button onClick={() => setTooltipOpen(false)} className="text-white/30 hover:text-white/60">
                <X className="w-3 h-3" />
              </button>
            </div>
            {[
              ["Active Insulin", "Estimated units still working in your body right now."],
              ["Last Reading", "Your most recently logged blood glucose value."],
              ["Daily Avg", "Average of all glucose readings logged today."],
            ].map(([title, desc]) => (
              <div key={title}>
                <p className="font-semibold text-white/60">{title}</p>
                <p className="text-white/35 leading-relaxed">{desc}</p>
              </div>
            ))}
            <p className="text-white/25 text-[9px] pt-1 border-t border-white/5">
              Ring fill = relative progress. Colors: green = in range, orange = high, red = low.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}