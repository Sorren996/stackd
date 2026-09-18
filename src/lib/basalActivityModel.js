// Stackd Basal Activity Model
//
// Basal insulin is modeled as continuous background exposure, never as
// conventional bolus IOB. Overlapping basal doses accumulate toward a
// steady-state activity level that is unique to each basal insulin's own
// pharmacodynamic profile (see insulinPharmacology.js). This module is the
// single source of truth for:
//   - the IOB card's "Basal Coverage" percentage / state
//   - each basal dose row's "contribution" label
// Both consumers must call into this module so the card and any basal
// visualization never disagree.
//
// This is strictly observational. It never produces a dosing recommendation
// and the percentage it returns is a modeled estimate of background activity
// relative to the user's own established basal profile — not a measurement
// of physical insulin units remaining in the body.

import { getInsulinProfile, isBasalInsulinType, getDoseRelativeActivity } from "./insulinPharmacology";

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const DEFAULT_DOSING_INTERVAL_MINUTES = 1440;
const DEFAULT_DAYS_TO_STEADY_STATE = 3;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getDoseTimeMs(dose) {
  return new Date(dose?.administered_at).getTime();
}

function getDosingIntervalMinutes(insulinType) {
  return getInsulinProfile(insulinType)?.dosing_interval_minutes || DEFAULT_DOSING_INTERVAL_MINUTES;
}

function getDaysToSteadyState(insulinType) {
  return getInsulinProfile(insulinType)?.days_to_steady_state ?? DEFAULT_DAYS_TO_STEADY_STATE;
}

// Simulates a long run of perfectly regular doses (one unit each) at the
// insulin's own dosing interval and averages the combined relative activity
// over the final cycle — the converged, steady-state background level that
// a consistent daily (or weekly) regimen settles into for that insulin.
function computeSteadyStateLevel(insulinType) {
  const intervalMs = getDosingIntervalMinutes(insulinType) * MINUTE_MS;
  const cycles = 8;
  const doseTimesMs = Array.from({ length: cycles }, (_, index) => index * intervalMs);
  const lastCycleStart = doseTimesMs[doseTimesMs.length - 1];
  const sampleStep = 30 * MINUTE_MS;

  let total = 0;
  let samples = 0;
  for (let t = lastCycleStart; t < lastCycleStart + intervalMs; t += sampleStep) {
    let activity = 0;
    for (const doseTimeMs of doseTimesMs) {
      if (t < doseTimeMs) continue;
      const syntheticDose = { insulin_type: insulinType, units: 1, administered_at: new Date(doseTimeMs).toISOString() };
      activity += getDoseRelativeActivity(syntheticDose, t);
    }
    total += activity;
    samples += 1;
  }
  return samples > 0 ? total / samples : 1;
}

const steadyStateCache = new Map();
function getSteadyStateLevel(insulinType) {
  if (steadyStateCache.has(insulinType)) return steadyStateCache.get(insulinType);
  const level = computeSteadyStateLevel(insulinType);
  steadyStateCache.set(insulinType, level);
  return level;
}

function getCombinedActivity(doses, atTime) {
  return doses.reduce((sum, dose) => sum + getDoseRelativeActivity(dose, atTime), 0);
}

function groupBasalDosesByType(doses) {
  const byType = new Map();
  (Array.isArray(doses) ? doses : []).forEach((dose) => {
    if (!isBasalInsulinType(dose?.insulin_type)) return;
    const key = dose.insulin_type;
    if (!byType.has(key)) byType.set(key, []);
    byType.get(key).push(dose);
  });
  return byType;
}

/**
 * Computes the current basal regimen status — the single result consumed by
 * both the Insulin on Board card and any basal dose visualization.
 *
 * Returns:
 * {
 *   insulinType, doses, doseTime, elapsedTime, modeledActivity,
 *   basalCoverage, state, label
 * }
 */
export function getBasalRegimenStatus(doses, atTime = Date.now()) {
  const byType = groupBasalDosesByType(doses);
  if (!byType.size) {
    return {
      state: "none",
      label: "No basal insulin logged",
      basalCoverage: null,
      insulinType: null,
      doses: [],
      doseTime: null,
      elapsedTime: null,
      modeledActivity: 0,
    };
  }

  // The "current regimen" is whichever basal insulin type has the most
  // recently logged dose — switching basal insulins naturally hands the
  // model over to the new type.
  let currentType = null;
  let latestTime = -Infinity;
  byType.forEach((list, type) => {
    const maxTime = Math.max(...list.map(getDoseTimeMs));
    if (maxTime > latestTime) {
      latestTime = maxTime;
      currentType = type;
    }
  });

  const regimenDoses = [...byType.get(currentType)].sort((a, b) => getDoseTimeMs(a) - getDoseTimeMs(b));
  const intervalMs = getDosingIntervalMinutes(currentType) * MINUTE_MS;

  // Consecutive streak ending at the most recent dose — a gap much larger
  // than the expected dosing interval (a missed dose or a long pause) breaks
  // the accumulation and restarts the "building" phase.
  const streak = [regimenDoses[regimenDoses.length - 1]];
  for (let i = regimenDoses.length - 2; i >= 0; i -= 1) {
    const gap = getDoseTimeMs(streak[0]) - getDoseTimeMs(regimenDoses[i]);
    if (gap <= intervalMs * 1.75) {
      streak.unshift(regimenDoses[i]);
    } else {
      break;
    }
  }

  const streakStartTime = getDoseTimeMs(streak[0]);
  const elapsedDays = (atTime - streakStartTime) / DAY_MS;
  const daysToSteady = getDaysToSteadyState(currentType);
  const combinedActivity = getCombinedActivity(regimenDoses, atTime);
  const mostRecentDoseTime = getDoseTimeMs(regimenDoses[regimenDoses.length - 1]);

  const base = {
    insulinType: currentType,
    doses: regimenDoses,
    doseTime: mostRecentDoseTime,
    elapsedTime: Math.max(0, atTime - mostRecentDoseTime),
    modeledActivity: combinedActivity,
  };

  if (combinedActivity <= 0.02) {
    return { ...base, state: "minimal", label: "Minimal", basalCoverage: null };
  }

  if (streak.length < 2) {
    return { ...base, state: "building", label: "Building basal activity", basalCoverage: null };
  }

  if (elapsedDays < daysToSteady) {
    return { ...base, state: "approaching", label: "Approaching steady state", basalCoverage: null };
  }

  const steadyLevel = getSteadyStateLevel(currentType);
  const ratio = steadyLevel > 0 ? combinedActivity / steadyLevel : 0;
  const basalCoverage = Math.round(clamp(ratio, 0, 1.3) * 100);
  return { ...base, state: "established", label: "Established", basalCoverage };
}

/**
 * Per-dose contribution label for an individual basal dose row. Uses the
 * same steady-state baseline as the card so the two never disagree.
 */
export function getBasalDoseContributionLabel(dose, regimenStatus, atTime = Date.now()) {
  if (!dose || !regimenStatus || regimenStatus.state === "none") return "Basal dose";
  if (regimenStatus.state === "building" || regimenStatus.state === "approaching") {
    return regimenStatus.label;
  }

  const doseActivity = getDoseRelativeActivity(dose, atTime);
  if (doseActivity <= 0.01) return "No longer contributing";

  if (regimenStatus.state === "minimal") return "No longer contributing";

  const steadyLevel = getSteadyStateLevel(dose.insulin_type);
  const percent = steadyLevel > 0 ? Math.round((doseActivity / steadyLevel) * 100) : 0;
  return `Basal contribution: ${percent}%`;
}