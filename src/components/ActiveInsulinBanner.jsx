import { useEffect, useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowRight, ArrowUpRight, ArrowDownRight, Info, X, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { INSULIN_PROFILES, generateActivityCurve } from "@/lib/insulinPharmacology";
import {
  getActiveCarbsNow,
  getTotalCarbsToday,
  getCarbAbsorptionAt,
  generateCarbCurve,
} from "@/lib/carbAbsorption";
import { motion, AnimatePresence } from "framer-motion";




function readInsulinSettings() {
  const insulinSensitivityMgDlPerUnit = Number(
    localStorage.getItem("insulin_sensitivity_mgdl_per_unit")
  );
  const mealInsulinUnitsPer5g = Number(
    localStorage.getItem("meal_insulin_units_per_5g")
  );

  return {
    insulinSensitivityMgDlPerUnit,
    mealInsulinUnitsPer5g,
    isComplete:
      insulinSensitivityMgDlPerUnit > 0 &&
      mealInsulinUnitsPer5g > 0,
  };
}


const SAMPLE_STEP_MS = 5 * 60 * 1000; // 5 min resolution for the trajectory sweep



function getCurveActivityAt(curve, t) {
  if (!curve.length) return 0;
  const first = curve[0], last = curve[curve.length - 1];
  if (t < first.time || t > last.time) return 0;
  let lo = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    if (curve[i].time <= t && curve[i + 1].time >= t) { lo = i; break; }
  }
  const hi = Math.min(lo + 1, curve.length - 1);
  const ratio = hi === lo ? 0 : (t - curve[lo].time) / (curve[hi].time - curve[lo].time);
  return curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
}

function getTotalActiveUnits(doses, targetTime = Date.now()) {
  return doses.reduce((sum, dose) => {
    const curve = generateActivityCurve(dose, 3);
    return sum + getCurveActivityAt(curve, targetTime) * dose.units;
  }, 0);
}

function getActiveCarbsAt(entries, targetTime) {
  return entries.reduce(
    (sum, entry) => sum + getCarbAbsorptionAt(entry, targetTime).remainingGrams,
    0
  );
}


/**
 * Sweep the entire overlap window of all active insulin doses and carb
 * entries, computing net carbs-vs-food-insulin at each sample point.
 *
 * This replaces a fixed 30-minute lookahead, which missed risk developing
 * later in the IOB/COB curve — e.g. a slow-absorbing meal peaking at 2hrs,
 * or insulin still climbing toward its own peak past the 30-min mark.
 *
 * Note: the glucose-based correction offset is a static snapshot taken from
 * the latest reading and applied at every sample point. It is NOT a glucose
 * prediction — it won't reflect a real glucose change until a new reading
 * is logged.
 */
function computeNetCarbTrajectory(doses, carbEntries, latestGlucose, insulinSettings) {
    const now = Date.now();

  let horizon = now;
  doses.forEach((dose) => {
    const curve = generateActivityCurve(dose, 3);
    if (curve.length) horizon = Math.max(horizon, curve[curve.length - 1].time);
  });
  carbEntries.forEach((entry) => {
    if (entry.is_custom) return;
    const curve = generateCarbCurve(entry);
    if (curve.length) horizon = Math.max(horizon, curve[curve.length - 1].time);
  });

  if (horizon <= now) {
    return { points: [], peak: null, trough: null, atNow: 0, glucoseAsOf: null };
  }

  const currentGlucose = latestGlucose ? latestGlucose.value : 100;
  const targetGlucose = 110;
 if (!insulinSettings.isComplete) {
  return { points: [], peak: null, trough: null, atNow: 0, glucoseAsOf: null };
}

const isf = insulinSettings.insulinSensitivityMgDlPerUnit;
const gramsPerUnit = 5 / insulinSettings.mealInsulinUnitsPer5g;
const correctionUnits = Math.max(0, currentGlucose - targetGlucose) / isf;

  const points = [];
  for (let t = now; t <= horizon; t += SAMPLE_STEP_MS) {
    const activeUnits = getTotalActiveUnits(doses, t);
    const activeCarbs = getActiveCarbsAt(carbEntries, t);
    const activeFoodUnits = Math.max(0, activeUnits - correctionUnits);
const net = activeCarbs - activeFoodUnits * gramsPerUnit;
    points.push({ time: t, net, activeUnits, activeCarbs });
  }

  const atNow = points.length ? points[0].net : 0;
  const peak = points.reduce((a, b) => (b.net > a.net ? b : a), points[0]);
  const trough = points.reduce((a, b) => (b.net < a.net ? b : a), points[0]);

  // Surface when the glucose reading used for the correction offset was
  // taken, so the UI can make clear this isn't a live/predictive value.
  const glucoseAsOf = latestGlucose?.recorded_at ? new Date(latestGlucose.recorded_at).getTime() : null;

  return { points, peak, trough, atNow, glucoseAsOf };
}

