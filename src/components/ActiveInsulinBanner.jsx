import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowDownRight,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  ChevronsDown,
  ChevronsUp,
  Info,
  X } from
"lucide-react";
import { getHighProteinFatMonitoringStatus, formatMonitoringEndTime } from "@/lib/mealMonitoring";
import {
  generateActivityCurve,
  getDoseIOB,
  getDoseStatus,
  getDoseTimingInfo,
  getInsulinCategory,
  getInsulinProfile,
  getTotalBolusIOB,
  getTotalIOB,
  INSULIN_PROFILES,
  isBolusInsulinType,
  isBasalInsulinType } from
"@/lib/insulinPharmacology";
import { getBasalRegimenStatus } from "@/lib/basalActivityModel";
import {
  generateCarbCurve,
  getActiveCarbsNow,
  getCarbAbsorptionAt } from
"@/lib/carbAbsorption";
import { AnimatePresence, motion } from "framer-motion";
import InsulinOnBoardCard from "@/components/insulin/InsulinOnBoardCard";
import MealReviewContent from "@/components/insulin/MealReviewContent";
import DashboardCard from "@/components/dashboard/DashboardCard";
import ComfortZoneCard from "./ComfortZoneCard";
import CurrentGlucoseCard from "./graph/CurrentGlucoseCard";
import { getSupportiveGlucoseMessage } from "@/lib/supportiveMessages";
import { computeTimeInRange, filterReadingsForStats, computeTimeInRangeFromReadings } from "@/lib/timeInRange";
import { computeGlucoseTrend, mapDexcomTrend } from "@/lib/glucoseTrend";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { useGlucoseStaleness } from "@/hooks/useGlucoseStaleness";
import { getLatestDexcomReading } from "@/lib/glucoseStaleness";
import StaleReadingBanner from "@/components/StaleReadingBanner";
import { isRescueCarbEntry } from "@/lib/rescueCarbDetection";
import { GLUCOSE_STATUS_COLORS, classifyGlucose, readHighReference, FIXED_LOW_REFERENCE } from "@/lib/glucoseStatus";
import AnchorNumber from "@/components/editorial/AnchorNumber";
import HairlineSection from "@/components/editorial/HairlineSection";

// Flip to false to instantly revert to the original dense dashboard layout.
const CLEAN_LAYOUT = true;

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
    high: Number.isFinite(high) ? high : 180
  };
}

function getDefaultMealInsulinTypes() {
  return Object.entries(INSULIN_PROFILES).
  filter(([, profile]) => ["Rapid-Acting", "Short-Acting"].includes(profile.category)).
  map(([name]) => name);
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
    mealInsulinUnitsPer5g > 0
  };
}

