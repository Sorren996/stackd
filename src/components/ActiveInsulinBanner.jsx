import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowRight, ArrowUpRight, ArrowDownRight, Info, X } from "lucide-react";
import { INSULIN_PROFILES, generateActivityCurve } from "@/lib/insulinPharmacology";
import { getActiveCarbsNow, getTotalCarbsToday } from "@/lib/carbAbsorption";
import { motion, AnimatePresence } from "framer-motion";

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

function TooltipPopover({ title, description, onClose }) {
  return (
    <AnimatePresence>
      <motion.div
        key="tooltip-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[300] flex items-center justify-center p-6"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom, 1.5rem))" }}
        onClick={onClose}
      >
        <motion.div
          key="tooltip-card"
          initial={{ opacity: 0, scale: 0.90, y: -16 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 360, damping: 26 } }}
          exit={{ opacity: 0, scale: 0.93, y: -10, transition: { duration: 0.13 } }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-xs rounded-2xl p-4 border border-white/10 shadow-2xl"
          style={{ background: "hsl(162,10%,10%)" }}
        >
          <div className="flex items-start justify-between gap-3 mb-2">
            <p className="text-sm font-semibold text-white">{title}</p>
            <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors shrink-0 mt-0.5">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-white/50 leading-relaxed">{description}</p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function ActiveInsulinBanner({ doses, latestGlucose, glucoseReadings = [], carbEntries = [] }) {
  const [openTooltip, setOpenTooltip] = useState(null);

  const activeUnits = useMemo(() => getTotalActiveUnits(doses), [doses]);
  const hasActive = activeUnits > 0.01;

  const activeCarbs = useMemo(() => getActiveCarbsNow(carbEntries), [carbEntries]);
  const totalCarbsToday = useMemo(() => getTotalCarbsToday(carbEntries), [carbEntries]);
  const netActiveCarbs = useMemo(() => activeCarbs - activeUnits * 10, [activeCarbs, activeUnits]);

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

  const netLabel = netActiveCarbs > 5 ? "Rising Risk" : netActiveCarbs < -5 ? "Falling Risk" : "Balanced";
  const netColor = netActiveCarbs > 5 ? "#ef4444" : netActiveCarbs < -5 ? "#3b82f6" : "#35a879";

  const hasCarbData = carbEntries.length > 0;

  const renderLargeGauge = (label, val, unit, percentage, color, trend = null) => {
    const activeColor = color || "rgba(255,255,255,0.15)";
    const TrendIcon = trend ? TREND_ICONS[trend] : null;
    return (
      <div className="flex flex-col items-center text-center shrink-0">
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider mb-3.5">{label}</span>
        <div className="relative flex items-center justify-center w-36 h-36 sm:w-48 sm:h-48">
          <svg width="100%" height="100%" viewBox="0 0 192 192" className="overflow-visible w-full h-full">
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
            <div className="flex items-center gap-1.5 justify-center">
              <span className="text-3xl sm:text-4xl font-extrabold leading-none tracking-tight text-white">{val}</span>
              {TrendIcon && <TrendIcon className="w-5 h-5 sm:w-6 sm:h-6 shrink-0 text-white" />}
            </div>
            <span className="text-xs sm:text-sm text-white/40 font-medium mt-1.5">{unit}</span>
          </div>
        </div>
        <span className="text-sm font-bold mt-3" style={{ color: activeColor }}>
          {trendLabel}
        </span>
      </div>
    );
  };

  const renderSmallGauge = (label, val, unit, percentage, color, statusLabel, tooltipId = null) => {
  const activeColor = color || "rgba(255,255,255,0.15)";
  return (
    <div className="flex flex-col items-center text-center relative">
      <div className="relative flex items-center justify-center mb-1.5">
        <span className="text-[10px] font-bold text-white/35 uppercase tracking-wider">{label}</span>
        {tooltipId && (
          <button
            onClick={() => setOpenTooltip(openTooltip === tooltipId ? null : tooltipId)}
            className="absolute left-full ml-1 text-white/20 hover:text-white/50 transition-colors"
            aria-label={`Info about ${label}`}
          >
            <Info className="w-3 h-3" />
          </button>
        )}
      </div>
        <div className="relative flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24">
          <svg width="100%" height="100%" viewBox="0 0 80 80" className="overflow-visible w-full h-full">
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
            <span className="text-base sm:text-lg font-extrabold leading-none text-white">{val}</span>
            <span className="text-[8px] sm:text-[9px] text-white/40 font-medium mt-0.5">{unit}</span>
          </div>
        </div>
        <span className="text-xs sm:text-sm font-bold mt-1.5 sm:mt-2" style={{ color: activeColor }}>{statusLabel}</span>
      </div>
    );
  };

  return (
    <>
      {/* Tooltip Popovers — z-[300] clears nav bar and all overlays */}
      <AnimatePresence>
        {openTooltip === "active-carbs" && (
          <TooltipPopover
            key="active-carbs-tip"
            title="Active Carbs"
            description="Active Carbs estimates the amount of carbohydrates currently being absorbed from recent meals. This value decreases as food absorption progresses."
            onClose={() => setOpenTooltip(null)}
          />
        )}
        {openTooltip === "net-carbs" && (
          <TooltipPopover
            key="net-carbs-tip"
            title="Net Active Carbs"
            description="Net Active Carbs compares estimated carbohydrate absorption against active insulin activity. Positive values suggest carbohydrates may be outpacing insulin, while negative values suggest insulin activity may be stronger."
            onClose={() => setOpenTooltip(null)}
          />
        )}
      </AnimatePresence>

      <div className="p-6 sm:p-9 rounded-none md:rounded-3xl border-0 -mx-4 md:mx-0">
        {/* Without carb data: original single-row layout */}
        {!hasCarbData ? (
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
        ) : (
          /* With carb data: 2x2 grid of small gauges + large glucose gauge */
          <div className="flex justify-center items-center gap-4 sm:gap-6">
            {/* Large glucose gauge */}
            {renderLargeGauge(
              "Last Reading",
              latestGlucose ? latestGlucose.value : "—",
              "mg/dL",
              latestGlucose ? Math.min(1, (latestGlucose.value - 40) / 360) : 0,
              getGlucoseColor(latestGlucose?.value),
              latestGlucose ? trendArrow : null
            )}
            {/* 2x2 grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:gap-x-6 sm:gap-y-6">
              {renderSmallGauge(
                "Daily Avg",
                avgDailyGlucose || "—",
                "mg/dL",
                avgDailyGlucose ? Math.min(1, (avgDailyGlucose - 40) / 360) : 0,
                getGlucoseColor(avgDailyGlucose),
                getGlucoseStatus(avgDailyGlucose)
              )}
              {renderSmallGauge(
                "Act Insulin",
                activeUnits.toFixed(1),
                "units",
                Math.min(1, activeUnits / totalAdministered),
                "#35a879",
                hasActive ? "Active" : "Cleared"
              )}
              {renderSmallGauge(
                "Act. Carbs",
                activeCarbs > 0 ? `${Math.round(activeCarbs)}g` : "0g",
                `${totalCarbsToday}g today`,
                Math.min(1, activeCarbs / Math.max(totalCarbsToday, 1)),
                "#f59e0b",
                activeCarbs > 0 ? "Absorbing" : "Cleared",
                "active-carbs"
              )}
              {renderSmallGauge(
                "Net Carbs",
                (netActiveCarbs > 0 ? "+" : "") + Math.round(netActiveCarbs),
                "balance",
                Math.min(1, Math.abs(netActiveCarbs) / 50),
                netColor,
                netLabel,
                "net-carbs"
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}