function formatRelativeAge(ms) {
  if (!ms) return null;
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h}h ${m}m ago` : `${h}h ago`;
}

function TooltipPopover({ title, description, onClose, children }) {

  
  return (
    <AnimatePresence>
      <motion.div
        key="tooltip-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        className="fixed inset-0 z-[300] flex items-center justify-center p-6"
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
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// Ambient orb with breathing animation
function AmbientOrb({ color, duration = 6, size = 48 }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.7, 0.45] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      className="rounded-full shrink-0"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle, ${color}cc 0%, ${color}44 50%, transparent 75%)`,
        filter: `blur(8px)`,
      }}
    />
  );
}





// Tiny inline sparkline for the net-carbs risk trajectory
function RiskSparkline({ points, color, height = 36 }) {
  if (!points || points.length < 2) return null;

  const width = 240;
  const values = points.map((p) => p.net);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const toXY = (p, i) => {
    const x = (i / (points.length - 1)) * width;
    const y = height - ((p.net - min) / range) * height;
    return [x, y];
  };

  const pathD = points
    .map((p, i) => {
      const [x, y] = toXY(p, i);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const zeroY = height - ((0 - min) / range) * height;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Glassmorphic metric card
function MetricCard({ label, value, sub, status, orbColor, orbDuration = 6, tooltipId, openTooltip, setOpenTooltip }) {
  
  
  
  
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="relative rounded-2xl p-4 flex flex-col justify-between overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        minHeight: 100,
      }}
    >

    
      <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
        <AmbientOrb color={orbColor} duration={orbDuration} size={56} />
      </div>

      <div className="flex items-start justify-between mb-1">
        <span className="text-[10px] font-semibold text-white/35 uppercase tracking-wider">{label}</span>
        {tooltipId && (
          <button
            onClick={() => setOpenTooltip(openTooltip === tooltipId ? null : tooltipId)}
            className="text-white/20 hover:text-white/50 transition-colors"
          >
            <Info className="w-3 h-3" />
          </button>
        )}
      </div>




      <div className="mt-1">
        <span className="text-2xl font-bold text-white leading-none">{value}</span>
        {sub && <p className="text-[11px] text-white/35 mt-1">{sub}</p>}
      </div>

      <div className="mt-2">
        <span className="text-xs font-semibold" style={{ color: orbColor }}>{status}</span>
      </div>
    </motion.div>
  );
}

const TREND_ICONS = {
  "up": ArrowUp,
  "up-right": ArrowUpRight,
  "right": ArrowRight,
  "down-right": ArrowDownRight,
  "down": ArrowDown,
};

function formatClockTime(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export default function ActiveInsulinBanner({ doses, latestGlucose, glucoseReadings = [], carbEntries = [] }) {
  const [openTooltip, setOpenTooltip] = useState(null);
const [insulinSettings, setInsulinSettings] = useState(readInsulinSettings);
const trajectory = useMemo(
  () => computeNetCarbTrajectory(doses, carbEntries, latestGlucose, insulinSettings),
  [doses, carbEntries, latestGlucose, insulinSettings]
);


useEffect(() => {
  const refreshSettings = () => setInsulinSettings(readInsulinSettings);

  window.addEventListener("insulin-settings-updated", refreshSettings);
  window.addEventListener("storage", refreshSettings);

  return () => {
    window.removeEventListener("insulin-settings-updated", refreshSettings);
    window.removeEventListener("storage", refreshSettings);
  };
}, []);
  const activeUnits = useMemo(() => getTotalActiveUnits(doses), [doses]);
  const hasActive = activeUnits > 0.01;

  const activeCarbs = useMemo(() => getActiveCarbsNow(carbEntries), [carbEntries]);
  const totalCarbsToday = useMemo(() => getTotalCarbsToday(carbEntries), [carbEntries]);

  // Full IOB/COB trajectory sweep, replacing the old fixed 30-min lookahead.
() => computeNetCarbTrajectory(doses, carbEntries, latestGlucose, insulinSettings),
[doses, carbEntries, latestGlucose, insulinSettings]

  // The worst point (largest magnitude, either direction) across the whole
  // window drives the displayed risk status — not an arbitrary single point.
  const worstPoint = useMemo(() => {
    if (!trajectory.peak && !trajectory.trough) return null;
    const peakMag = Math.abs(trajectory.peak?.net ?? 0);
    const troughMag = Math.abs(trajectory.trough?.net ?? 0);
    return peakMag >= troughMag ? trajectory.peak : trajectory.trough;
  }, [trajectory]);

  const netActiveCarbs = worstPoint?.net ?? 0;
  const netPeakTime = worstPoint?.time ?? null;
  const isPeakInFuture = netPeakTime && netPeakTime > Date.now() + 60000;

  const totalAdministered = useMemo(() => doses.reduce((sum, d) => sum + d.units, 0) || 1, [doses]);

  const avgDailyGlucose = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysReadings = glucoseReadings.filter((g) => new Date(g.recorded_at) >= today);
    if (!todaysReadings.length) return null;
    return Math.round(todaysReadings.reduce((acc, c) => acc + c.value, 0) / todaysReadings.length);
  }, [glucoseReadings]);

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

  const glucoseVal = latestGlucose?.value;
  const glucoseColor = !glucoseVal ? "#35a879" : glucoseVal < 70 ? "#3b82f6" : glucoseVal > 180 ? "#f59e0b" : "#35a879";

  const ambientColor = !glucoseVal ? "#0d4a2e" : glucoseVal < 55 ? "#7f1d1d" : glucoseVal < 70 ? "#1e3a5f" : glucoseVal > 250 ? "#7c2d12" : glucoseVal > 180 ? "#78350f" : "#0d4a2e";

  const TrendIcon = TREND_ICONS[trendArrow] || ArrowRight;

