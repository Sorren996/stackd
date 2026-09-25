// Stackd Basal Activity Model
//
// Basal insulin is modeled as continuous background exposure, never as
// conventional bolus IOB. Overlapping basal doses accumulate toward a
// steady-state activity level that is unique to each basal insulin's own
// pharmacodynamic profile (see insulinPharmacology.js). This module is the
// single source of truth for:
//   - the IOB card's "Basal Coverage" state and percentage
//   - each basal dose row's contribution label
//   - the graph's combined basal coverage background layer
// All three consumers call into this module so the card, rows, and graph
// never disagree.
//
// This is strictly observational. It never produces a dosing recommendation.
// The percentage it returns is a modeled estimate of background activity
// relative to the user's own established basal profile — not a measurement
// of physical insulin units remaining in the body. All user-facing language
// is intentionally simple: "Building", "Stabilizing", "Steady", "Active",
// "Gradually declining" — never pharmacokinetic jargon.

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

// Plain-language coverage state → human label mapping. These are the only
// strings the UI ever shows for basal coverage status. They are deliberately
// non-clinical: "Building", "Stabilizing", "Steady", "Active", "Gradually
// declining" — never "pharmacodynamic activity" or "terminal elimination".
const COVERAGE_LABELS = {
  none: "No basal insulin logged",
  minimal: "Minimal coverage",
  building: "Building toward steady coverage",
  stabilizing: "Stabilizing",
  steady: "Steady coverage",
  active: "Active in the background",
  declining: "Gradually declining",
};

/**
 * Computes the current basal regimen status — the single result consumed by
 * both the Insulin on Board card, the basal dose rows, and the graph layer.
 *
 * Returns:
 * {
 *   insulinType, doses, doseTime, elapsedTime, modeledActivity,
 *   basalCoverage,      // modeled percentage (0–130), or null when not meaningful
 *   state,               // none | minimal | building | stabilizing | steady | active | declining
 *   coverageState,       // same as state (explicit field name for UI consumers)
 *   label,               // plain-language label for the card
 *   coverageLabel,       // same as label (explicit field name for UI consumers)
 *   steadyStateProgress, // 0–1 fraction of the way to steady state (for the building indicator)
 * }
 */
