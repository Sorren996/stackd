import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Info,
  X,
} from "lucide-react";
import { getHighProteinFatMonitoringStatus, formatMonitoringEndTime } from "@/lib/mealMonitoring";
import {
  generateActivityCurve,
  getDoseIOB,
  getDoseStatus,
  getDoseTimingInfo,
  getTotalBolusIOB,
  INSULIN_PROFILES,
  isBolusInsulinType,
} from "@/lib/insulinPharmacology";
import {
  generateCarbCurve,
  getActiveCarbsNow,
  getCarbAbsorptionAt,
} from "@/lib/carbAbsorption";
import { AnimatePresence, motion } from "framer-motion";
import MealBalanceTooltip from "./MealBalanceTooltip";
import DoseTimeline from "./DoseTimeline";
import ComfortZoneCard from "./ComfortZoneCard";
import { getSupportiveGlucoseMessage } from "@/lib/supportiveMessages";

const SAMPLE_STEP_MS = 5 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const DEFAULT_PRE_MEAL_WINDOW_MINUTES = 45;
const DEFAULT_POST_MEAL_WINDOW_MINUTES = 90;
const DEFAULT_OUTCOME_WINDOW_MINUTES = 240;
const MEAL_GROUP_WINDOW_MS = 30 * MINUTE_MS;

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };

  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);

  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180,
  };
}

function getDefaultMealInsulinTypes() {
  return Object.entries(INSULIN_PROFILES)
    .filter(([, profile]) => ["Rapid-Acting", "Short-Acting"].includes(profile.category))
    .map(([name]) => name);
}

function readMealInsulinTypes() {
  try {
    const parsed = JSON.parse(localStorage.getItem("meal_insulin_types") || "null");
    return Array.isArray(parsed) && parsed.length ? parsed : getDefaultMealInsulinTypes();
  } catch {
    return getDefaultMealInsulinTypes();
  }
}

function readInsulinSettings() {
  const insulinSensitivityMgDlPerUnit = Number(
    localStorage.getItem("insulin_sensitivity_mgdl_per_unit")
  );
  const mealInsulinUnitsPer5g = Number(
    localStorage.getItem("meal_insulin_units_per_5g")
  );
  const correctionTargetGlucose = Number(
    localStorage.getItem("correction_target_glucose") || 110
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
    mealInsulinTypes: readMealInsulinTypes(),
    preMealWindowMinutes: preMealWindowMinutes > 0 ? preMealWindowMinutes : DEFAULT_PRE_MEAL_WINDOW_MINUTES,
    postMealWindowMinutes: postMealWindowMinutes > 0 ? postMealWindowMinutes : DEFAULT_POST_MEAL_WINDOW_MINUTES,
    outcomeWindowMinutes: outcomeWindowMinutes > 0 ? outcomeWindowMinutes : DEFAULT_OUTCOME_WINDOW_MINUTES,
    targetLow,
    targetHigh,
    correctionTargetGlucose: correctionTargetGlucose > 0 ? correctionTargetGlucose : 110,
    targetGlucose: correctionTargetGlucose > 0 ? correctionTargetGlucose : 110,
    isComplete:
      insulinSensitivityMgDlPerUnit > 0 &&
      mealInsulinUnitsPer5g > 0,
  };
}

function getDosePartIOB(dose, targetTime = Date.now(), selectUnits = (item) => item.units) {
  const totalUnits = Number(dose?.units);
  const selectedUnits = Number(selectUnits(dose));
  if (
    !Number.isFinite(totalUnits) ||
    totalUnits <= 0 ||
    !Number.isFinite(selectedUnits) ||
    selectedUnits <= 0
  ) {
    return 0;
  }

  return getDoseIOB(dose, targetTime) * Math.min(1, selectedUnits / totalUnits);
}

function getSelectedDoseIOB(doses, targetTime = Date.now(), selectUnits = (dose) => dose.units) {
  return (Array.isArray(doses) ? doses : []).reduce((sum, dose) => {
    if (!isBolusInsulinType(dose?.insulin_type)) return sum;
    return sum + getDosePartIOB(dose, targetTime, selectUnits);
  }, 0);
}

function getTotalMealIOB(doses, targetTime = Date.now()) {
  // Older records predate the meal/correction split, so retain their prior behavior.
  return getSelectedDoseIOB(doses, targetTime, (dose) => dose.meal_units ?? dose.units);
}