function getDosePartIOB(dose, targetTime = Date.now(), selectUnits = (item) => item.units) {
  const totalUnits = Number(dose?.units);
  const selectedUnits = Number(selectUnits(dose));
  if (
  !Number.isFinite(totalUnits) ||
  totalUnits <= 0 ||
  !Number.isFinite(selectedUnits) ||
  selectedUnits <= 0)
  {
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

function buildMealEventGroups(carbEntries, doses, insulinSettings = {}, glucoseReadings = [], targetLow = 70) {
  const preMealWindowMs = (insulinSettings.preMealWindowMinutes ?? DEFAULT_PRE_MEAL_WINDOW_MINUTES) * MINUTE_MS;
  const postMealWindowMs = (insulinSettings.postMealWindowMinutes ?? DEFAULT_POST_MEAL_WINDOW_MINUTES) * MINUTE_MS;
  const carbEvents = (Array.isArray(carbEntries) ? carbEntries : []).
  filter((entry) => {
    if (entry.is_rescue_carb === true || entry.classification === "rescue_carbs") return false;
    if (entry.classification === "meal" || entry.classification === "snack") return true;
    return !isRescueCarbEntry(entry, glucoseReadings, doses, targetLow);
  }).
  map((entry) => ({
    type: "carb",
    time: getEntryTime(entry),
    carbs: Number(entry.carbs),
    entry
  })).
  filter((event) => Number.isFinite(event.time) && Number.isFinite(event.carbs) && event.carbs > 0);

  const doseEvents = (Array.isArray(doses) ? doses : []).
  filter((dose) => isMealCoverageInsulin(dose, insulinSettings)).
  map((dose) => ({
    type: "dose",
    time: getDoseTime(dose),
    units: Number(dose.units),
    dose
  })).
  filter((event) => Number.isFinite(event.time) && Number.isFinite(event.units) && event.units > 0);

  const carbGroups = [];

  carbEvents.
  sort((a, b) => a.time - b.time).
  forEach((event) => {
    const lastGroup = carbGroups[carbGroups.length - 1];
    if (!lastGroup || event.time - lastGroup.end > MEAL_GROUP_WINDOW_MS) {
      carbGroups.push({
        start: event.time,
        end: event.time,
        carbEvents: [event]
      });
      return;
    }

    lastGroup.end = event.time;
    lastGroup.carbEvents.push(event);
  });

  return carbGroups.
  map((group) => {
    const carbs = group.carbEvents.reduce((sum, event) => sum + event.carbs, 0);
    const carbTimeTotal = group.carbEvents.reduce((sum, event) => sum + event.time * event.carbs, 0);
    const mealTime = carbs > 0 ? carbTimeTotal / carbs : group.start;
    const pairingStart = group.start - preMealWindowMs;
    const pairingEnd = group.end + postMealWindowMs;
    const groupDoses = doseEvents.
    filter((event) => event.time >= pairingStart && event.time <= pairingEnd).
    map((event) => event.dose);

    return {
      ...group,
      start: pairingStart,
      end: pairingEnd,
      carbLogStart: group.start,
      carbLogEnd: group.end,
      carbs,
      mealTime,
      carbEntries: group.carbEvents.map((event) => event.entry),
      doses: groupDoses
    };
  });
}

function computeMealAlignmentInsight(doses, carbEntries, glucoseReadings, latestGlucose, insulinSettings) {
  if (!insulinSettings.isComplete) {
    return {
      value: "Setup needed",
      status: "Add insulin plan in Settings",
      color: "#8a5a12",
      sub: "Enter I:C ratio and sensitivity",
      details: null
    };
  }

  const groups = buildMealEventGroups(carbEntries, doses, insulinSettings, glucoseReadings, insulinSettings.targetLow).sort((a, b) => b.mealTime - a.mealTime);

  const now = Date.now();
  const outcomeWindowMs = insulinSettings.outcomeWindowMinutes * MINUTE_MS;
  // Only meals still inside the user's configured review window are tracked.
  // Once the window ends the review resets to "no meal to review yet".
  // Rescue carbs never open a meal review on their own, regardless of volume.
  const mealGroup = groups.find((group) => now - group.mealTime <= outcomeWindowMs);

  if (!mealGroup) {
    return {
      value: "No meal data",
      status: "Log carbs to see your rhythm",
      color: "#8a5a12",
      sub: "Waiting for carb log",
      details: {
        noActiveMeal: true,
        rescueCarbs: 0,
        recentNormalCarbs: 0,
        activeInsulin: getTotalBolusIOB(doses, now),
        latestGlucoseValue: Number.isFinite(Number(latestGlucose?.value)) ? Number(latestGlucose?.value) : null,
      }
    };
  }

  const mealTime = mealGroup.mealTime;
  const mealStillUnderReview = true;
  const windowStart = mealGroup.start;
  const windowEnd = mealGroup.end;
  const pairedDoses = mealGroup.doses;
  const mealCoverageDoses = (Array.isArray(doses) ? doses : []).filter((dose) => isMealCoverageInsulin(dose, insulinSettings));
  const glucoseAtMeal = getClosestGlucose(glucoseReadings, mealTime) ?? latestGlucose ?? null;
  const glucoseValue = Number(glucoseAtMeal?.value);
  const glucoseTime = new Date(glucoseAtMeal?.recorded_at).getTime();
  const glucoseMinutesFromMeal = Number.isFinite(glucoseTime) ?
  Math.round(Math.abs(glucoseTime - mealTime) / MINUTE_MS) :
  null;
  const outcomeReadings = (Array.isArray(glucoseReadings) ? glucoseReadings : []).
  map((reading) => ({ ...reading, time: new Date(reading.recorded_at).getTime(), value: Number(reading.value) })).
  filter((reading) =>
  Number.isFinite(reading.time) &&
  Number.isFinite(reading.value) &&
  reading.time >= mealTime + 60 * MINUTE_MS &&
  reading.time <= mealTime + insulinSettings.outcomeWindowMinutes * MINUTE_MS
  );
  const peakOutcome = outcomeReadings.reduce((peak, reading) => !peak || reading.value > peak.value ? reading : peak, null);
  const lowOutcome = outcomeReadings.reduce((low, reading) => !low || reading.value < low.value ? reading : low, null);

  // Glucose at the end of the meal review window — frozen once the window
  // completes. While the window is still active, this is the latest reading
  // within the window; once it ends, it locks to the last reading at or
  // before mealWindowEnd so the comparison stays stable over time.
  const mealWindowEnd = mealTime + outcomeWindowMs;
  const windowEndCutoff = mealStillUnderReview ? now : mealWindowEnd;
  const windowEndGlucoseReading = (Array.isArray(glucoseReadings) ? glucoseReadings : []).
  map((reading) => ({ time: new Date(reading.recorded_at).getTime(), value: Number(reading.value) })).
  filter((reading) =>
  Number.isFinite(reading.time) &&
  Number.isFinite(reading.value) &&
  reading.time >= mealTime &&
  reading.time <= windowEndCutoff
  ).
  sort((a, b) => a.time - b.time).
  pop() ?? null;
  const windowEndGlucoseValue = Number.isFinite(windowEndGlucoseReading?.value) ? windowEndGlucoseReading.value : null;

  const correctiveInsulinDoses = peakOutcome ?
  (Array.isArray(doses) ? doses : []).filter((dose) => {
    const doseTime = getDoseTime(dose);
    return (
      isMealCoverageInsulin(dose, insulinSettings) &&
      Number.isFinite(doseTime) &&
      doseTime > peakOutcome.time &&
      doseTime <= mealTime + outcomeWindowMs);

  }) :
  [];

  const correctiveCarbEntries = lowOutcome ?
  (Array.isArray(carbEntries) ? carbEntries : []).filter((entry) => {
    const entryTime = getEntryTime(entry);
    return (
      Number.isFinite(entryTime) &&
      entryTime > lowOutcome.time &&
      entryTime <= mealTime + outcomeWindowMs);

  }) :
  [];

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
  correctionGlucoseAvailable && correctionGlucoseValue > insulinSettings.targetHigh ?
  Math.max(0, (correctionGlucoseValue - insulinSettings.correctionTargetGlucose) / insulinSettings.insulinSensitivityMgDlPerUnit) :
  0;
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
  const bolusIOBBreakdown = mealCoverageDoses.
  map((dose) => {
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
      status
    };
  }).
  filter(Boolean).
  sort((a, b) => b.iob - a.iob);

  let value = `${estimatedAdditionalUnits.toFixed(1)}u`;
  let status = "Rhythm preview";
  let color = "#4d5742";
  let sub = `${Math.round(mealGroup.carbs)}g carbs · ${loggedTotalUnits.toFixed(1)}u logged`;

  // --- Point-in-time assessment (fixed at meal time, does not change as IOB decays) ---
  if (ratio === null) {
    value = "Review";
    status = "Not enough data to preview your rhythm";
    color = "#8a5a12";
  } else if (correctionGlucoseLow) {
    value = "Review";
    status = "Glucose is below range - take care first";
    color = GLUCOSE_STATUS_COLORS.low;
  } else if (ratio < 0.75) {
    value = `${estimatedAdditionalUnits.toFixed(1)}u`;
    status = "Below your historical rhythm";
    color = "#9c3f2e";
  } else if (ratio > 1.25) {
    value = "Above rhythm";
    status = `${coverageGapAbs.toFixed(1)}u above your historical rhythm`;
    color = "#8a5a12";
  } else if (!correctionGlucoseAvailable) {
    value = `${expectedMealUnits.toFixed(1)}u`;
    status = "Rhythm preview - glucose unavailable";
    color = "#8a5a12";
  } else {
    value = "In rhythm";
    status = "Matches your historical rhythm";
    color = "#4d5742";
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
      const startPart = correctionGlucoseAvailable ?
      `You began at ${Math.round(glucoseValue)} mg/dL` :
      "You began this meal";
      const nowPart = `and you're now at ${Math.round(latestGlucoseValue)} mg/dL in your comfortable range`;

      if (hadDip) {
        outcomeAssessment = {
          label: "Settled nicely",
          message: `${startPart}, dipped to ${Math.round(lowOutcome.value)} mg/dL along the way, ${nowPart}. Well done finding your footing again.`,
          color: "#4d5742"
        };
      } else if (hadSpike) {
        outcomeAssessment = {
          label: "Settled nicely",
          message: `${startPart}, rose to ${Math.round(peakOutcome.value)} mg/dL after eating, ${nowPart}. Nice work staying with it.`,
          color: "#4d5742"
        };
      } else {
        outcomeAssessment = {
          label: "Tracking beautifully",
          message: `${startPart} ${nowPart}. Your support is aligning beautifully with this meal.`,
          color: "#4d5742"
        };
      }
      value = outcomeAssessment.label;
      status = "Back in a comfortable range";
      color = "#4d5742";
    } else if (latestIsAfterMeal && latestLow) {
      // Currently below range
      if (hadDip && hasCorrectiveCarbs) {
        outcomeAssessment = {
          label: "Rising gently",
          message: "Nourishment added. We're keeping a supportive eye on the trend as you gently rise back to your comfortable range.",
          color: "#4d5742"
        };
        value = "Realigning";
        status = "Nourishment added, rising back";
        color = "#4d5742";
      } else if (hadDip) {
        outcomeAssessment = {
          label: "Worth a closer look",
          message: "It looks like you've provided a bit more support than this moment needed. Please enjoy a gentle carb source and stay close to the trend while your body settles back.",
          color: GLUCOSE_STATUS_COLORS.low
        };
        value = "Take care";
        status = "Glucose dipped below range";
        color = GLUCOSE_STATUS_COLORS.low;
      } else {
        outcomeAssessment = {
          label: "Below range",
          message: "Glucose has dipped below your comfortable range. Consider a gentle carb source and follow your established plan.",
          color: GLUCOSE_STATUS_COLORS.low
        };
        value = "Take care";
        status = "Below comfort zone";
        color = GLUCOSE_STATUS_COLORS.low;
      }
    } else if (latestIsAfterMeal && latestHigh) {
      // Currently above range
      if (hadSpike && hasCorrectiveInsulin) {
        outcomeAssessment = {
          label: "Finding its balance",
          message: "You added a little extra support, and your body is working through it now. We're watching closely as things gently return to a comfortable flow.",
          color: "#4d5742"
        };
        value = "Realigning";
        status = "Support added, settling back";
        color = "#4d5742";
      } else if (hadSpike) {
        outcomeAssessment = {
          label: "Still settling",
          message: "Glucose is climbing a little higher than we'd like. Let's give it some gentle time to see how your body finds its balance before adding more support.",
          color: "#8a5a12"
        };
        value = "Still settling";
        status = "Glucose trending above range";
        color = "#8a5a12";
      } else {
        outcomeAssessment = {
          label: "Above range",
          message: "Glucose is a little above your comfortable range. Give it some gentle time to settle before adding more support.",
          color: "#8a5a12"
        };
        value = "Still settling";
        status = "Above comfort zone";
        color = "#8a5a12";
      }
    }
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
        time: mealTime
      },
      mealGroup,
      gramsPerUnit,
      expectedMealUnits,
      correctionUnitsNeeded,
      correctionGlucoseAvailable,
      correctionGlucoseLow,
      correctionTargetGlucose: insulinSettings.correctionTargetGlucose,
      insulinSensitivityMgDlPerUnit: insulinSettings.insulinSensitivityMgDlPerUnit,
      mealInsulinUnitsPer5g: insulinSettings.mealInsulinUnitsPer5g,
      targetHigh: insulinSettings.targetHigh,
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
      windowEndGlucoseValue: Number.isFinite(windowEndGlucoseValue) ? windowEndGlucoseValue : null,
      peakOutcome: peakOutcome?.value ?? null,
      peakOutcomeTime: peakOutcome?.time ?? null,
      lowOutcome: lowOutcome?.value ?? null,
      outcomeAssessment,
      hasCorrectiveInsulin,
      hasCorrectiveCarbs,
      mealStillUnderReview,
      rescueCarbs: Math.round((Array.isArray(carbEntries) ? carbEntries : [])
        .filter((entry) => {
          if (entry.is_rescue_carb !== true && entry.classification !== "rescue_carbs" && !isRescueCarbEntry(entry, glucoseReadings, doses, insulinSettings.targetLow)) return false;
          const eTime = getEntryTime(entry);
          return Number.isFinite(eTime) && eTime >= mealTime && eTime <= mealTime + outcomeWindowMs;
        })
        .reduce((sum, entry) => sum + Number(entry.carbs || 0), 0)),
      windowStart,
      windowEnd,
      reviewWindowEnd: mealTime + outcomeWindowMs
    }
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

  const glucoseAsOf = latestGlucose?.recorded_at ?
  new Date(latestGlucose.recorded_at).getTime() :
  null;

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
      net: activeCarbs - mealIOB * gramsPerUnit
    });
  }

  const peak = points.reduce((highest, point) => point.net > highest.net ? point : highest, points[0]);
  const trough = points.reduce((lowest, point) => point.net < lowest.net ? point : lowest, points[0]);

  return {
    points,
    peak,
    trough,
    atNow: points[0]?.net ?? 0,
    glucoseAsOf
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
        filter: "blur(8px)"
      }} />);


}

