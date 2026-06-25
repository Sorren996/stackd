import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Info,
  X,
} from "lucide-react";
import { generateActivityCurve } from "@/lib/insulinPharmacology";
import {
  generateCarbCurve,
  getActiveCarbsNow,
  getCarbAbsorptionAt,
  getTotalCarbsToday,
  getDoseRemainingEffectFraction,
} from "@/lib/carbAbsorption";import { AnimatePresence, motion } from "framer-motion";

const SAMPLE_STEP_MS = 5 * 60 * 1000;

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

function getCurveActivityAt(curve, time) {
  if (!curve.length) return 0;

  const first = curve[0];
  const last = curve[curve.length - 1];
  if (time < first.time || time > last.time) return 0;

  for (let index = 0; index < curve.length - 1; index += 1) {
    const current = curve[index];
    const next = curve[index + 1];

    if (current.time <= time && next.time >= time) {
      const ratio = (time - current.time) / (next.time - current.time);
      return current.activity + ratio * (next.activity - current.activity);
    }
  }

  return last.activity;
}

function getTotalActiveUnits(
  doses,
  targetTime = Date.now(),
  selectUnits = (dose) => dose.units
) {
  return doses.reduce((sum, dose) => {
    const units = Number(selectUnits(dose));
    if (!Number.isFinite(units) || units <= 0) return sum;

    const curve = generateActivityCurve(dose, 3);
    return sum + getCurveActivityAt(curve, targetTime) * units;
  }, 0);
}

function getTotalActiveMealUnits(doses, targetTime = Date.now()) {
  // Older records predate the meal/correction split, so retain their prior behavior.
  return getTotalActiveUnits(
    doses,
    targetTime,
    (dose) => dose.meal_units ?? dose.units
  );
}

function getTotalActiveCorrectionUnits(doses, targetTime = Date.now()) {
  return getTotalActiveUnits(
    doses,
    targetTime,
    (dose) => dose.correction_units ?? 0
  );
}

function getTotalRemainingMealCoverageGrams(
  doses,
  gramsPerUnit,
  targetTime = Date.now()
) {
  if (!Number.isFinite(gramsPerUnit) || gramsPerUnit <= 0) return 0;

  return doses.reduce((sum, dose) => {
    const mealUnits = Number(dose.meal_units ?? dose.units);
    if (!Number.isFinite(mealUnits) || mealUnits <= 0) return sum;

    const remainingEffectFraction = getDoseRemainingEffectFraction(
      dose,
      targetTime,
      3
    );

    return sum + mealUnits * gramsPerUnit * remainingEffectFraction;
  }, 0);
}

function getActiveCarbsAt(entries, targetTime) {
  return entries.reduce(
    (sum, entry) => sum + getCarbAbsorptionAt(entry, targetTime).remainingGrams,
    0
  );
}

function computeNetCarbTrajectory(
  doses,
  carbEntries,
  latestGlucose,
  insulinSettings
) {
  const now = Date.now();
  let horizon = now;

  doses.forEach((dose) => {
    const curve = generateActivityCurve(dose, 3);
    if (curve.length) horizon = Math.max(horizon, curve[curve.length - 1].time);
  });

  carbEntries.forEach((entry) => {
    const curve = generateCarbCurve(entry);
    if (curve.length) horizon = Math.max(horizon, curve[curve.length - 1].time);
  });

  const glucoseAsOf = latestGlucose?.recorded_at
    ? new Date(latestGlucose.recorded_at).getTime()
    : null;

  if (horizon <= now || !insulinSettings.isComplete) {
    return { points: [], peak: null, trough: null, atNow: 0, glucoseAsOf };
  }

  const gramsPerUnit = 5 / insulinSettings.mealInsulinUnitsPer5g;
  const points = [];

  for (let time = now; time <= horizon; time += SAMPLE_STEP_MS) {
    const activeUnits = getTotalActiveUnits(doses, time);
    const activeMealUnits = getTotalActiveMealUnits(doses, time);
    const activeCarbs = getActiveCarbsAt(carbEntries, time);
    const remainingMealCoverageGrams = getTotalRemainingMealCoverageGrams(
      doses,
      gramsPerUnit,
      time
    );

    points.push({
      time,
      activeUnits,
      activeMealUnits,
      activeCarbs,
      remainingMealCoverageGrams,
      net: activeCarbs - remainingMealCoverageGrams,
    });
  }

  const peak = points.reduce(
    (highest, point) => (point.net > highest.net ? point : highest),
    points[0]
  );
  const trough = points.reduce(
    (lowest, point) => (point.net < lowest.net ? point : lowest),
    points[0]
  );

  return {
    points,
    peak,
    trough,
    atNow: points[0]?.net ?? 0,
    glucoseAsOf,
  };
}