function getTotalCorrectionIOB(doses, targetTime = Date.now()) {
  return getSelectedDoseIOB(doses, targetTime, (dose) => dose.correction_units ?? 0);
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

function isMealCoverageInsulin(dose, insulinSettings = {}) {
  const selectedTypes = insulinSettings.mealInsulinTypes || getDefaultMealInsulinTypes();
  return selectedTypes.includes(dose.insulin_type);
}

function buildMealEventGroups(carbEntries, doses, insulinSettings = {}) {
  const preMealWindowMs = (insulinSettings.preMealWindowMinutes ?? DEFAULT_PRE_MEAL_WINDOW_MINUTES) * MINUTE_MS;
  const postMealWindowMs = (insulinSettings.postMealWindowMinutes ?? DEFAULT_POST_MEAL_WINDOW_MINUTES) * MINUTE_MS;
  const carbEvents = (Array.isArray(carbEntries) ? carbEntries : [])
    .map((entry) => ({
      type: "carb",
      time: getEntryTime(entry),
      carbs: Number(entry.carbs),
      entry,
    }))
    .filter((event) => Number.isFinite(event.time) && Number.isFinite(event.carbs) && event.carbs > 0);

  const doseEvents = (Array.isArray(doses) ? doses : [])
    .filter((dose) => isMealCoverageInsulin(dose, insulinSettings))
    .map((dose) => ({
      type: "dose",
      time: getDoseTime(dose),
      units: Number(dose.units),
      dose,
    }))
    .filter((event) => Number.isFinite(event.time) && Number.isFinite(event.units) && event.units > 0);

  const carbGroups = [];

  carbEvents
    .sort((a, b) => a.time - b.time)
    .forEach((event) => {
      const lastGroup = carbGroups[carbGroups.length - 1];
      if (!lastGroup || event.time - lastGroup.end > MEAL_GROUP_WINDOW_MS) {
        carbGroups.push({
          start: event.time,
          end: event.time,
          carbEvents: [event],
        });
        return;
      }

      lastGroup.end = event.time;
      lastGroup.carbEvents.push(event);
    });

  return carbGroups
    .map((group) => {
      const carbs = group.carbEvents.reduce((sum, event) => sum + event.carbs, 0);
      const carbTimeTotal = group.carbEvents.reduce((sum, event) => sum + event.time * event.carbs, 0);
      const mealTime = carbs > 0 ? carbTimeTotal / carbs : group.start;
      const pairingStart = group.start - preMealWindowMs;
      const pairingEnd = group.end + postMealWindowMs;
      const groupDoses = doseEvents
        .filter((event) => event.time >= pairingStart && event.time <= pairingEnd)
        .map((event) => event.dose);

      return {
        ...group,
        start: pairingStart,
        end: pairingEnd,
        carbLogStart: group.start,
        carbLogEnd: group.end,
        carbs,
        mealTime,
        carbEntries: group.carbEvents.map((event) => event.entry),
        doses: groupDoses,
      };
    });
}

function computeMealAlignmentInsight(doses, carbEntries, glucoseReadings, latestGlucose, insulinSettings) {
  if (!insulinSettings.isComplete) {
    return {
      value: "Setup needed",
      status: "Add insulin plan in Settings",
      color: "#d4a056",
      sub: "Enter I:C ratio and sensitivity",
      details: null,
    };
  }

  const groups = buildMealEventGroups(carbEntries, doses, insulinSettings).sort((a, b) => b.mealTime - a.mealTime);

  if (!groups.length) {
    return {
      value: "No meal data",
      status: "Log carbs to assess coverage",
      color: "#d4a056",
      sub: "Waiting for carb log",
      details: null,
    };
  }

  const now = Date.now();
  const outcomeWindowMs = insulinSettings.outcomeWindowMinutes * MINUTE_MS;
  const mealGroup = groups.find((group) => now - group.mealTime <= outcomeWindowMs) ?? groups[0];
  const mealTime = mealGroup.mealTime;
  const mealStillUnderReview = now - mealTime <= outcomeWindowMs;
  const windowStart = mealGroup.start;
  const windowEnd = mealGroup.end;
  const pairedDoses = mealGroup.doses;
  const mealCoverageDoses = (Array.isArray(doses) ? doses : []).filter((dose) => isMealCoverageInsulin(dose, insulinSettings));
  const glucoseAtMeal = getClosestGlucose(glucoseReadings, mealTime) ?? latestGlucose ?? null;
  const glucoseValue = Number(glucoseAtMeal?.value);
  const glucoseTime = new Date(glucoseAtMeal?.recorded_at).getTime();
  const glucoseMinutesFromMeal = Number.isFinite(glucoseTime)
    ? Math.round(Math.abs(glucoseTime - mealTime) / MINUTE_MS)
    : null;
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

  const correctiveInsulinDoses = peakOutcome
    ? (Array.isArray(doses) ? doses : []).filter((dose) => {
        const doseTime = getDoseTime(dose);
        return (
          isMealCoverageInsulin(dose, insulinSettings) &&
          Number.isFinite(doseTime) &&
          doseTime > peakOutcome.time &&
          doseTime <= mealTime + outcomeWindowMs
        );
      })
    : [];

  const correctiveCarbEntries = lowOutcome
    ? (Array.isArray(carbEntries) ? carbEntries : []).filter((entry) => {
        const entryTime = getEntryTime(entry);
        return (
          Number.isFinite(entryTime) &&
          entryTime > lowOutcome.time &&
          entryTime <= mealTime + outcomeWindowMs
        );
      })
    : [];

  const hasCorrectiveInsulin = correctiveInsulinDoses.length > 0;
  const hasCorrectiveCarbs = correctiveCarbEntries.length > 0;

  const latestGlucoseValue = Number(latestGlucose?.value);
  const latestGlucoseTime = new Date(latestGlucose?.recorded_at).getTime();
  const latestIsAfterMeal = Number.isFinite(latestGlucoseTime) && latestGlucoseTime >= mealTime;
  const latestInRange =
    Number.isFinite(latestGlucoseValue) &&
    latestGlucoseValue >= insulinSettings.targetLow &&
    latestGlucoseValue <= insulinSettings.targetHigh;
  const latestHigh =
    Number.isFinite(latestGlucoseValue) &&
    latestGlucoseValue > insulinSettings.targetHigh;
  const latestLow =
    Number.isFinite(latestGlucoseValue) &&
    latestGlucoseValue < insulinSettings.targetLow;
  const correctionGlucoseValue = glucoseValue;
  const correctionGlucoseAvailable = Number.isFinite(correctionGlucoseValue);
  const correctionGlucoseLow =
    correctionGlucoseAvailable && correctionGlucoseValue < insulinSettings.targetLow;
  const gramsPerUnit = 5 / insulinSettings.mealInsulinUnitsPer5g;
  const expectedMealUnits = mealGroup.carbs / gramsPerUnit;
  const correctionUnitsNeeded =
    correctionGlucoseAvailable && correctionGlucoseValue > insulinSettings.targetHigh
      ? Math.max(0, (correctionGlucoseValue - insulinSettings.correctionTargetGlucose) / insulinSettings.insulinSensitivityMgDlPerUnit)
      : 0;
  const grossDoseEstimate = Math.max(0, expectedMealUnits + correctionUnitsNeeded);
  const bolusIOB = getTotalBolusIOB(mealCoverageDoses, now);
  const loggedMealUnits = sumDoseUnits(pairedDoses, (dose) => dose.meal_units ?? dose.units);
  const loggedCorrectionUnits = sumDoseUnits(pairedDoses, (dose) => dose.correction_units ?? 0);
  const loggedTotalUnits = loggedMealUnits + loggedCorrectionUnits;
  // Fixed at meal time â€” based on what was logged, not decaying IOB
  const estimatedAdditionalUnits = Math.max(0, grossDoseEstimate - loggedTotalUnits);
  const ratio = grossDoseEstimate > 0 ? loggedTotalUnits / grossDoseEstimate : null;
  const mealRatio = expectedMealUnits > 0 ? loggedMealUnits / expectedMealUnits : null;
  const coverageGapUnits = loggedTotalUnits - grossDoseEstimate;
  const coverageGapAbs = Math.abs(coverageGapUnits);
  const coveragePercent = ratio === null ? null : Math.round(ratio * 100);
  const mealCount = mealGroup.carbEntries.length;
  const doseCount = pairedDoses.length;
  const bolusIOBBreakdown = mealCoverageDoses
    .map((dose) => {
      const iob = getDoseIOB(dose, now);
      if (iob <= 0.01 || !isBolusInsulinType(dose.insulin_type)) return null;
      const profile = INSULIN_PROFILES[dose.insulin_type];
      const status = getDoseStatus(dose, now);
      return {
        id: dose.id,
        type: dose.insulin_type,
        time: getDoseTime(dose),
        color: profile?.color || "#5ba3b8",
        category: profile?.category || "Bolus insulin",
        iob,
        units: Number(dose.units) || 0,
        status,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.iob - a.iob);

  let value = `${estimatedAdditionalUnits.toFixed(1)}u`;
  let status = "Suggested support";
  let color = "#5ba88a";
  let sub = `${Math.round(mealGroup.carbs)}g carbs · ${loggedTotalUnits.toFixed(1)}u logged`;

  // --- Point-in-time assessment (fixed at meal time, does not change as IOB decays) ---
  if (ratio === null) {
    value = "Review";
    status = "Not enough data to estimate";
    color = "#d4a056";
  } else if (correctionGlucoseLow) {
    value = "Review";
    status = "Glucose is below range - take care first";
    color = "#6b92c4";
  } else if (ratio < 0.75) {
    value = `${estimatedAdditionalUnits.toFixed(1)}u`;
    status = "Light coverage - below estimate";
    color = "#c97060";
  } else if (ratio > 1.25) {
    value = "Generous dose";
    status = `${coverageGapAbs.toFixed(1)}u above estimate`;
    color = "#6b92c4";
  } else if (!correctionGlucoseAvailable) {
    value = `${expectedMealUnits.toFixed(1)}u`;
    status = "Meal estimate - glucose unavailable";
    color = "#d4a056";
  } else {
    value = "Well balanced";
    status = "Nicely aligned";
    color = "#5ba88a";
  }

  // --- Continuous monitoring (evolves as glucose readings come in) ---
  // Priority is given to the CURRENT glucose state over historical dip/peak data,
  // so the card always reflects where you are now, not just where you've been.
  let outcomeAssessment = null;

  if (mealStillUnderReview && ratio !== null && !correctionGlucoseLow) {
    const hadDip = lowOutcome && lowOutcome.value < insulinSettings.targetLow;
    const hadSpike = peakOutcome && peakOutcome.value > insulinSettings.targetHigh + 20;

    if (latestIsAfterMeal && latestInRange) {
      // Currently in range — always show a positive recovery message
      const startPart = correctionGlucoseAvailable
        ? `You began at ${Math.round(glucoseValue)} mg/dL`
        : "You began this meal";
      const nowPart = `and you're now at ${Math.round(latestGlucoseValue)} mg/dL in your comfortable range`;

      if (hadDip) {
        outcomeAssessment = {
          label: "Settled nicely",
          message: `${startPart}, dipped to ${Math.round(lowOutcome.value)} mg/dL along the way, ${nowPart}. Well done finding your footing again.`,
          color: "#5ba88a",
        };
      } else if (hadSpike) {
        outcomeAssessment = {
          label: "Settled nicely",
          message: `${startPart}, rose to ${Math.round(peakOutcome.value)} mg/dL after eating, ${nowPart}. Nice work staying with it.`,
          color: "#5ba88a",
        };
      } else {
        outcomeAssessment = {
          label: "Tracking beautifully",
          message: `${startPart} ${nowPart}. Your support is aligning beautifully with this meal.`,
          color: "#5ba88a",
        };
      }
      value = outcomeAssessment.label;
      status = "Back in a comfortable range";
      color = "#5ba88a";
    } else if (latestIsAfterMeal && latestLow) {
      // Currently below range
      if (hadDip && hasCorrectiveCarbs) {
        outcomeAssessment = {
          label: "Rising gently",
          message: "Nourishment added. We're keeping a supportive eye on the trend as you gently rise back to your comfortable range.",
          color: "#5ba88a",
        };
        value = "Realigning";
        status = "Nourishment added, rising back";
        color = "#5ba88a";
      } else if (hadDip) {
        outcomeAssessment = {
          label: "Worth a closer look",
          message: "It looks like you've provided a bit more support than this moment needed. Please enjoy a gentle carb source and stay close to the trend while your body settles back.",
          color: "#6b92c4",
        };
        value = "Take care";
        status = "Glucose dipped below range";
        color = "#6b92c4";
      } else {
        outcomeAssessment = {
          label: "Below range",
          message: "Glucose has dipped below your comfortable range. Consider a gentle carb source and follow your established plan.",
          color: "#6b92c4",
        };
        value = "Take care";
        status = "Below comfort zone";
        color = "#6b92c4";
      }
    } else if (latestIsAfterMeal && latestHigh) {
      // Currently above range
      if (hadSpike && hasCorrectiveInsulin) {
        outcomeAssessment = {
          label: "Finding its balance",
          message: "You added a little extra support, and your body is working through it now. We're watching closely as things gently return to a comfortable flow.",
          color: "#5ba88a",
        };
        value = "Realigning";
        status = "Support added, settling back";
        color = "#5ba88a";
      } else if (hadSpike) {
        outcomeAssessment = {
          label: "Still settling",
          message: "Glucose is climbing a little higher than we'd like. Let's give it some gentle time to see how your body finds its balance before adding more support.",
          color: "#d4a056",
        };
        value = "Still settling";
        status = "Glucose trending above range";
        color = "#d4a056";
      } else {
        outcomeAssessment = {
          label: "Above range",
          message: "Glucose is a little above your comfortable range. Give it some gentle time to settle before adding more support.",
          color: "#d4a056",
        };
        value = "Still settling";
        status = "Above comfort zone";
        color = "#d4a056";
      }
    }
  }

  if (!mealStillUnderReview) {
    value = "Window passed";
    status = "Nice job staying on top of it";
    color = "#5ba88a";
    sub = `${Math.round(mealGroup.carbs)}g meal reviewed`;

    outcomeAssessment = {
      label: "Meal window passed",
      message: "Meal window has passed. Nice job staying on top of it.",
      color: "#5ba88a",
    };
  }

  return {
    value,
    status,
    color,
    sub,
    details: {
      meal: {
        ...mealGroup.carbEntries[0],
        carbs: mealGroup.carbs,
        time: mealTime,
      },
      mealGroup,
      gramsPerUnit,
      expectedMealUnits,
      correctionUnitsNeeded,
      correctionGlucoseAvailable,
      correctionGlucoseLow,
      correctionTargetGlucose: insulinSettings.correctionTargetGlucose,
      correctionGlucoseValue: Number.isFinite(correctionGlucoseValue) ? correctionGlucoseValue : null,
      glucoseMinutesFromMeal,
      grossDoseEstimate,
      bolusIOB,
      bolusIOBBreakdown,
      estimatedAdditionalUnits,
      expectedTotalUnits: grossDoseEstimate,
      loggedMealUnits,
      loggedCorrectionUnits,
      loggedTotalUnits,
      ratio,
      coverageGapUnits,
      coveragePercent,
      mealCount,
      doseCount,
      glucoseValue: Number.isFinite(glucoseValue) ? glucoseValue : null,
      latestGlucoseValue: Number.isFinite(latestGlucoseValue) ? latestGlucoseValue : null,
      peakOutcome: peakOutcome?.value ?? null,
      lowOutcome: lowOutcome?.value ?? null,
      outcomeAssessment,
      hasCorrectiveInsulin,
      hasCorrectiveCarbs,
      mealStillUnderReview,
      windowStart,
      windowEnd,
    },
  };
}

function computeNetCarbTrajectory(doses, carbEntries, latestGlucose, insulinSettings) {
  const now = Date.now();
  let horizon = now;
  const safeDoses = (Array.isArray(doses) ? doses : []).filter((dose) => isMealCoverageInsulin(dose, insulinSettings));
  const safeCarbEntries = Array.isArray(carbEntries) ? carbEntries : [];

  safeDoses.forEach((dose) => {
    const curve = generateActivityCurve(dose);
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
    const bolusIOB = getTotalBolusIOB(safeDoses, time);
    const mealIOB = getTotalMealIOB(safeDoses, time);
    const activeCarbs = getActiveCarbsAt(safeCarbEntries, time);

    points.push({
      time,
      bolusIOB,
      mealIOB,
      activeCarbs,
      net: activeCarbs - mealIOB * gramsPerUnit,
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

function MetricCard({ label, value, sub, status, color, tooltipId, openTooltip, setOpenTooltip, footer }) {
  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="metric-card relative flex min-h-[112px] flex-col justify-between overflow-hidden rounded-2xl border p-4 backdrop-blur-sm"
      style={{
        background: "linear-gradient(145deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0))",
        borderColor: "rgba(255,255,255,0.16)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 1px rgba(255,255,255,0.05)",
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
      {footer && (
        <div className="relative z-10 mt-3 space-y-1.5 border-t border-white/10 pt-3">
          {footer}
        </div>
      )}
    </motion.div>
  );
}

function ActiveInsulinDetailCard({ totalUnits, breakdown }) {
  const hasBolusIOB = totalUnits > 0.01;

  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      className="metric-card relative col-span-2 overflow-hidden rounded-2xl border p-4 backdrop-blur-sm"
      style={{
        background: "linear-gradient(145deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0))",
        borderColor: "rgba(255,255,255,0.16)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 1px rgba(255,255,255,0.05)",
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 opacity-60"
        style={{
          background: "radial-gradient(circle at 20% 0%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 92% 118%, rgba(6,182,212,0.1), transparent 42%)",
        }}
      />
      <div className="relative z-10 flex items-start justify-between gap-4">
        <div>
          <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Insulin on Board</span>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-black leading-none text-white">{totalUnits.toFixed(1)}</span>
            <span className="mb-1 text-xs font-semibold text-white/35">units active</span>
          </div>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-semibold" style={{
          color: hasBolusIOB ? "#5ba3b8" : "rgba(255,255,255,0.42)",
          borderColor: hasBolusIOB ? "rgba(6,182,212,0.32)" : "rgba(255,255,255,0.1)",
          background: hasBolusIOB ? "rgba(6,182,212,0.1)" : "rgba(255,255,255,0.04)",
        }}>
          {hasBolusIOB ? "Supporting you" : "Settled"}
        </span>
      </div>

      <div className="relative z-10 mt-4">
        {breakdown.length ? (
          <DoseTimeline doses={breakdown} />
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 text-xs text-white/35">
            No bolus insulin on board estimated from current logs.
          </div>
        )}
      </div>
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

function SupportiveGlucoseMessage({ insight }) {
  if (!insight?.message) return null;

  return (
    <p
      aria-live="polite"
      className="text-legible-strong mx-auto mt-6 max-w-[85vw] text-center text-[15px] font-medium italic leading-relaxed"
      style={{ color: "rgba(255,255,255,0.95)" }}
    >
      "{insight.message}"
    </p>
  );
}

export default function ActiveInsulinBanner({ doses = [], latestGlucose, glucoseReadings = [], carbEntries = [] }) {
  const [openTooltip, setOpenTooltip] = useState(null);
  const [insulinSettings, setInsulinSettings] = useState(readInsulinSettings);
  const [targetRange, setTargetRange] = useState(readTargetRange);
  const [nowMinute, setNowMinute] = useState(() =>
    Math.floor(Date.now() / MINUTE_MS)
  );
  const safeDoses = Array.isArray(doses) ? doses : [];
  const safeGlucoseReadings = Array.isArray(glucoseReadings) ? glucoseReadings : [];
  const safeCarbEntries = Array.isArray(carbEntries) ? carbEntries : [];

  useEffect(() => {
    const refreshSettings = () => {
      setInsulinSettings(readInsulinSettings());
      setTargetRange(readTargetRange());
    };
    window.addEventListener("insulin-settings-updated", refreshSettings);
    window.addEventListener("target-range-updated", refreshSettings);
    window.addEventListener("storage", refreshSettings);

    return () => {
      window.removeEventListener("insulin-settings-updated", refreshSettings);
      window.removeEventListener("target-range-updated", refreshSettings);
      window.removeEventListener("storage", refreshSettings);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMinute(Math.floor(Date.now() / MINUTE_MS));
    }, 30 * 1000);

    return () => window.clearInterval(timer);
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

  const mealCoverageDoses = useMemo(
    () => safeDoses.filter((dose) => isMealCoverageInsulin(dose, insulinSettings)),
    [safeDoses, insulinSettings]
  );
  const activeUnits = useMemo(() => getTotalBolusIOB(safeDoses, Date.now()), [safeDoses, nowMinute]);
  const activeMealUnits = useMemo(() => getTotalMealIOB(mealCoverageDoses, Date.now()), [mealCoverageDoses, nowMinute]);
  const activeCorrectionUnits = useMemo(() => getTotalCorrectionIOB(mealCoverageDoses, Date.now()), [mealCoverageDoses, nowMinute]);
  const activeInsulinBreakdown = useMemo(() => {
    const now = Date.now();
    return safeDoses
      .filter((dose) => isBolusInsulinType(dose?.insulin_type))
      .map((dose) => {
        const iob = getDoseIOB(dose, now);
        if (iob < 0.9) return null;

          const profile = INSULIN_PROFILES[dose.insulin_type];
          const status = getDoseStatus(dose, now);
          return {
            id: dose.id,
            type: dose.insulin_type,
            shortName: dose.insulin_type?.split(" ")[0] || "Insulin",
            category: profile?.category || "Insulin",
            color: profile?.color || "#5ba3b8",
            iob,
            units: Number(dose.units) || 0,
            statusLabel: status.label,
            timingInfo: getDoseTimingInfo(dose, now),
          };
      })
      .filter(Boolean)
      .sort((a, b) => b.iob - a.iob);
  }, [safeDoses, nowMinute]);
  const activeCarbs = useMemo(() => getActiveCarbsNow(safeCarbEntries), [safeCarbEntries, nowMinute]);

  const trajectory = useMemo(
    () => computeNetCarbTrajectory(safeDoses, safeCarbEntries, latestGlucose, insulinSettings),
    [safeDoses, safeCarbEntries, latestGlucose, insulinSettings, nowMinute]
  );

  const worstPoint = useMemo(() => {
    if (!trajectory.peak || !trajectory.trough) return null;
    return Math.abs(trajectory.peak.net) >= Math.abs(trajectory.trough.net)
      ? trajectory.peak
      : trajectory.trough;
  }, [trajectory]);

  const highProteinFatStatus = useMemo(
    () => getHighProteinFatMonitoringStatus(safeCarbEntries),
    [safeCarbEntries, nowMinute]
  );

  const mealInsight = useMemo(
    () =>
      computeMealAlignmentInsight(
        safeDoses,
        safeCarbEntries,
        safeGlucoseReadings,
        latestGlucose,
        insulinSettings
      ),
    [
      safeDoses,
      safeCarbEntries,
      safeGlucoseReadings,
      latestGlucose,
      insulinSettings,
      nowMinute,
    ]
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
    ? "#d4a056"
    : netActiveCarbs > 5
      ? "#c97060"
      : netActiveCarbs < -5
        ? "#6b92c4"
        : "#5ba88a";

  const dailyAverage = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const readingsToday = safeGlucoseReadings.filter((reading) => new Date(reading.recorded_at) >= today);
    if (!readingsToday.length) return null;
    return Math.round(readingsToday.reduce((sum, reading) => sum + reading.value, 0) / readingsToday.length);
  }, [safeGlucoseReadings]);

  const comfortZonePercentage = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const readingsToday = safeGlucoseReadings.filter((reading) => new Date(reading.recorded_at) >= today);
    if (!readingsToday.length) return null;
    const inRange = readingsToday.filter(
      (reading) => reading.value >= insulinSettings.targetLow && reading.value <= insulinSettings.targetHigh
    );
    return (inRange.length / readingsToday.length) * 100;
  }, [safeGlucoseReadings, insulinSettings.targetLow, insulinSettings.targetHigh]);

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
  const targetLow = targetRange.low;
  const targetHigh = targetRange.high;
  const glucoseColor = !glucoseValue
    ? "#5ba88a"
    : glucoseValue < targetLow
      ? "#6b92c4"
      : glucoseValue > targetHigh
        ? "#d4a056"
        : "#5ba88a";

  const inRange = glucoseValue == null ? null : glucoseValue >= targetLow && glucoseValue <= targetHigh;
  const rangeCardLabel =
    glucoseValue == null
      ? "No data"
      : glucoseValue < targetLow
        ? "Below comfort zone"
        : glucoseValue > targetHigh
          ? "Above comfort zone"
          : "In comfort zone";
  const rangeSparkColor =
    glucoseValue == null
      ? "#5ba88a88"
      : glucoseValue < targetLow
        ? "#6b92c488"
        : glucoseValue > targetHigh
          ? "#d4a05688"
          : "#5ba88a88";
  const glucoseReadingAgeMinutes = latestGlucose?.recorded_at
    ? Math.floor((Date.now() - new Date(latestGlucose.recorded_at).getTime()) / MINUTE_MS)
    : null;
  const supportiveGlucoseInsight = useMemo(
    () =>
      getSupportiveGlucoseMessage({
        glucose: latestGlucose,
        targetLow,
        targetHigh,
        trend,
        activeInsulin: activeUnits,
        activeCarbs,
        readingAgeMinutes: glucoseReadingAgeMinutes,
        seed: latestGlucose?.id || latestGlucose?.recorded_at || `${Math.floor(Date.now() / (30 * MINUTE_MS))}`,
      }),
    [latestGlucose, targetLow, targetHigh, trend, activeUnits, activeCarbs, glucoseReadingAgeMinutes]
  );
  const TrendIcon = TREND_ICONS[trend.icon] || ArrowRight;

  const glucoseStatus = (value) => {
    if (!value) return "No data";
    if (value < targetLow) return "Below comfort zone";
    if (value > targetHigh) return "Above comfort zone";
    return "In comfort zone";
  };

  return (
    <>
      <MealBalanceTooltip
        mealInsight={mealInsight}
        open={openTooltip === "net-carbs"}
        onClose={() => setOpenTooltip(null)}
        monitoringStatus={highProteinFatStatus}
        glucoseTrend={trend}
      />

      <div className="relative -mx-4 px-4 pb-6 pt-2">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 -top-2 mx-auto h-[260px] max-w-[420px] rounded-full"
          style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.28) 0%, transparent 70%)" }}
        />
        <div className="relative z-10 mb-6 flex flex-col items-center pt-2 text-center">
          <span className="text-legible mb-5 text-[10px] font-bold uppercase tracking-[0.25em] text-white">
            {supportiveGlucoseInsight?.intent || "Your Journey"}
          </span>
          <div className="flex items-end gap-3">
            <span className="text-legible-strong text-[72px] font-black leading-none text-white sm:text-[88px]">
              {glucoseValue ?? "--"}
            </span>
            {latestGlucose && <TrendIcon className="text-legible mb-3 h-8 w-8" style={{ color: glucoseColor }} />}
          </div>
          <span className="text-legible mb-1 text-sm font-medium text-white/45">mg/dL</span>
          {latestGlucose?.recorded_at && (
            <span className="text-legible mb-4 text-xs text-white/45">
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
          <SupportiveGlucoseMessage insight={supportiveGlucoseInsight} />
        </div>

        {latestGlucose && (
          <div
            className="dashboard-surface relative mb-6 flex items-center gap-3 overflow-hidden rounded-2xl border px-4 py-3 backdrop-blur-sm"
            style={{
              background: "linear-gradient(145deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0))",
              borderColor: "rgba(255,255,255,0.16)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.10), 0 4px 12px rgba(0,0,0,0.06), inset 0 1px 1px rgba(255,255,255,0.22), inset 0 -1px 1px rgba(255,255,255,0.05)",
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
                  style={{ height: height * 3, backgroundColor: rangeSparkColor }}
                />
              ))}
            </div>
            <div className="relative z-10 flex-1">
              <p className="text-sm font-semibold text-white/80">{rangeCardLabel}</p>
              <p className="text-xs text-white/35">Target: {targetLow}-{targetHigh} mg/dL</p>
            </div>
          </div>
        )}

        <p className="text-legible mb-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white">Your Rhythm</p>
        <div className="grid grid-cols-2 gap-3">
          <ActiveInsulinDetailCard totalUnits={activeUnits} breakdown={activeInsulinBreakdown} />
          <div className="col-span-2">
            <MetricCard
              label="Meal Balance"
              value={mealInsight.value}
              sub={mealInsight.sub}
              status={mealInsight.status}
              color={mealInsight.color}
              tooltipId="net-carbs"
              openTooltip={openTooltip}
              setOpenTooltip={setOpenTooltip}
              footer={highProteinFatStatus.isActive ? (
                <div>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0 text-amber-400/80" />
                    <span className="text-[11px] font-semibold text-amber-400/90">Delayed meal response possible</span>
                  </div>
                  <p className="mt-1 pl-[18px] text-[10px] leading-relaxed text-white/40">
                    High protein or fat was logged. Glucose effects may be delayed or less predictable.
                  </p>
                  <p className="mt-1 pl-[18px] text-[10px] font-medium text-amber-400/60">
                    Monitor through {formatMonitoringEndTime(highProteinFatStatus.endTime)}
                  </p>
                </div>
              ) : undefined}
            />
          </div>
          <MetricCard
            label="Daily Average"
            value={dailyAverage ? `${dailyAverage}` : "--"}
            sub={dailyAverage ? "mg/dL" : "No data today"}
            status={glucoseStatus(dailyAverage)}
            color={!dailyAverage ? "#5ba88a" : dailyAverage < targetLow ? "#6b92c4" : dailyAverage > targetHigh ? "#d4a056" : "#5ba88a"}
          />
          <ComfortZoneCard percentage={comfortZonePercentage} />
        </div>
      </div>
    </>
  );
}