function RiskSparkline({ points, color }) {
  if (points.length < 2) return null;

  const width = 240;
  const height = 36;
  const values = points.map((point) => point.net);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = max - min || 1;

  const path = points.
  map((point, index) => {
    const x = index / (points.length - 1) * width;
    const y = height - (point.net - min) / range * height;
    return `${index ? "L" : "M"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).
  join(" ");

  const zeroY = height - (0 - min) / range * height;

  return (
    <svg className="balance-sparkline" viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <line x1="0" y1={zeroY} x2={width} y2={zeroY} stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="3,3" />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>);

}

function MetricCard({ label, value, sub, status, color, tooltipId, openTooltip, setOpenTooltip, footer }) {
  return (
    <motion.div
      whileTap={{ scale: 0.985 }}
      className="metric-card relative col-span-2 overflow-hidden rounded-2xl border p-4 backdrop-blur-sm"
      style={{
        borderColor: "rgba(255,255,255,0.09)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.10), inset 0 0 28px rgba(91,168,138,0.025)"
      }}>
      
      <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        <AmbientOrb color={color} />
      </div>

      <div className="relative z-10 mb-1 flex items-start justify-between gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
        {tooltipId &&
        <button
          onClick={() => setOpenTooltip(openTooltip === tooltipId ? null : tooltipId)}
          className="text-white/20 transition-colors hover:text-white/50">
          
            <Info className="h-3 w-3" />
          </button>
        }
      </div>

      <div className="relative z-10 mt-1">
        <span className="text-2xl font-bold leading-none text-white">{value}</span>
        {sub && <p className="mt-1 text-[11px] text-white/35">{sub}</p>}
      </div>

      <span className="relative z-10 mt-2 text-xs font-semibold" style={{ color }}>
        {status}
      </span>
      {footer &&
      <div className="relative z-10 mt-3 space-y-1.5 border-t border-white/10 pt-3">
          {footer}
        </div>
      }
    </motion.div>);

}

const TREND_ICONS = {
  "double_up": ChevronsUp,
  up: ArrowUp,
  "up-right": ArrowUpRight,
  right: ArrowRight,
  "down-right": ArrowDownRight,
  down: ArrowDown,
  "double_down": ChevronsDown
};

function SupportiveGlucoseMessage({ insight, trend, TrendIcon }) {
  if (!insight?.message) return null;

  return null;













}

export default function ActiveInsulinBanner({ doses = [], latestGlucose, glucoseReadings = [], carbEntries = [], graphSlot = null, onEditGlucose = null, onEditDose = null, onDeleteDose = null }) {
  const [insulinSettings, setInsulinSettings] = useState(readInsulinSettings);
  const [targetRange, setTargetRange] = useState(readTargetRange);
  const [centerGlucoseStatus, setCenterGlucoseStatus] = useState(null);
  const [nowMinute, setNowMinute] = useState(() =>
  Math.floor(Date.now() / MINUTE_MS)
  );
  const { connected: dexcomConnected } = useDexcomConnection();
  const safeDoses = Array.isArray(doses) ? doses : [];
  const safeGlucoseReadings = Array.isArray(glucoseReadings) ? glucoseReadings : [];
  const safeCarbEntries = Array.isArray(carbEntries) ? carbEntries : [];

  const latestDexcomReading = useMemo(
    () => getLatestDexcomReading(safeGlucoseReadings),
    [safeGlucoseReadings]
  );
  const isGlucoseStale = useGlucoseStaleness(latestDexcomReading, dexcomConnected);

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

  // Listen for the graph marker's glucose status so the card glow reflects
  // what the user is scrolling over, not just the latest reading.
  useEffect(() => {
    const handler = (e) => setCenterGlucoseStatus(e.detail ?? null);
    window.addEventListener("stackd-center-glucose-status", handler);
    return () => window.removeEventListener("stackd-center-glucose-status", handler);
  }, []);

  const mealCoverageDoses = useMemo(
    () => safeDoses.filter((dose) => isMealCoverageInsulin(dose, insulinSettings)),
    [safeDoses, insulinSettings]
  );
  const activeUnits = useMemo(() => getTotalIOB(safeDoses, Date.now()), [safeDoses, nowMinute]);
  const basalRegimenStatus = useMemo(() => getBasalRegimenStatus(safeDoses, Date.now()), [safeDoses, nowMinute]);
  const activeMealUnits = useMemo(() => getTotalMealIOB(mealCoverageDoses, Date.now()), [mealCoverageDoses, nowMinute]);
  const activeCorrectionUnits = useMemo(() => getTotalCorrectionIOB(mealCoverageDoses, Date.now()), [mealCoverageDoses, nowMinute]);
  const activeInsulinBreakdown = useMemo(() => {
    const now = Date.now();
    return safeDoses.
    map((dose) => {
      const iob = getDoseIOB(dose, now);
      if (iob < 0.5) return null;

      const profile = getInsulinProfile(dose.insulin_type);
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
        time: getDoseTime(dose)
      };
    }).
    filter(Boolean).
    sort((a, b) => b.iob - a.iob);
  }, [safeDoses, nowMinute]);
  const activeCarbs = useMemo(() => getActiveCarbsNow(safeCarbEntries), [safeCarbEntries, nowMinute]);

  const trajectory = useMemo(
    () => computeNetCarbTrajectory(safeDoses, safeCarbEntries, latestGlucose, insulinSettings),
    [safeDoses, safeCarbEntries, latestGlucose, insulinSettings, nowMinute]
  );

  const worstPoint = useMemo(() => {
    if (!trajectory.peak || !trajectory.trough) return null;
    return Math.abs(trajectory.peak.net) >= Math.abs(trajectory.trough.net) ?
    trajectory.peak :
    trajectory.trough;
  }, [trajectory]);

  const highProteinFatStatus = useMemo(
    () => getHighProteinFatMonitoringStatus(safeCarbEntries),
    [safeCarbEntries, nowMinute]
  );

  const mealInsightRaw = useMemo(
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
    nowMinute]

  );

  const [resolvedMealIds, setResolvedMealIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("resolved_meal_ids") || "[]");
    } catch {
      return [];
    }
  });

  const currentMealId = mealInsightRaw?.details?.meal?.id;
  const isMealResolved = Boolean(currentMealId && resolvedMealIds.includes(currentMealId));

  // When the user marks a meal as resolved, override the review flag so both
  // the card and tooltip present the completed state immediately.
  const mealInsight =
  isMealResolved && mealInsightRaw?.details ?
  { ...mealInsightRaw, details: { ...mealInsightRaw.details, mealStillUnderReview: false } } :
  mealInsightRaw;

  const handleResolveMeal = () => {
    if (!currentMealId) return;
    const updated = [...resolvedMealIds, currentMealId];
    setResolvedMealIds(updated);
    try {
      localStorage.setItem("resolved_meal_ids", JSON.stringify(updated));
    } catch {}
  };

  const netActiveCarbs = worstPoint?.net ?? 0;
  const netPeakTime = worstPoint?.time ?? null;
  const isPeakInFuture = Boolean(netPeakTime && netPeakTime > Date.now() + 60000);
  const needsInsulinPlan = !insulinSettings.isComplete;
  const correctionOnlyActive =
  activeCorrectionUnits > 0.01 &&
  activeMealUnits <= 0.01 &&
  activeCarbs <= 0.5;

  const netValue = needsInsulinPlan ?
  "Setup needed" :
  correctionOnlyActive ?
  "Correction active" :
  netActiveCarbs > 5 ?
  "High Carb Activity" :
  netActiveCarbs < -5 ?
  "High Insulin Activity" :
  "In balance";

  const netLabel = needsInsulinPlan ?
  "Add insulin plan in Settings" :
  correctionOnlyActive ?
  "No meal carbs digesting" :
  netActiveCarbs > 5 ?
  "Glucose may rise" :
  netActiveCarbs < -5 ?
  "Glucose may fall" :
  "Carbs and insulin are aligned";

  const netColor = needsInsulinPlan || correctionOnlyActive ?
  "#8a5a12" :
  netActiveCarbs > 5 ?
  "#9c3f2e" :
  netActiveCarbs < -5 ?
  "#8a5a12" :
  "#4d5742";

  const dailyAverage = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const readingsToday = filterReadingsForStats(
      safeGlucoseReadings.filter((reading) => new Date(reading.recorded_at) >= today),
      dexcomConnected
    );
    if (!readingsToday.length) return null;
    return Math.round(readingsToday.reduce((sum, reading) => sum + reading.value, 0) / readingsToday.length);
  }, [safeGlucoseReadings, dexcomConnected]);

  const comfortZonePercentage = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const readingsToday = filterReadingsForStats(
      safeGlucoseReadings.filter((reading) => new Date(reading.recorded_at) >= today),
      dexcomConnected
    );
    if (dexcomConnected) {
      return computeTimeInRangeFromReadings(readingsToday, insulinSettings.targetLow, insulinSettings.targetHigh);
    }
    return computeTimeInRange(readingsToday, insulinSettings.targetLow, insulinSettings.targetHigh);
  }, [safeGlucoseReadings, insulinSettings.targetLow, insulinSettings.targetHigh, dexcomConnected]);

  const trend = useMemo(() => {
    if (latestGlucose?.source === "dexcom" && latestGlucose?.trend) {
      return mapDexcomTrend(latestGlucose.trend) || computeGlucoseTrend(safeGlucoseReadings);
    }
    return computeGlucoseTrend(safeGlucoseReadings);
  }, [latestGlucose, safeGlucoseReadings]);

  const glucoseValue = latestGlucose?.value;
  const targetLow = targetRange.low;
  const targetHigh = targetRange.high;
  const glucoseColor = !glucoseValue ?
  GLUCOSE_STATUS_COLORS.inRange :
  glucoseValue < targetLow ?
  GLUCOSE_STATUS_COLORS.low :
  glucoseValue > targetHigh ?
  GLUCOSE_STATUS_COLORS.high :
  GLUCOSE_STATUS_COLORS.inRange;

  const inRange = glucoseValue == null ? null : glucoseValue >= targetLow && glucoseValue <= targetHigh;
  const rangeCardLabel =
  glucoseValue == null ?
  "No data" :
  glucoseValue < targetLow ?
  "Below comfort zone" :
  glucoseValue > targetHigh ?
  "Above comfort zone" :
  "In comfort zone";
  const rangeSparkColor =
  glucoseValue == null ?
  `${GLUCOSE_STATUS_COLORS.inRange}88` :
  glucoseValue < targetLow ?
  `${GLUCOSE_STATUS_COLORS.low}88` :
  glucoseValue > targetHigh ?
  `${GLUCOSE_STATUS_COLORS.high}88` :
  `${GLUCOSE_STATUS_COLORS.inRange}88`;
  const glucoseReadingAgeMinutes = latestGlucose?.recorded_at ?
  Math.floor((Date.now() - new Date(latestGlucose.recorded_at).getTime()) / MINUTE_MS) :
  null;
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
      seed: latestGlucose?.id || latestGlucose?.recorded_at || `${Math.floor(Date.now() / (30 * MINUTE_MS))}`
    }),
    [latestGlucose, targetLow, targetHigh, trend, activeUnits, activeCarbs, glucoseReadingAgeMinutes]
  );
  const TrendIcon = TREND_ICONS[trend.icon] || ArrowRight;

  const stackingAlertsEnabled =
  typeof window !== "undefined" && window.localStorage.getItem("stacking_alerts_enabled") !== "false";

  // Counts rapid/short-acting doses that still hold meaningful insulin on
  // board. Uses the same 0.5u IOB threshold as the IOB card's breakdown so the
  // alert never reports more active doses than the card actually shows — a
  // dose lingering in its tail with < 0.5u no longer counts as "stacking".
  const activeRapidCount = useMemo(() => {
    const now = Date.now();
    return safeDoses.filter((dose) => {
      if (!["Rapid-Acting", "Short-Acting"].includes(getInsulinCategory(dose.insulin_type))) return false;
      return getDoseIOB(dose, now) >= 0.5;
    }).length;
  }, [safeDoses, nowMinute]);

  const glucoseStatus = (value) => {
    if (!value) return "No data";
    if (value < targetLow) return "Below comfort zone";
    if (value > targetHigh) return "Above comfort zone";
    return "In comfort zone";
  };

  const dailyTimeBreakdown = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const readingsToday = filterReadingsForStats(
      safeGlucoseReadings.filter((reading) => new Date(reading.recorded_at) >= today),
      dexcomConnected
    );
    if (!readingsToday.length) return null;
    const intervalMin = 5;
    const totalMin = readingsToday.length * intervalMin;
    const inR = readingsToday.filter((r) => r.value >= targetRange.low && r.value <= targetRange.high).length;
    const above = readingsToday.filter((r) => r.value > targetRange.high).length;
    const below = readingsToday.filter((r) => r.value < targetRange.low).length;
    const fmt = (m) => {
      if (m < 60) return `${m}m`;
      return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
    };
    return {
      inRange: fmt(inR * intervalMin),
      above: fmt(above * intervalMin),
      below: fmt(below * intervalMin),
    };
  }, [safeGlucoseReadings, targetRange.low, targetRange.high, dexcomConnected]);

  const dexcomModel = useMemo(() => {
    try {
      return window.localStorage.getItem("cgm_model") || "G7";
    } catch {
      return "G7";
    }
  }, []);

  return (
    <div className="space-y-5">
      {/* 1. YOUR DAY CARD — Current Glucose + Daily Balance */}
      <DashboardCard className="p-5">
        <div className="section-label">Current Glucose</div>
        <AnchorNumber
          value={isGlucoseStale ? "—" : (glucoseValue != null ? Math.round(glucoseValue) : "—")}
          unit="mg/dL"
          caption={isGlucoseStale ? "Waiting for a fresh reading" : `${trend?.label || "Steady"} · updated ${(() => {
            if (!latestGlucose?.recorded_at) return "just now";
            const mins = Math.max(0, Math.round((nowMinute * MINUTE_MS - new Date(latestGlucose.recorded_at).getTime()) / 60000));
            if (mins < 1) return "just now";
            if (mins < 60) return `${mins}m ago`;
            return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
          })()}${dexcomConnected ? ` · Dexcom ${dexcomModel}` : ""}`}
          dot
          dotColor={isGlucoseStale ? "#a89e8d" : (inRange ? "#5b6550" : glucoseColor)}
          trendIcon={!isGlucoseStale && glucoseValue != null ? <TrendIcon className="h-5 w-5" /> : null}
          trendColor={glucoseColor}
        />

        {isGlucoseStale ? (
          <StaleReadingBanner visible={isGlucoseStale} />
        ) : (
          <SupportiveGlucoseMessage insight={supportiveGlucoseInsight} trend={trend} TrendIcon={TrendIcon} />
        )}

        {/* Internal hairline separator */}
        <div className="my-5 h-px" style={{ background: "#eadccf" }} />

        <div className="section-label">Daily Balance</div>
        <AnchorNumber
          value={comfortZonePercentage != null ? Math.round(comfortZonePercentage) : "—"}
          unit="%"
          caption={`of today spent in your comfort zone — ${targetLow}–${targetHigh} mg/dL`}
        />
        {dailyTimeBreakdown && (
          <div className="mt-2 flex justify-between text-xs px-1" style={{ color: "#746959" }}>
            <span>{dailyTimeBreakdown.inRange} in range so far</span>
            <span>{dailyTimeBreakdown.above} above · {dailyTimeBreakdown.below} below</span>
          </div>
        )}
      </DashboardCard>

      {/* 2. ACTIVITY GRAPH CARD */}
      <DashboardCard className="overflow-hidden p-0">
        <div className="relative pt-3 pb-4">
          {(() => {
            const status = isGlucoseStale ? null : centerGlucoseStatus?.status ?? classifyGlucose(glucoseValue, targetLow, targetHigh);
            const isActive = !isGlucoseStale && (status === "high" || status === "low" || status === "in_range");
            const glowColor = status === "high" ? GLUCOSE_STATUS_COLORS.high : status === "low" ? GLUCOSE_STATUS_COLORS.low : "#5b6550";
            const overReference = isGlucoseStale ? false : centerGlucoseStatus?.overReference ?? (glucoseValue != null && (glucoseValue > readHighReference() || glucoseValue < FIXED_LOW_REFERENCE));
            const maskFade = "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 14%, rgba(0,0,0,0.35) 55%, transparent 100%)";
            const glowOpacity = isActive ? overReference ? 0.6 : 0.4 : 0;
            return (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 z-[1] rounded-[24px]"
                style={{
                  height: "50%",
                  opacity: glowOpacity,
                  backgroundColor: glowColor,
                  maskImage: maskFade,
                  WebkitMaskImage: maskFade,
                  boxShadow: overReference ? `inset 0 30px 80px -30px ${glowColor}aa` : "none",
                  transition: "opacity 700ms ease-out, background-color 700ms ease-out, box-shadow 700ms ease-out"
                }}
              />
            );
          })()}
          {graphSlot}
        </div>
      </DashboardCard>

      {/* Stacking alert — between cards */}
      {stackingAlertsEnabled && activeRapidCount > 1 && (
        <div className="flex w-full items-start gap-3 overflow-hidden rounded-[24px] p-5" style={{ background: "#fdf9f2", boxShadow: "0 8px 28px rgba(63,56,48,0.10)" }}>
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "#8a5a12" }} />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#3f3830" }}>Multiple Active Doses</p>
            <p className="mt-0.5 text-sm" style={{ color: "#6b6153" }}>
              {activeRapidCount} rapid-acting doses are active at once. Keep a gentle eye on how you're feeling.
            </p>
          </div>
        </div>
      )}

      {/* 3. INSULIN ON BOARD CARD */}
      <DashboardCard className="p-5">
        <InsulinOnBoardCard
          totalUnits={activeUnits}
          breakdown={activeInsulinBreakdown}
          basalRegimenStatus={basalRegimenStatus}
          onEditDose={onEditDose ? (id) => {
            const dose = safeDoses.find((d) => d.id === id);
            if (dose) onEditDose({ type: "insulin", item: dose });
          } : null}
          onDeleteDose={onDeleteDose ? (id) => {
            const dose = safeDoses.find((d) => d.id === id);
            if (dose) onDeleteDose({ type: "insulin", item: dose });
          } : null}
        />
      </DashboardCard>

      {/* 4. MEAL REVIEW CARD */}
      <DashboardCard className="p-5">
        <MealReviewContent
          mealInsight={mealInsight}
          monitoringStatus={highProteinFatStatus}
          glucoseTrend={trend}
          onResolve={handleResolveMeal}
        />
      </DashboardCard>
    </div>
  );

}