export function getBasalRegimenStatus(doses, atTime = Date.now()) {
  const byType = groupBasalDosesByType(doses);
  if (!byType.size) {
    return {
      state: "none",
      coverageState: "none",
      label: COVERAGE_LABELS.none,
      coverageLabel: COVERAGE_LABELS.none,
      basalCoverage: null,
      steadyStateProgress: 0,
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
  const timeSinceLastDose = atTime - mostRecentDoseTime;

  const base = {
    insulinType: currentType,
    doses: regimenDoses,
    doseTime: mostRecentDoseTime,
    elapsedTime: Math.max(0, timeSinceLastDose),
    modeledActivity: combinedActivity,
  };

  if (combinedActivity <= 0.02) {
    return {
      ...base,
      state: "minimal", coverageState: "minimal",
      label: COVERAGE_LABELS.minimal, coverageLabel: COVERAGE_LABELS.minimal,
      basalCoverage: null, steadyStateProgress: 0,
    };
  }

  // If the most recent dose is long overdue (well past the dosing interval),
  // coverage is gradually declining as residual activity fades — no new
  // dose is building. This communicates "your previous dose is still
  // contributing but fading" without implying the user should dose.
  const overdueMs = timeSinceLastDose - intervalMs;
  if (overdueMs > intervalMs * 0.5) {
    const steadyLevel = getSteadyStateLevel(currentType);
    const ratio = steadyLevel > 0 ? combinedActivity / steadyLevel : 0;
    return {
      ...base,
      state: "declining", coverageState: "declining",
      label: COVERAGE_LABELS.declining, coverageLabel: COVERAGE_LABELS.declining,
      basalCoverage: Math.round(clamp(ratio, 0, 1.3) * 100),
      steadyStateProgress: 1,
    };
  }

  if (streak.length < 2) {
    const steadyLevel = getSteadyStateLevel(currentType);
    const ratio = steadyLevel > 0 ? combinedActivity / steadyLevel : 0;
    return {
      ...base,
      state: "building", coverageState: "building",
      label: COVERAGE_LABELS.building, coverageLabel: COVERAGE_LABELS.building,
      basalCoverage: Math.round(clamp(ratio, 0, 1) * 100),
      steadyStateProgress: clamp(elapsedDays / daysToSteady, 0, 1),
    };
  }

  const steadyLevel = getSteadyStateLevel(currentType);
  const ratio = steadyLevel > 0 ? combinedActivity / steadyLevel : 0;

  if (elapsedDays < daysToSteady) {
    const basalCoverage = Math.round(clamp(ratio, 0, 1) * 100);
    return {
      ...base,
      state: "stabilizing", coverageState: "stabilizing",
      label: COVERAGE_LABELS.stabilizing, coverageLabel: COVERAGE_LABELS.stabilizing,
      basalCoverage,
      steadyStateProgress: clamp(elapsedDays / daysToSteady, 0, 1),
    };
  }

  const basalCoverage = Math.round(clamp(ratio, 0, 1.3) * 100);
  return {
    ...base,
    state: "steady", coverageState: "steady",
    label: COVERAGE_LABELS.steady, coverageLabel: COVERAGE_LABELS.steady,
    basalCoverage,
    steadyStateProgress: 1,
  };
}

/**
 * Generates the combined basal coverage curve across a time range — the
 * smooth, summed activity of every basal dose overlapping the window. This
 * is what the graph renders as a subtle background layer. It naturally
 * shows overlapping doses merging into one continuous coverage band with
 * no artificial 24-hour cliff.
 *
 * Returns an array of { time, activity } where activity is the summed
 * relative activity (0–1 scale per dose, summed across doses) sampled at
 * the requested step interval.
 */
export function getBasalCoverageCurve(doses, startTime, endTime, stepMinutes = 10) {
  const basalDoses = (Array.isArray(doses) ? doses : []).filter((d) => isBasalInsulinType(d?.insulin_type));
  if (!basalDoses.length || !Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime <= startTime) {
    return [];
  }

  const stepMs = Math.max(1, stepMinutes) * MINUTE_MS;
  const curve = [];
  for (let t = startTime; t <= endTime; t += stepMs) {
    let activity = 0;
    for (const dose of basalDoses) {
      activity += getDoseRelativeActivity(dose, t);
    }
    curve.push({ time: t, activity });
  }
  return curve;
}

/**
 * Per-dose contribution details for the expanded basal view. Returns each
 * basal dose with plain-language context: whether it's today's dose or a
 * previous dose still contributing, time since injection, and modeled
 * relative activity. The UI uses this to show "Today's dose, 30U, 9:00 PM"
 * and "Previous dose, still contributing" without exposing PK jargon.
 */
export function getBasalDoseContributions(doses, atTime = Date.now()) {
  const basalDoses = (Array.isArray(doses) ? doses : [])
    .filter((d) => isBasalInsulinType(d?.insulin_type))
    .sort((a, b) => getDoseTimeMs(b) - getDoseTimeMs(a));

  if (!basalDoses.length) return [];

  const mostRecentTime = getDoseTimeMs(basalDoses[0]);
  const dayMs = DAY_MS;

  return basalDoses.map((dose, index) => {
    const doseTime = getDoseTimeMs(dose);
    const elapsedMs = Math.max(0, atTime - doseTime);
    const activity = getDoseRelativeActivity(dose, atTime);
    const isMostRecent = index === 0;
    const isToday = elapsedMs < dayMs;
    const stillContributing = activity > 0.01;

    let role;
    if (isMostRecent && isToday) role = "today";
    else if (isMostRecent) role = "latest";
    else if (stillContributing) role = "previous";
    else role = "faded";

    return {
      id: dose.id,
      insulinType: dose.insulin_type,
      units: Number(dose.units) || 0,
      doseTime,
      elapsedMs,
      activity,
      stillContributing,
      isMostRecent,
      role,
    };
  });
}

/**
 * Per-dose contribution label for an individual basal dose row. Uses plain
 * language: "Still contributing", "Today's dose", "Previous dose, still
 * contributing", "No longer contributing" — never "pharmacodynamic activity
 * = X%". The percentage is available via the regimen status for users who
 * want the modeled number, but the row label stays conversational.
 */
export function getBasalDoseContributionLabel(dose, regimenStatus, atTime = Date.now()) {
  if (!dose || !regimenStatus || regimenStatus.state === "none") return "Basal dose";

  const doseActivity = getDoseRelativeActivity(dose, atTime);
  if (doseActivity <= 0.01) return "No longer contributing";

  if (regimenStatus.state === "minimal") return "No longer contributing";
  if (regimenStatus.state === "building") return "Building toward steady coverage";
  if (regimenStatus.state === "declining") return "Previous dose, still contributing";

  // For stabilizing / steady / active states, distinguish today's dose
  // from previous doses that are still overlapping.
  const doseTime = getDoseTimeMs(dose);
  const mostRecentTime = regimenStatus.doseTime;
  const isMostRecent = doseTime === mostRecentTime;
  const isToday = (atTime - doseTime) < DAY_MS;

  if (isMostRecent && isToday) return "Today's dose";
  if (isMostRecent) return "Latest dose";
  return "Previous dose, still contributing";
}