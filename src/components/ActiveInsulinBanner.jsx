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
} from "@/lib/carbAbsorption";
import { AnimatePresence, motion } from "framer-motion";

const SAMPLE_STEP_MS = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_INSULIN_DURATION_HOURS = 3;
const DEFAULT_PRE_MEAL_WINDOW_MINUTES = 45;
const DEFAULT_POST_MEAL_WINDOW_MINUTES = 90;
const DEFAULT_OUTCOME_WINDOW_MINUTES = 240;
const MEAL_GROUP_WINDOW_MS = 30 * MINUTE_MS;

function readInsulinSettings() {
  const insulinSensitivityMgDlPerUnit = Number(
    localStorage.getItem("insulin_sensitivity_mgdl_per_unit")
  );
  const mealInsulinUnitsPer5g = Number(
    localStorage.getItem("meal_insulin_units_per_5g")
  );
  const durationHours = Number(
    localStorage.getItem("insulin_duration_hours")
  );
  const preMealWindowMinutes = Number(
    localStorage.getItem("meal_prebolus_window_minutes")
  );
  const postMealWindowMinutes = Number(
    localStorage.getItem("meal_postbolus_window_minutes")
  );
  const outcomeWindowMinutes = Number(
    localStorage.getItem("meal_outcome_window_minutes")
  );
  const targetLow = Number(localStorage.getItem("target_range_low") || 70);
  const targetHigh = Number(localStorage.getItem("target_range_high") || 180);

  return {
    insulinSensitivityMgDlPerUnit,
    mealInsulinUnitsPer5g,
    durationHours: durationHours > 0 ? durationHours : DEFAULT_INSULIN_DURATION_HOURS,
    preMealWindowMinutes: preMealWindowMinutes > 0 ? preMealWindowMinutes : DEFAULT_PRE_MEAL_WINDOW_MINUTES,
    postMealWindowMinutes: postMealWindowMinutes > 0 ? postMealWindowMinutes : DEFAULT_POST_MEAL_WINDOW_MINUTES,
    outcomeWindowMinutes: outcomeWindowMinutes > 0 ? outcomeWindowMinutes : DEFAULT_OUTCOME_WINDOW_MINUTES,
    targetLow,
    targetHigh,
    targetGlucose: Math.round((targetLow + targetHigh) / 2),
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

function getTotalActiveUnits(doses, targetTime = Date.now(), selectUnits = (dose) => dose.units, durationHours = DEFAULT_INSULIN_DURATION_HOURS) {
  return (Array.isArray(doses) ? doses : []).reduce((sum, dose) => {
    const units = Number(selectUnits(dose));
    if (!Number.isFinite(units) || units <= 0) return sum;

    const curve = generateActivityCurve(dose, durationHours);
    return sum + getCurveActivityAt(curve, targetTime) * units;
  }, 0);
}

function getTotalActiveMealUnits(doses, targetTime = Date.now(), durationHours = DEFAULT_INSULIN_DURATION_HOURS) {
  // Older records predate the meal/correction split, so retain their prior behavior.
  return getTotalActiveUnits(doses, targetTime, (dose) => dose.meal_units ?? dose.units, durationHours);
}

function getTotalActiveCorrectionUnits(doses, targetTime = Date.now(), durationHours = DEFAULT_INSULIN_DURATION_HOURS) {
  return getTotalActiveUnits(doses, targetTime, (dose) => dose.correction_units ?? 0, durationHours);
}

function getActiveCarbsAt(entries, targetTime) {
  return (Array.isArray(entries) ? entries : []).reduce(
    (sum, entry) => sum + getCarbAbsorptionAt(entry, targetTime).remainingGrams,
    0
  );
}

function getEntryTime(entry) {
  return new Date(entry.consumed_at || entry.recorded_at || entry.administered_at).getTime();
}

function getDoseTime(dose) {
  return new Date(dose.administered_at).getTime();
}

function getClosestGlucose(readings, targetTime, maxDistanceMinutes = 30) {
  const maxDistance = maxDistanceMinutes * MINUTE_MS;
  return (Array.isArray(readings) ? readings : []).reduce((closest, reading) => {
    const time = new Date(reading.recorded_at).getTime();
    const distance = Math.abs(time - targetTime);
    if (!Number.isFinite(time) || distance > maxDistance) return closest;
    if (!closest || distance < closest.distance) return { reading, distance };
    return closest;
  }, null)?.reading ?? null;
}

function sumDoseUnits(doses, selectUnits) {
  return doses.reduce((sum, dose) => {
    const units = Number(selectUnits(dose));
    return Number.isFinite(units) && units > 0 ? sum + units : sum;
  }, 0);
}

function buildMealEventGroups(carbEntries, doses) {
  const carbEvents = (Array.isArray(carbEntries) ? carbEntries : [])
    .map((entry) => ({
      type: "carb",
      time: getEntryTime(entry),
      carbs: Number(entry.carbs),
      entry,
    }))
    .filter((event) => Number.isFinite(event.time) && Number.isFinite(event.carbs) && event.carbs > 0);

  const doseEvents = (Array.isArray(doses) ? doses : [])
    .map((dose) => ({
      type: "dose",
      time: getDoseTime(dose),
      units: Number(dose.units),
      dose,
    }))
    .filter((event) => Number.isFinite(event.time) && Number.isFinite(event.units) && event.units > 0);

  const events = [...carbEvents, ...doseEvents].sort((a, b) => a.time - b.time);
  const groups = [];

  events.forEach((event) => {
    const lastGroup = groups[groups.length - 1];
    if (!lastGroup || event.time - lastGroup.end > MEAL_GROUP_WINDOW_MS) {
      groups.push({
        start: event.time,
        end: event.time,
        carbEvents: event.type === "carb" ? [event] : [],
        doseEvents: event.type === "dose" ? [event] : [],
      });
      return;
    }

    lastGroup.end = event.time;
    if (event.type === "carb") {
      lastGroup.carbEvents.push(event);
    } else {
      lastGroup.doseEvents.push(event);
    }
  });

  return groups
    .filter((group) => group.carbEvents.length > 0)
    .map((group) => {
      const carbs = group.carbEvents.reduce((sum, event) => sum + event.carbs, 0);
      const carbTimeTotal = group.carbEvents.reduce((sum, event) => sum + event.time * event.carbs, 0);
      const mealTime = carbs > 0 ? carbTimeTotal / carbs : group.start;

      return {
        ...group,
        carbs,
        mealTime,
        carbEntries: group.carbEvents.map((event) => event.entry),
        doses: group.doseEvents.map((event) => event.dose),
      };
    });
}

function computeMealAlignmentInsight(doses, carbEntries, glucoseReadings, latestGlucose, insulinSettings) {
  if (!insulinSettings.isComplete) {
    return {
      value: "Setup needed",
      status: "Add insulin plan in Settings",
      color: "#f59e0b",
      sub: "Enter I:C ratio and sensitivity",
      details: null,
    };
  }

  const groups = buildMealEventGroups(carbEntries, doses).sort((a, b) => b.mealTime - a.mealTime);

  if (!groups.length) {
    return {
      value: "No meal data",
      status: "Log carbs to assess coverage",
      color: "#f59e0b",
      sub: "Waiting for carb log",
      details: null,
    };
  }

  const now = Date.now();
  const outcomeWindowMs = insulinSettings.outcomeWindowMinutes * MINUTE_MS;
  const mealGroup = groups.find((group) => now - group.mealTime <= outcomeWindowMs) ?? groups[0];
  const mealTime = mealGroup.mealTime;
  const windowStart = mealGroup.start;
  const windowEnd = mealGroup.end;
  const pairedDoses = mealGroup.doses;
  const priorDoses = (Array.isArray(doses) ? doses : []).filter((dose) => {
    const time = getDoseTime(dose);
    return Number.isFinite(time) && time < windowStart;
  });
  const glucoseAtMeal = getClosestGlucose(glucoseReadings, mealTime) ?? latestGlucose ?? null;
  const glucoseValue = Number(glucoseAtMeal?.value);
  const outcomeReadings = (Array.isArray(glucoseReadings) ? glucoseReadings : [])
    .map((reading) => ({ ...reading, time: new Date(reading.recorded_at).getTime(), value: Number(reading.value) }))
    .filter((reading) =>
      Number.isFinite(reading.time) &&
      Number.isFinite(reading.value) &&
      reading.time >= mealTime + 60 * MINUTE_MS &&
      reading.time <= mealTime + insulinSettings.outcomeWindowMinutes * MINUTE_MS
    );
  const peakOutcome = outcomeReadings.reduce((peak, reading) => (!peak || reading.value > peak.value ? reading : peak), null);
  const lowOutcome = outcomeReadings.reduce((low, reading) => (!low || reading.value < low.value ? reading : low), null);
  const gramsPerUnit = 5 / insulinSettings.mealInsulinUnitsPer5g;
  const expectedMealUnits = mealGroup.carbs / gramsPerUnit;
  const correctionUnitsNeeded =
    Number.isFinite(glucoseValue) && glucoseValue > insulinSettings.targetHigh
      ? (glucoseValue - insulinSettings.targetGlucose) / insulinSettings.insulinSensitivityMgDlPerUnit
      : 0;
  const priorActiveUnits = getTotalActiveUnits(priorDoses, mealTime, (dose) => dose.units, insulinSettings.durationHours);
  const expectedTotalUnits = Math.max(0, expectedMealUnits + correctionUnitsNeeded - priorActiveUnits);
  const loggedMealUnits = sumDoseUnits(pairedDoses, (dose) => dose.meal_units ?? dose.units);
  const loggedCorrectionUnits = sumDoseUnits(pairedDoses, (dose) => dose.correction_units ?? 0);
  const loggedTotalUnits = loggedMealUnits + loggedCorrectionUnits;
  const ratio = expectedTotalUnits > 0 ? loggedTotalUnits / expectedTotalUnits : null;
  const mealRatio = expectedMealUnits > 0 ? loggedMealUnits / expectedMealUnits : null;
  const coverageGapUnits = loggedTotalUnits - expectedTotalUnits;
  const coverageGapAbs = Math.abs(coverageGapUnits);
  const coveragePercent = ratio === null ? null : Math.round(ratio * 100);
  const mealCount = mealGroup.carbEntries.length;
  const doseCount = pairedDoses.length;

  let value = "Aligned";
  let status = "Logged close to expected";
  let color = "#35a879";

  if (ratio === null) {
    value = "Review";
    status = "Expected coverage is near zero";
    color = "#f59e0b";
  } else if (ratio < 0.75) {
    value = "Under-covered";
    status = `${coverageGapAbs.toFixed(1)}u below estimate`;
    color = "#ef4444";
  } else if (ratio > 1.25) {
    value = "Over-covered";
    status = `${coverageGapAbs.toFixed(1)}u above estimate`;
    color = "#3b82f6";
  } else if (mealRatio !== null && mealRatio < 0.75 && loggedCorrectionUnits > 0.1) {
    value = "Correction-heavy";
    status = "Correction insulin is carrying the coverage";
    color = "#f59e0b";
  } else if (peakOutcome && peakOutcome.value > insulinSettings.targetHigh + 20) {
    value = "Rise detected";
    status = "Coverage aligned, but glucose rose after meal";
    color = "#f59e0b";
  } else if (lowOutcome && lowOutcome.value < insulinSettings.targetLow) {
    value = "Drop detected";
    status = "Coverage aligned, but glucose dropped after meal";
    color = "#3b82f6";
  }

  return {
    value,
    status,
    color,
    sub: `${Math.round(mealGroup.carbs)}g carbs - ${loggedTotalUnits.toFixed(1)}u logged`,
    details: {
      meal: {
        ...mealGroup.carbEntries[0],
        carbs: mealGroup.carbs,
        time: mealTime,
      },
      mealGroup,
      gramsPerUnit,
      expectedMealUnits,
      correctionUnitsNeeded: Math.max(0, correctionUnitsNeeded),
      priorActiveUnits,
      expectedTotalUnits,
      loggedMealUnits,
      loggedCorrectionUnits,
      loggedTotalUnits,
      ratio,
      coverageGapUnits,
      coveragePercent,
      mealCount,
      doseCount,
      glucoseValue: Number.isFinite(glucoseValue) ? glucoseValue : null,
      peakOutcome: peakOutcome?.value ?? null,
      lowOutcome: lowOutcome?.value ?? null,
      windowStart,
      windowEnd,
    },
  };
}

function computeNetCarbTrajectory(doses, carbEntries, latestGlucose, insulinSettings) {
  const now = Date.now();
  let horizon = now;
  const safeDoses = Array.isArray(doses) ? doses : [];
  const safeCarbEntries = Array.isArray(carbEntries) ? carbEntries : [];

  safeDoses.forEach((dose) => {
    const curve = generateActivityCurve(dose, insulinSettings.durationHours);
    if (curve.length) horizon = Math.max(horizon, curve[curve.length - 1].time);
  });

  safeCarbEntries.forEach((entry) => {
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
    const activeUnits = getTotalActiveUnits(safeDoses, time, (dose) => dose.units, insulinSettings.durationHours);
    const activeMealUnits = getTotalActiveMealUnits(safeDoses, time, insulinSettings.durationHours);
    const activeCarbs = getActiveCarbsAt(safeCarbEntries, time);

    points.push({
      time,
      activeUnits,
      activeMealUnits,
      activeCarbs,
      net: activeCarbs - activeMealUnits * gramsPerUnit,
    });
  }

  const peak = points.reduce((highest, point) => (point.net > highest.net ? point : highest), points[0]);
  const trough = points.reduce((lowest, point) => (point.net < lowest.net ? point : lowest), points[0]);

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
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
          className="tooltip-popover relative w-full max-w-xs overflow-hidden rounded-2xl border p-4 shadow-2xl backdrop-blur-2xl"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.2), rgba(255,255,255,0.07))",
            borderColor: "rgba(255,255,255,0.22)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.38), inset 0 1px 1px rgba(255,255,255,0.34), inset 0 -1px 1px rgba(255,255,255,0.08)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-8 opacity-70"
            style={{
              background: "radial-gradient(circle at 25% 0%, rgba(255,255,255,0.24), transparent 34%), radial-gradient(circle at 88% 120%, rgba(45,212,191,0.16), transparent 42%)",
            }}
          />
          <div className="relative z-10">
            <div className="mb-2 flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-white">{title}</p>
              <button onClick={onClose} className="text-white/40 transition-colors hover:text-white/80">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-white/50">{description}</p>
            {children}
          </div>
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

function RiskSparkline({ points, color }) {
  if (points.length < 2) return null;

  const width = 240;
  const height = 36;
  const values = points.map((point) => point.net);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const path = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.net - min) / range) * height;
      return `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");

  const zeroY = height - ((0 - min) / range) * height;

  return (
    <svg className="balance-sparkline" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetricCard({ label, value, sub, status, color, tooltipId, openTooltip, setOpenTooltip }) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="metric-card relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl border p-4 backdrop-blur-sm"
      style={{
        background: "linear-gradient(145deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0))",
        borderColor: "rgba(255,255,255,0.16)",
        boxShadow: "0 14px 36px rgba(0,0,0,0.18), inset 0 1px 1px rgba(255,255,255,0.24), inset 0 -1px 1px rgba(255,255,255,0.06)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 opacity-60"
        style={{
          background: "radial-gradient(circle at 25% 0%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 92% 118%, rgba(45,212,191,0.08), transparent 42%)",
        }}
      />
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <AmbientOrb color={color} />
      </div>

      <div className="relative z-10 mb-1 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
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

export default function ActiveInsulinBanner({ doses = [], latestGlucose, glucoseReadings = [], carbEntries = [] }) {
  const [openTooltip, setOpenTooltip] = useState(null);
  const [insulinSettings, setInsulinSettings] = useState(readInsulinSettings);
  const safeDoses = Array.isArray(doses) ? doses : [];
  const safeGlucoseReadings = Array.isArray(glucoseReadings) ? glucoseReadings : [];
  const safeCarbEntries = Array.isArray(carbEntries) ? carbEntries : [];

  useEffect(() => {
    const refreshSettings = () => setInsulinSettings(readInsulinSettings());
    window.addEventListener("insulin-settings-updated", refreshSettings);
    window.addEventListener("storage", refreshSettings);

    return () => {
      window.removeEventListener("insulin-settings-updated", refreshSettings);
      window.removeEventListener("storage", refreshSettings);
    };
  }, []);

  useEffect(() => {
    if (!openTooltip || typeof window === "undefined") return undefined;

    const scrollY = window.scrollY;
    const previousBodyOverflow = document.body.style.overflow;
    const previousBodyPosition = document.body.style.position;
    const previousBodyTop = document.body.style.top;
    const previousBodyWidth = document.body.style.width;
    const previousHtmlOverflow = document.documentElement.style.overflow;

    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.body.style.position = previousBodyPosition;
      document.body.style.top = previousBodyTop;
      document.body.style.width = previousBodyWidth;
      document.documentElement.style.overflow = previousHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [openTooltip]);

  const activeUnits = useMemo(() => getTotalActiveUnits(safeDoses, Date.now(), (dose) => dose.units, insulinSettings.durationHours), [safeDoses, insulinSettings.durationHours]);
  const activeMealUnits = useMemo(() => getTotalActiveMealUnits(safeDoses, Date.now(), insulinSettings.durationHours), [safeDoses, insulinSettings.durationHours]);
  const activeCorrectionUnits = useMemo(() => getTotalActiveCorrectionUnits(safeDoses, Date.now(), insulinSettings.durationHours), [safeDoses, insulinSettings.durationHours]);
  const activeCarbs = useMemo(() => getActiveCarbsNow(safeCarbEntries), [safeCarbEntries]);
  const totalCarbsToday = useMemo(() => getTotalCarbsToday(safeCarbEntries), [safeCarbEntries]);

  const trajectory = useMemo(
    () => computeNetCarbTrajectory(safeDoses, safeCarbEntries, latestGlucose, insulinSettings),
    [safeDoses, safeCarbEntries, latestGlucose, insulinSettings]
  );

  const worstPoint = useMemo(() => {
    if (!trajectory.peak || !trajectory.trough) return null;
    return Math.abs(trajectory.peak.net) >= Math.abs(trajectory.trough.net)
      ? trajectory.peak
      : trajectory.trough;
  }, [trajectory]);

  const mealInsight = useMemo(
    () => computeMealAlignmentInsight(safeDoses, safeCarbEntries, safeGlucoseReadings, latestGlucose, insulinSettings),
    [safeDoses, safeCarbEntries, safeGlucoseReadings, latestGlucose, insulinSettings]
  );

  const netActiveCarbs = worstPoint?.net ?? 0;
  const netPeakTime = worstPoint?.time ?? null;
  const isPeakInFuture = Boolean(netPeakTime && netPeakTime > Date.now() + 60000);
  const needsInsulinPlan = !insulinSettings.isComplete;
  const correctionOnlyActive =
    activeCorrectionUnits > 0.01 &&
    activeMealUnits <= 0.01 &&
    activeCarbs <= 0.5;

  const netValue = needsInsulinPlan
    ? "Setup needed"
    : correctionOnlyActive
      ? "Correction active"
      : netActiveCarbs > 5
        ? "High Carb Activity"
        : netActiveCarbs < -5
          ? "High Insulin Activity"
          : "In balance";

  const netLabel = needsInsulinPlan
    ? "Add insulin plan in Settings"
    : correctionOnlyActive
      ? "No meal carbs digesting"
      : netActiveCarbs > 5
        ? "Glucose may rise"
        : netActiveCarbs < -5
          ? "Glucose may fall"
          : "Carbs and insulin are aligned";

  const netColor = needsInsulinPlan || correctionOnlyActive
    ? "#f59e0b"
    : netActiveCarbs > 5
      ? "#ef4444"
      : netActiveCarbs < -5
        ? "#3b82f6"
        : "#35a879";

  const dailyAverage = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const readingsToday = safeGlucoseReadings.filter((reading) => new Date(reading.recorded_at) >= today);
    if (!readingsToday.length) return null;
    return Math.round(readingsToday.reduce((sum, reading) => sum + reading.value, 0) / readingsToday.length);
  }, [safeGlucoseReadings]);

  const trend = useMemo(() => {
    if (safeGlucoseReadings.length < 2) return { icon: "right", label: "Stable" };
    const difference = safeGlucoseReadings[0].value - safeGlucoseReadings[1].value;
    if (difference >= 7) return { icon: "up", label: "Rising" };
    if (difference >= 4) return { icon: "up-right", label: "Slowly rising" };
    if (difference >= -3) return { icon: "right", label: "Stable" };
    if (difference >= -6) return { icon: "down-right", label: "Slowly falling" };
    return { icon: "down", label: "Falling" };
  }, [safeGlucoseReadings]);

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
  const inRange = glucoseValue == null ? null : glucoseValue >= targetLow && glucoseValue <= targetHigh;
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
          <TooltipPopover
            title="Meal Coverage Alignment"
            description="This groups carb and insulin logs that happen within about 30 minutes, then compares logged insulin with the estimate from your settings. It is an insight, not a dosing recommendation."
            onClose={() => setOpenTooltip(null)}
          >
            {mealInsight.details && (
              <div className="mt-3 space-y-3">
                <div
                  className="rounded-xl border p-3"
                  style={{
                    borderColor: `${mealInsight.color}44`,
                    background: `${mealInsight.color}12`,
                  }}
                >
                  <p className="text-sm font-semibold" style={{ color: mealInsight.color }}>
                    {mealInsight.status}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/50">
                    Expected {mealInsight.details.expectedTotalUnits.toFixed(1)}u for this grouped meal. Logged{" "}
                    {mealInsight.details.loggedTotalUnits.toFixed(1)}u.
                    {mealInsight.details.coveragePercent !== null && (
                      <> That is {mealInsight.details.coveragePercent}% of the estimate.</>
                    )}
                  </p>
                </div>

                <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/45">
                  <div className="flex justify-between gap-3">
                    <span>Grouped carbs</span>
                    <span className="font-semibold text-white/70">
                      {Math.round(mealInsight.details.meal.carbs)}g
                      {mealInsight.details.mealCount > 1 ? ` across ${mealInsight.details.mealCount} logs` : ""}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Carb coverage estimate</span>
                    <span className="font-semibold text-white/70">{mealInsight.details.expectedMealUnits.toFixed(1)}u</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Correction estimate</span>
                    <span className="font-semibold text-white/70">{mealInsight.details.correctionUnitsNeeded.toFixed(1)}u</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Prior active insulin</span>
                    <span className="font-semibold text-white/70">-{mealInsight.details.priorActiveUnits.toFixed(1)}u</span>
                  </div>
                  <div className="flex justify-between gap-3 border-t border-white/10 pt-2">
                    <span>Total expected</span>
                    <span className="font-semibold text-white/80">{mealInsight.details.expectedTotalUnits.toFixed(1)}u</span>
                  </div>
                  <div className="flex justify-between gap-3">
                    <span>Logged insulin</span>
                    <span className="font-semibold text-white/80">
                      {mealInsight.details.loggedTotalUnits.toFixed(1)}u
                      {mealInsight.details.doseCount > 1 ? ` across ${mealInsight.details.doseCount} logs` : ""}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-white/30">
                    <span>Expected</span>
                    <span>Logged</span>
                  </div>
                  <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full bg-white/25"
                      style={{ width: `${Math.min(100, Math.max(4, mealInsight.details.expectedTotalUnits * 12))}%` }}
                    />
                    <div
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.max(4, mealInsight.details.loggedTotalUnits * 12))}%`,
                        backgroundColor: mealInsight.color,
                      }}
                    />
                  </div>
                </div>

                {(mealInsight.details.peakOutcome || mealInsight.details.lowOutcome) && (
                  <div className="flex justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/45">
                    <span>Post-meal glucose</span>
                    <span className="font-semibold text-white/70">
                      {mealInsight.details.lowOutcome ?? "--"}-{mealInsight.details.peakOutcome ?? "--"} mg/dL
                    </span>
                  </div>
                )}
              </div>
            )}
          </TooltipPopover>
        )}
      </AnimatePresence>

      <div className="relative -mx-4 px-4 pb-6 pt-2">
        <div className="mb-6 flex flex-col items-center pt-2 text-center">
          <span className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-white/30">Current Glucose</span>
          <div className="flex items-end gap-3">
            <span className="text-[72px] font-black leading-none text-white sm:text-[88px]">
              {glucoseValue ?? "--"}
            </span>
            {latestGlucose && <TrendIcon className="mb-3 h-8 w-8" style={{ color: glucoseColor }} />}
          </div>
          <span className="mb-2 text-sm font-medium text-white/35">mg/dL</span>
          {latestGlucose?.recorded_at && (
            <span className="mb-3 text-xs text-white/35">
              {formatRelativeAge(new Date(latestGlucose.recorded_at).getTime())}
            </span>
          )}
          <div
            className="relative flex items-center gap-2 overflow-hidden rounded-full border px-4 py-2 backdrop-blur-sm"
            style={{
              backgroundColor: `${glucoseColor}18`,
              borderColor: `${glucoseColor}40`,
              boxShadow: "0 10px 28px rgba(0,0,0,0.16), inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 1px rgba(255,255,255,0.06)",
            }}
          >
            <span className="relative z-10 h-1.5 w-1.5 rounded-full" style={{ backgroundColor: glucoseColor }} />
            <span className="relative z-10 text-sm font-semibold" style={{ color: glucoseColor }}>{trend.label}</span>
          </div>
        </div>

        {latestGlucose && (
          <div
            className="dashboard-surface relative mb-6 flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 backdrop-blur-sm"
            style={{
              background: "linear-gradient(145deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0))",
              borderColor: "rgba(255,255,255,0.16)",
              boxShadow: "0 14px 36px rgba(0,0,0,0.18), inset 0 1px 1px rgba(255,255,255,0.24), inset 0 -1px 1px rgba(255,255,255,0.06)",
            }}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-6 opacity-50"
              style={{
                background: "radial-gradient(circle at 25% 0%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 92% 118%, rgba(45,212,191,0.08), transparent 42%)",
              }}
            />
            <div className="relative z-10 flex h-5 items-end gap-0.5">
              {[3, 4, 3, 5, 4, 3, 4, 5, 3].map((height, index) => (
                <span
                  key={index}
                  className="w-0.5 rounded-full"
                  style={{ height: height * 3, backgroundColor: inRange ? "#35a87988" : "#f59e0b88" }}
                />
              ))}
            </div>
            <div className="relative z-10 flex-1">
              <p className="text-sm font-semibold text-white/80">{inRange ? "In range" : "Out of range"}</p>
              <p className="text-xs text-white/35">Target: {targetLow}-{targetHigh} mg/dL</p>
            </div>
          </div>
        )}

        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/25">At a Glance</p>
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
            value={mealInsight.value}
            sub={mealInsight.sub}
            status={mealInsight.status}
            color={mealInsight.color}
            tooltipId="net-carbs"
            openTooltip={openTooltip}
            setOpenTooltip={setOpenTooltip}
          />
          <MetricCard
            label="Daily Average"
            value={dailyAverage ? `${dailyAverage}` : "--"}
            sub={dailyAverage ? "mg/dL" : "No data today"}
            status={glucoseStatus(dailyAverage)}
            color={!dailyAverage ? "#35a879" : dailyAverage < 70 ? "#3b82f6" : dailyAverage > 180 ? "#f59e0b" : "#10b981"}
          />
        </div>
      </div>
    </>
  );
}
