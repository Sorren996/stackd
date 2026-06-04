import { useMemo } from "react";
import { ArrowUp, ArrowDown, ArrowRight, ArrowUpRight, ArrowDownRight } from "lucide-react";
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

  const trendArrow = useMemo(() => {
    if (glucoseReadings.length < 2) return "right";
    const diff = glucoseReadings[0].value - glucoseReadings[1].value;
    if (diff >= 7) return "up";
    if (diff >= 4) return "up-right";
    if (diff >= -3) return "right";
    if (diff >= -6) return "down-right";
    return "down";
  }, [glucoseReadings]);

const trendLabel = useMemo(() => {
  if (glucoseReadings.length < 2) return "Stable";
  const diff = glucoseReadings[0].value - glucoseReadings[1].value;
  if (diff >= 7) return "Rising";
  if (diff >= 4) return "Slowly Rising";
  if (diff >= -3) return "Stable";
  if (diff >= -6) return "Slowly Falling";
  return "Falling";
}, [glucoseReadings]);

  const getGlucoseStatus = (val) => {
    if (!val) return "—";
    if (val < 70) return "Low";
    if (val > 180) return "High";
    return "Stable";
  };

  const TREND_ICONS = {
    "up": ArrowUp,
    "up-right": ArrowUpRight,
    "right": ArrowRight,
    "down-right": ArrowDownRight,
    "down": ArrowDown,
  };

  const renderLargeGauge = (label, val, unit, percentage, color, trend = null) => {
    const activeColor = color || "rgba(255,255,255,0.15)";
    const TrendIcon = trend ? TREND_ICONS[trend] : null;
    return (
      <div className="flex flex-col items-center text-center shrink-0">
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider mb-3.5">{label}</span>
        <div className="relative flex items-center justify-center w-48 h-48">
          <svg width="192" height="192" viewBox="0 0 192 192" className="overflow-visible">
            <defs>
              <filter id="glow-large" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="4" result="blur1" />
                <feGaussianBlur stdDeviation="10" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx={96} cy={96} r={80} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={8} />
            {percentage > 0 && (
              <circle cx={96} cy={96} r={80} fill="none" stroke={activeColor} strokeWidth={8}
                strokeDasharray={`${2 * Math.PI * 80 * percentage} ${2 * Math.PI * 80}`}
                strokeDashoffset={0} strokeLinecap="round" transform="rotate(-90 96 96)"
                filter="url(#glow-large)" />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div className="flex items-center gap-2 justify-center">
              
              <span className="text-4xl font-extrabold leading-none tracking-tight text-white">{val}</span>
              {TrendIcon && <TrendIcon className="w-6 h-6 shrink-0 text-white" />}
            </div>
            <span className="text-sm text-white/40 font-medium mt-1.5">{unit}</span>
          </div>
        </div>
        <span className="text-sm font-bold mt-3" style={{ color: activeColor }}>
          {trendLabel}
        </span>
      </div>
    );
  };

  const renderSmallGauge = (label, val, unit, percentage, color, statusLabel, className = "") => {
    const activeColor = color || "rgba(255,255,255,0.15)";
    return (
      <div className={`flex flex-col items-center text-center ${className}`}>
        <span className="text-[11px] font-bold text-white/35 uppercase tracking-wider mb-1.5">{label}</span>
        <div className="relative flex items-center justify-center w-20 h-20">
          <svg width="80" height="80" viewBox="0 0 80 80" className="overflow-visible">
            <defs>
              <filter id="glow-small" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2.5" result="blur1" />
                <feGaussianBlur stdDeviation="6" result="blur2" />
                <feMerge>
                  <feMergeNode in="blur2" />
                  <feMergeNode in="blur1" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <circle cx={40} cy={40} r={33} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={5.5} />
            {percentage > 0 && (
              <circle cx={40} cy={40} r={33} fill="none" stroke={activeColor} strokeWidth={5.5}
                strokeDasharray={`${2 * Math.PI * 33 * percentage} ${2 * Math.PI * 33}`}
                strokeDashoffset={0} strokeLinecap="round" transform="rotate(-90 40 40)"
                filter="url(#glow-small)" />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-extrabold leading-none text-white">{val}</span>
            <span className="text-[9px] text-white/40 font-medium mt-0.5">{unit}</span>
          </div>
        </div>
        <span className="text-sm font-bold mt-2" style={{ color: activeColor }}>{statusLabel}</span>
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
          latestGlucose ? trendArrow : null
        )}
        <div className="flex flex-col gap-4 pb-1">
          {renderSmallGauge(
            "Daily Avg",
            avgDailyGlucose || "—",
            "mg/dL",
            avgDailyGlucose ? Math.min(1, (avgDailyGlucose - 40) / 360) : 0,
            getGlucoseColor(avgDailyGlucose),
            getGlucoseStatus(avgDailyGlucose)
          )}
          {renderSmallGauge(
            "Active Insulin",
            activeUnits.toFixed(1),
            "units",
            Math.min(1, activeUnits / totalAdministered),
            "#35a879",
            hasActive ? "Active" : "Cleared"
          )}
        </div>
      </div>
    </div>
  );
}