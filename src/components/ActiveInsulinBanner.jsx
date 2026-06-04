import { useMemo, useState } from "react";
import { ArrowUp, ArrowUpRight, ArrowLeft, ArrowDownRight, ArrowDown } from "lucide-react";
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

  const trend = useMemo(() => {
    if (!glucoseReadings || glucoseReadings.length < 2) return null;
    const current = glucoseReadings[0].value;
    const previous = glucoseReadings[1].value;
    const diff = current - previous;

    if (Math.abs(diff) <= 6) return { icon: ArrowLeft, text: diff > 0 ? `+${diff}` : `${diff}`, color: "text-emerald-400" };
    if (diff >= 10)          return { icon: ArrowUp, text: `+${diff}`, color: "text-rose-500" };
    if (diff >= 7)           return { icon: ArrowUpRight, text: `+${diff}`, color: "text-orange-400" };
    if (diff <= -10)         return { icon: ArrowDown, text: `${diff}`, color: "text-amber-500" };
    if (diff <= -7)          return { icon: ArrowDownRight, text: `${diff}`, color: "text-yellow-400" };
    return null;
  }, [glucoseReadings]);

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

  const renderSmallGauge = (label, val, unit, percentage, color, statusLabel) => {
    const activeColor = color || "rgba(255,255,255,0.15)";
    const radius = 20;
    const center = 24;
    const strokeWidth = 3.5;
    return (
      <div className="flex items-center gap-3 w-full bg-white/[0.02] hover:bg-white/[0.04] p-2.5 rounded-xl border border-white/5 transition-all">
        <div className="relative flex items-center justify-center w-12 h-12 shrink-0">
          <svg width="48" height="48" viewBox="0 0 48 48">
            <circle cx={center} cy={center} r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
            {percentage > 0 && (
              <circle
                cx={center} cy={center} r={radius}
                fill="none"
                stroke={activeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={`${2 * Math.PI * radius * percentage} ${2 * Math.PI * radius}`}
                strokeDashoffset={0}
                strokeLinecap="round"
                transform={`rotate(-90 ${center} ${center})`}
              />
            )}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xs font-bold leading-none text-white">{val}</span>
            <span className="text-[7px] text-white/40 font-medium mt-0.5">{unit}</span>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <span className="block text-[9px] font-bold text-white/35 uppercase tracking-wider truncate">{label}</span>
          <span className="block text-[11px] font-bold mt-0.5 truncate" style={{ color: activeColor }}>{statusLabel}</span>
        </div>
      </div>
    );
  };

  const glucoseColor = getGlucoseColor(latestGlucose?.value);
  const TrendIcon = trend?.icon;

  return (
    <div className="p-5 rounded-none md:rounded-3xl border-0 flex flex-col gap-6 -mx-4 md:mx-0">
      <div className="flex flex-col sm:flex-row justify-center items-center gap-6 sm:gap-8 md:gap-12 max-w-xl mx-auto w-full">

        {/* Left: Large Last Reading gauge with trend arrow inside */}
        <div className="flex flex-col items-center text-center shrink-0">
          <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider mb-3">Last Reading</span>
          <div className="relative flex items-center justify-center w-28 h-28">
            <svg width="112" height="112" viewBox="0 0 112 112">
              <circle cx={56} cy={56} r={45} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={6} />
              {latestGlucose && (
                <circle
                  cx={56} cy={56} r={45}
                  fill="none"
                  stroke={glucoseColor}
                  strokeWidth={6}
                  strokeDasharray={`${2 * Math.PI * 45 * Math.min(1, (latestGlucose.value - 40) / 360)} ${2 * Math.PI * 45}`}
                  strokeDashoffset={0}
                  strokeLinecap="round"
                  transform="rotate(-90 56 56)"
                />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="flex items-center gap-1 justify-center">
                <span className="text-2xl font-extrabold leading-none tracking-tight text-white">
                  {latestGlucose ? latestGlucose.value : "—"}
                </span>
                {TrendIcon && <TrendIcon className={`w-4 h-4 shrink-0 ${trend.color}`} />}
              </div>
              <span className="text-[10px] text-white/40 font-medium mt-1">mg/dL</span>
            </div>
          </div>
          <span className="text-[11px] font-bold mt-2.5" style={{ color: glucoseColor }}>
            {getGlucoseStatus(latestGlucose?.value)}
          </span>
        </div>

        {/* Right: Stacked small gauges — Daily Avg on top, Active Insulin below */}
        <div className="flex flex-col gap-3 flex-1 w-full max-w-xs justify-center">
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
            "hsl(162, 50%, 42%)",
            hasActive ? "Active" : "Cleared"
          )}
        </div>

      </div>
    </div>
  );
}