const needsInsulinPlan = !insulinSettings.isComplete;

const netValue = needsInsulinPlan
  ? "Setup needed"
  : netActiveCarbs > 5
    ? "High"<br />"carb activity"
    : netActiveCarbs < -5
      ? "High insulin activity"
      : "In balance";

const netLabel = needsInsulinPlan
  ? "Add insulin plan in Settings"
  : netActiveCarbs > 5
    ? "Glucose may rise"
    : netActiveCarbs < -5
      ? "Glucose may fall"
      : "Carbs and insulin are aligned";

const netColor = needsInsulinPlan
  ? "#f59e0b"
  : netActiveCarbs > 5
    ? "#ef4444"
    : netActiveCarbs < -5
      ? "#3b82f6"
      : "#35a879";

  const getGlucoseStatus = (val) => {
    if (!val) return "—";
    if (val < 70) return "Low";
    if (val > 180) return "High";
    return "Stable";
  };

  const hasCarbData = carbEntries.length > 0;

  const targetLow = parseInt(localStorage.getItem("target_range_low") || "70", 10);
  const targetHigh = parseInt(localStorage.getItem("target_range_high") || "180", 10);
  const inRange = glucoseVal ? (glucoseVal >= targetLow && glucoseVal <= targetHigh) : null;

  return (
    <>
      <AnimatePresence>
        {openTooltip === "active-carbs" && (
          <TooltipPopover key="net-carbs-tip" title="Carb and Insulin Balance"
description="This estimate compares active carbohydrate absorption with active food-coverage insulin across their remaining duration. It is a balance estimate, not a glucose prediction or dosing recommendation."            onClose={() => setOpenTooltip(null)} />
        )}
        {openTooltip === "net-carbs" && (
          <TooltipPopover key="net-carbs-tip" title="Net Active Carbs"
            description="Net Active Carbs compares the full carbohydrate absorption curve against insulin dedicated to food coverage across its entire active duration — after accounting for correction insulin based on your most recent glucose reading. The status shown reflects the single worst point across that whole window, not just the next 30 minutes, so slower meals or insulin still rising toward its peak are accounted for."
            onClose={() => setOpenTooltip(null)}
          >
            {trajectory.points.length > 1 && (
              <div className="mt-3">
                <RiskSparkline points={trajectory.points} color={netColor} />
                <div className="flex justify-between text-[10px] text-white/30 mt-1">
                  <span>Now</span>
                  <span>{formatClockTime(trajectory.points[trajectory.points.length - 1].time)}</span>
                </div>
                {netPeakTime && (
                  <p className="text-[11px] text-white/40 mt-2">
                    {netActiveCarbs > 5 ? "Largest carb lead" : netActiveCarbs < -5 ? "Largest insulin lead" : "Most notable balance point"}
                    {isPeakInFuture ? " expected " : " was "}
                    <span className="font-semibold" style={{ color: netColor }}>
                      {formatClockTime(netPeakTime)}
                    </span>
                  </p>
                )}
              </div>
            )}
          </TooltipPopover>
        )}
      </AnimatePresence>

      <div className="pt-2 pb-6 -mx-4 px-4">
        <div className="absolute left-1/2 -translate-x-1/2 top-16 w-72 h-72 pointer-events-none -z-10 overflow-hidden">
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.25, 0.4, 0.25] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="w-full h-full rounded-full"
            style={{
              background: `radial-gradient(circle, ${ambientColor} 0%, transparent 70%)`,
              filter: "blur(40px)",
            }}
          />
        </div>

        {/* ── Primary Glucose Hero ── */}
        <div className="flex flex-col items-center text-center mb-6 pt-2">
          <span className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3">Current Glucose</span>

          <motion.div
            key={glucoseVal}
            initial={{ scale: 0.94, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            className="flex items-end gap-3 mb-1"
          >
            <span className="text-[72px] sm:text-[88px] font-black leading-none tracking-tight text-white">
              {glucoseVal ?? "—"}
            </span>
            {latestGlucose && (
              <TrendIcon className="w-8 h-8 mb-3 shrink-0" style={{ color: glucoseColor }} />
            )}
          </motion.div>

          <span className="text-sm text-white/35 font-medium mb-4">mg/dL</span>

          <motion.div
            whileTap={{ scale: 0.96 }}
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{
              background: `${glucoseColor}18`,
              border: `1px solid ${glucoseColor}40`,
            }}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: glucoseColor }} />
            <span className="text-sm font-semibold" style={{ color: glucoseColor }}>{trendLabel}</span>
          </motion.div>
        </div>

        {/* ── Target Range Banner ── */}
        {latestGlucose && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl px-4 py-3 flex items-center gap-3 mb-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
            }}
          >
            <div className="flex gap-0.5 items-end h-5 shrink-0">
              {[3,4,3,5,4,3,4,5,3].map((h, i) => (
                <div key={i} className="w-0.5 rounded-full" style={{
                  height: h * 3,
                  backgroundColor: inRange ? "#35a87988" : "#f59e0b88"
                }} />
              ))}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white/80">
                {inRange === null ? "No data" : inRange ? "In range" : "Out of range"}
              </p>
              <p className="text-xs text-white/35">Target: {targetLow} – {targetHigh} mg/dL</p>
            </div>
            <span className="text-xs font-medium" style={{ color: inRange ? "#35a879" : "#f59e0b" }}>
              {inRange === null ? "" : inRange ? "✓" : "↑"}
            </span>
          </motion.div>
        )}

        {/* ── Metric Cards Grid ── */}
        {hasCarbData ? (
          <>
            <p className="text-[10px] font-bold text-white/25 uppercase tracking-[0.18em] mb-3">At a Glance</p>
            <div className="grid grid-cols-2 gap-3">


              <MetricCard
                label="Active Insulin"
                value={`${activeUnits.toFixed(1)}`}
                sub="units"
                status={hasActive ? "Active" : "Cleared"}
                orbColor="#06b6d4"
                orbDuration={6}
              />
              <MetricCard
                label="Active Carbs"
                value={activeCarbs > 0 ? `${Math.round(activeCarbs)}g` : "0g"}
                sub={`${totalCarbsToday}g today`}
                status={activeCarbs > 0 ? "Absorbing" : "Cleared"}
                orbColor="#f59e0b"
                orbDuration={activeCarbs > 0 ? 4 : 8}
                tooltipId="active-carbs"
                openTooltip={openTooltip}
                setOpenTooltip={setOpenTooltip}
              />
<MetricCard
  label="Carb and Insulin Balance"
  value={netValue}
sub={
  needsInsulinPlan
    ? "Enter your plan to calculate balance"
    : trajectory.glucoseAsOf
      ? `glucose as of ${formatRelativeAge(trajectory.glucoseAsOf)}`
      : isPeakInFuture
        ? `peak ~${formatClockTime(netPeakTime)}`
        : "balance"
}
  status={netLabel}
  orbColor={netColor}
  orbDuration={8}
  tooltipId="net-carbs"
  openTooltip={openTooltip}
  setOpenTooltip={setOpenTooltip}
/>
              <MetricCard
                label="Daily Average"
                value={avgDailyGlucose ? `${avgDailyGlucose}` : "—"}
                sub={avgDailyGlucose ? "mg/dL" : "No data today"}
                status={getGlucoseStatus(avgDailyGlucose)}
                orbColor={!avgDailyGlucose ? "#35a879" : avgDailyGlucose < 70 ? "#3b82f6" : avgDailyGlucose > 180 ? "#f59e0b" : "#10b981"}
                orbDuration={9}
              />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label="Active Insulin"
              value={`${activeUnits.toFixed(1)}`}
              sub="units"
              status={hasActive ? "Active" : "Cleared"}
              orbColor="#06b6d4"
              orbDuration={6}
            />
            <MetricCard
              label="Daily Average"
              value={avgDailyGlucose ? `${avgDailyGlucose}` : "—"}
              sub={avgDailyGlucose ? "mg/dL" : "No data today"}
              status={getGlucoseStatus(avgDailyGlucose)}
              orbColor={!avgDailyGlucose ? "#35a879" : avgDailyGlucose < 70 ? "#3b82f6" : avgDailyGlucose > 180 ? "#f59e0b" : "#10b981"}
              orbDuration={9}
            />
          </div>
        )}
      </div>
    </>
  );
}