function formatRelativeAge(time) {
  if (!time) return null;

  const minutes = Math.max(0, Math.round((Date.now() - time) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m ago` : `${hours}h ago`;
}

function formatClockTime(time) {
  if (!time) return null;
  return new Date(time).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function TooltipPopover({ title, description, onClose, children }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-center justify-center p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: -12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: -8 }}
          transition={{ type: "spring", stiffness: 360, damping: 26 }}
          onClick={(event) => event.stopPropagation()}
          className="theme-popover w-full max-w-xs rounded-2xl border border-white/10 p-4 shadow-2xl"
          style={{ background: "hsl(162,10%,10%)" }}
        >
          <div className="mb-2 flex items-start justify-between gap-3">
            <p className="text-sm font-semibold text-white">{title}</p>
            <button
              onClick={onClose}
              className="text-white/40 transition-colors hover:text-white/80"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-xs leading-relaxed text-white/50">{description}</p>
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function AmbientOrb({ color, duration = 6 }) {
  return (
    <motion.div
      animate={{ scale: [1, 1.18, 1], opacity: [0.45, 0.7, 0.45] }}
      transition={{ duration, repeat: Infinity, ease: "easeInOut" }}
      className="h-14 w-14 rounded-full"
      style={{
        background: `radial-gradient(circle, ${color}cc 0%, ${color}44 50%, transparent 75%)`,
        filter: "blur(8px)",
      }}
    />
  );
}

function RiskSparkline({ points, height = 60 }) {
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

  const zeroY = height - ((0 - min) / range) * height;

  // Split the line into above-zero (carb lead) and below-zero (insulin lead)
  // segments so each can be colored independently.
  const segments = [];
  let current = [];
  let currentSign = null;

  points.forEach((p, i) => {
    const sign = p.net >= 0 ? "carb" : "insulin";
    const [x, y] = toXY(p, i);
    if (currentSign !== null && sign !== currentSign) {
      segments.push({ sign: currentSign, path: current });
      current = [current[current.length - 1]]; // overlap point for continuity
    }
    current.push([x, y]);
    currentSign = sign;
  });
  if (current.length) segments.push({ sign: currentSign, path: current });

  const CARB_COLOR = "#f59e0b";
  const INSULIN_COLOR = "#3b82f6";

  return (
    <svg viewBox={`0 0 ${width} ${height + 14}`} width="100%" height={height + 14} preserveAspectRatio="none">
      {/* Zero line */}
      <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="rgba(255,255,255,0.2)" strokeWidth="1" strokeDasharray="3,3" />
      <text x={width} y={zeroY - 4} textAnchor="end" fontSize="9" fill="rgba(255,255,255,0.4)">
        Balanced
      </text>

      {/* Colored segments */}
      {segments.map((seg, i) => (
        <path
          key={i}
          d={seg.path.map(([x, y], j) => `${j === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={seg.sign === "carb" ? CARB_COLOR : INSULIN_COLOR}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

function MetricCard({
  label,
  value,
  sub,
  status,
  color,
  tooltipId,
  openTooltip,
  setOpenTooltip,
}) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="metric-card relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl p-4"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <AmbientOrb color={color} />
      </div>

      <div className="relative z-10 mb-1 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
          {label}
        </span>
        {tooltipId && (
          <button
            onClick={() => setOpenTooltip(openTooltip === tooltipId ? null : tooltipId)}
            className="text-white/20 transition-colors hover:text-white/50"
          >
            <Info className="h-3 w-3" />
          </button>
        )}
      </div>

      <div className="relative z-10 mt-1">
        <span className="text-2xl font-bold leading-none text-white">{value}</span>
        {sub && <p className="mt-1 text-[11px] text-white/35">{sub}</p>}
      </div>

      <span className="relative z-10 mt-2 text-xs font-semibold" style={{ color }}>
        {status}
      </span>
    </motion.div>
  );
}

const TREND_ICONS = {
  up: ArrowUp,
  "up-right": ArrowUpRight,
  right: ArrowRight,
  "down-right": ArrowDownRight,
  down: ArrowDown,
};

export default function ActiveInsulinBanner({
  doses,
  latestGlucose,
  glucoseReadings = [],
  carbEntries = [],
}) {
  const [openTooltip, setOpenTooltip] = useState(null);
  const [insulinSettings, setInsulinSettings] = useState(readInsulinSettings);

  useEffect(() => {
    const refreshSettings = () => setInsulinSettings(readInsulinSettings());
    window.addEventListener("insulin-settings-updated", refreshSettings);
    window.addEventListener("storage", refreshSettings);

    return () => {
      window.removeEventListener("insulin-settings-updated", refreshSettings);
      window.removeEventListener("storage", refreshSettings);
    };
  }, []);

  const activeUnits = useMemo(() => getTotalActiveUnits(doses), [doses]);
  const activeMealUnits = useMemo(() => getTotalActiveMealUnits(doses), [doses]);
  const activeCorrectionUnits = useMemo(
    () => getTotalActiveCorrectionUnits(doses),
    [doses]
  );
  const activeCarbs = useMemo(() => getActiveCarbsNow(carbEntries), [carbEntries]);
  const totalCarbsToday = useMemo(
    () => getTotalCarbsToday(carbEntries),
    [carbEntries]
  );

  const trajectory = useMemo(
    () => computeNetCarbTrajectory(doses, carbEntries, latestGlucose, insulinSettings),
    [doses, carbEntries, latestGlucose, insulinSettings]
  );



  const netActiveCarbs = worstPoint?.net ?? 0;
  const netPeakTime = worstPoint?.time ?? null;
  const isPeakInFuture = Boolean(netPeakTime && netPeakTime > Date.now() + 60000);
  const needsInsulinPlan = !insulinSettings.isComplete;
  const balanceToleranceGrams = insulinSettings.isComplete
    ? Math.max(10, (5 / insulinSettings.mealInsulinUnitsPer5g) * 0.5)
    : 10;
  const hasCarbLead = netActiveCarbs > balanceToleranceGrams;
  const hasInsulinLead = netActiveCarbs < -balanceToleranceGrams;
  const correctionOnlyActive =
    activeCorrectionUnits > 0.01 &&
    activeMealUnits <= 0.01 &&
    activeCarbs <= 0.5;



const CARB_LEAD_COLOR = "#f59e0b";
const INSULIN_LEAD_COLOR = "#3b82f6";

const nowStatusText = useMemo(() => {
  if (!trajectory.points.length) return null;
  const v = trajectory.atNow;
  if (v > 5) return { text: "Carbs are currently ahead of insulin", color: CARB_LEAD_COLOR };
  if (v < -5) return { text: "Insulin is currently ahead of carbs", color: INSULIN_LEAD_COLOR };
  return { text: "Currently balanced", color: "#35a879" };
}, [trajectory]);

const worstPointText = useMemo(() => {
  if (!worstPoint || !netPeakTime) return null;
  const time = formatClockTime(netPeakTime);
  if (worstPoint.net > 5) {
    return {
      text: `Carbs were most ahead of insulin ${isPeakInFuture ? "around" : "at"} ${time}`,
      color: CARB_LEAD_COLOR,
    };
  }
  if (worstPoint.net < -5) {
    return {
      text: `Insulin coverage was strongest ${isPeakInFuture ? "around" : "at"} ${time}`,
      color: INSULIN_LEAD_COLOR,
    };
  }
  return { text: `Stayed close to balanced ${isPeakInFuture ? "around" : "at"} ${time}`, color: "#35a879" };
}, [worstPoint, netPeakTime, isPeakInFuture]);

{worstPoint && netPeakTime && (
  <p className="text-[12px] text-white/50 mt-3">
    {worstPoint.net > 5
      ? "Carbs were most ahead of insulin "
      : worstPoint.net < -5
      ? "Insulin coverage was strongest "
      : "Stayed close to balanced "}
    {isPeakInFuture ? "around " : "at "}
    <span
      className="font-semibold"
      style={{ color: worstPoint.net > 5 ? CARB_LEAD_COLOR : worstPoint.net < -5 ? INSULIN_LEAD_COLOR : "#35a879" }}
    >
      {formatClockTime(netPeakTime)}
    </span>
  </p>
)}

  const netValue = needsInsulinPlan
    ? "Setup needed"
    : correctionOnlyActive
      ? "Correction active"
      : hasCarbLead
        ? "More carbs active"
        : hasInsulinLead
          ? "More insulin active"
          : "In balance";

  const netLabel = needsInsulinPlan
    ? "Add insulin plan in Settings"
    : correctionOnlyActive
      ? "No meal carbs digesting"
      : hasCarbLead
        ? "Glucose may rise"
        : hasInsulinLead
          ? "Glucose may fall"
          : "Carbs and insulin are aligned";

  const netColor = needsInsulinPlan || correctionOnlyActive
    ? "#f59e0b"
    : hasCarbLead
      ? "#ef4444"
      : hasInsulinLead
        ? "#3b82f6"
        : "#35a879";

  const dailyAverage = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const readingsToday = glucoseReadings.filter(
      (reading) => new Date(reading.recorded_at) >= today
    );
    if (!readingsToday.length) return null;
    return Math.round(
      readingsToday.reduce((sum, reading) => sum + reading.value, 0) /
        readingsToday.length
    );
  }, [glucoseReadings]);

  const trend = useMemo(() => {
    if (glucoseReadings.length < 2) return { icon: "right", label: "Stable" };
    const difference = glucoseReadings[0].value - glucoseReadings[1].value;
    if (difference >= 7) return { icon: "up", label: "Rising" };
    if (difference >= 4) return { icon: "up-right", label: "Slowly rising" };
    if (difference >= -3) return { icon: "right", label: "Stable" };
    if (difference >= -6) return { icon: "down-right", label: "Slowly falling" };
    return { icon: "down", label: "Falling" };
  }, [glucoseReadings]);

  const glucoseValue = latestGlucose?.value;
  const glucoseColor = !glucoseValue
    ? "#35a879"
    : glucoseValue < 70
      ? "#3b82f6"
      : glucoseValue > 180
        ? "#f59e0b"
        : "#35a879";

  const targetLow = Number(localStorage.getItem("target_range_low") || 70);
  const targetHigh = Number(localStorage.getItem("target_range_high") || 180);
  const inRange =
    glucoseValue == null ? null : glucoseValue >= targetLow && glucoseValue <= targetHigh;
  const TrendIcon = TREND_ICONS[trend.icon] || ArrowRight;

  const glucoseStatus = (value) => {
    if (!value) return "No data";
    if (value < 70) return "Low";
    if (value > 180) return "High";
    return "In range";
  };

  return (
    <>
      <AnimatePresence>
        {openTooltip === "active-carbs" && (
          <TooltipPopover
            title="Carbs Digesting"
            description="This is an estimate of carbohydrate from recent meals that is still digesting. It is not the number of grams absorbed at this moment."
            onClose={() => setOpenTooltip(null)}
          />
        )}

{openTooltip === "net-carbs" && (
  <TooltipPopover key="net-carbs-tip" title="Insulin and Carb Balance"
    description="This estimate compares carbs still digesting with the meal coverage remaining from logged insulin. Correction insulin remains part of insulin on board but is not treated as meal coverage. It is an estimate, not a glucose prediction or dosing recommendation."
    onClose={() => setOpenTooltip(null)}
  >
    {nowStatusText && (
      <p className="text-sm font-semibold mt-3" style={{ color: nowStatusText.color }}>
        {nowStatusText.text}
      </p>
    )}

    {trajectory.points.length > 1 && (
      <div className="mt-2">
        <RiskSparkline points={trajectory.points} />
        <div className="flex justify-between text-[10px] text-white/30 mt-1">
          <span>Now</span>
          <span>{formatClockTime(trajectory.points[trajectory.points.length - 1].time)}</span>
        </div>
      </div>
    )}

    {worstPointText && (
      <p className="text-[12px] text-white/50 mt-3">
        {worstPointText.text.replace(worstPointText.text.match(/\d{1,2}:\d{2}\s?[AP]M/)?.[0] ?? "", "")}
        <span className="font-semibold" style={{ color: worstPointText.color }}>
          {worstPointText.text.match(/\d{1,2}:\d{2}\s?[AP]M/)?.[0]}
        </span>
      </p>
    )}

    {trajectory.glucoseAsOf && (
      <p className="text-[11px] text-white/35 mt-3 pt-3 border-t border-white/10">
        Based on glucose reading from{" "}
        <span className="font-semibold text-white/55">{formatRelativeAge(trajectory.glucoseAsOf)}</span>
        {" "}({formatClockTime(trajectory.glucoseAsOf)}). Held constant across this estimate — does not predict future glucose.
      </p>
    )}
  </TooltipPopover>

        )}
      </AnimatePresence>

      <div className="relative -mx-4 px-4 pb-6 pt-2">
        <div className="mb-6 flex flex-col items-center pt-2 text-center">
          <span className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">
            Current Glucose
          </span>
          <div className="flex items-end gap-3">
            <span className="text-[72px] font-black leading-none text-white sm:text-[88px]">
              {glucoseValue ?? "--"}
            </span>
            {latestGlucose && (
              <TrendIcon className="mb-3 h-8 w-8" style={{ color: glucoseColor }} />
            )}
          </div>
          <span className="mb-2 text-sm font-medium text-white/35">mg/dL</span>
          {latestGlucose?.recorded_at && (
            <span className="mb-3 text-xs text-white/35">
              {formatRelativeAge(new Date(latestGlucose.recorded_at).getTime())}
            </span>
          )}
          <div
            className="flex items-center gap-2 rounded-full border px-4 py-2"
            style={{ background: `${glucoseColor}18`, borderColor: `${glucoseColor}40` }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: glucoseColor }}
            />
            <span className="text-sm font-semibold" style={{ color: glucoseColor }}>
              {trend.label}
            </span>
          </div>
        </div>

        {latestGlucose && (
          <div className="dashboard-surface mb-6 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.04] px-4 py-3">
            <div className="flex h-5 items-end gap-0.5">
              {[3, 4, 3, 5, 4, 3, 4, 5, 3].map((height, index) => (
                <span
                  key={index}
                  className="w-0.5 rounded-full"
                  style={{
                    height: height * 3,
                    backgroundColor: inRange ? "#35a87988" : "#f59e0b88",
                  }}
                />
              ))}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-white/80">
                {inRange ? "In range" : "Out of range"}
              </p>
              <p className="text-xs text-white/35">
                Target: {targetLow}-{targetHigh} mg/dL
              </p>
            </div>
          </div>
        )}

        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">
          At a Glance
        </p>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Active Insulin"
            value={activeUnits > 0 ? activeUnits.toFixed(1) : "0.0"}
            sub="units"
            status={activeUnits > 0.01 ? "Active" : "Cleared"}
            color="#06b6d4"
          />
          <MetricCard
            label="Carbs Digesting"
            value={activeCarbs > 0 ? `${Math.round(activeCarbs)}g` : "0g"}
            sub={`${totalCarbsToday}g today`}
            status={activeCarbs > 0.5 ? "Digesting" : "Cleared"}
            color="#f59e0b"
            tooltipId="active-carbs"
            openTooltip={openTooltip}
            setOpenTooltip={setOpenTooltip}
          />
          <MetricCard
            label="Insulin:Carb Ratio"
            value={netValue}
            sub={
              needsInsulinPlan
                ? "Enter your plan to calculate balance"
                : isPeakInFuture
                  ? `peak ~${formatClockTime(netPeakTime)}`
                  : "Meal insulin only"
            }
            status={netLabel}
            color={netColor}
            tooltipId="net-carbs"
            openTooltip={openTooltip}
            setOpenTooltip={setOpenTooltip}
          />
          <MetricCard
            label="Daily Average"
            value={dailyAverage ? `${dailyAverage}` : "--"}
            sub={dailyAverage ? "mg/dL" : "No data today"}
            status={glucoseStatus(dailyAverage)}
            color={
              !dailyAverage
                ? "#35a879"
                : dailyAverage < 70
                  ? "#3b82f6"
                  : dailyAverage > 180
                    ? "#f59e0b"
                    : "#10b981"
            }
          />
        </div>
      </div>
    </>
  );
}
