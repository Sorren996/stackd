// Stackd Insight Engine — Explicit Model Resolution & Arbitration (Milestone 4)
// Frontend/testable JavaScript mirror of base44/shared/modelResolution.ts.
// Both implement the same algorithm and must be kept in sync. Tests run
// against this file; the backend function imports the TypeScript version.

import {
  BASELINE_MODEL_VERSION,
  PERSONALIZED_MODEL_VERSION,
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
  MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
} from "./index";

export const MIN_RATE_FACTOR = 0.7;
export const MAX_RATE_FACTOR = 1.3;
export const MIN_MEAL_SPEED_FACTOR = 0.7;
export const MAX_MEAL_SPEED_FACTOR = 1.45;
export const MIN_MEAL_MAGNITUDE_FACTOR = 0.7;
export const MAX_MEAL_MAGNITUDE_FACTOR = 1.3;

const FACTOR_EPSILON = 0.001;
const SPEED_CLASSES = ["fast", "mixed", "high_fat"];

function resolveGeneralComponent(state) {
  if (!state) {
    return { eligible: false, effectiveValue: 1.0, reason: "no_state_record", source: "baseline" };
  }
  if (state.baseline_locked) {
    return { eligible: false, effectiveValue: 1.0, reason: "baseline_locked", source: "baseline" };
  }
  const factor = Number(state.parameters?.rateAdjustmentFactor);
  if (!Number.isFinite(factor) || factor <= 0) {
    return { eligible: false, effectiveValue: 1.0, reason: "invalid_parameter", source: "baseline" };
  }
  if (factor < MIN_RATE_FACTOR || factor > MAX_RATE_FACTOR) {
    return { eligible: false, effectiveValue: 1.0, reason: "parameter_out_of_range", source: "baseline" };
  }
  if (Math.abs(factor - 1.0) < FACTOR_EPSILON) {
    return { eligible: false, effectiveValue: 1.0, reason: "no_meaningful_correction", source: "baseline" };
  }
  return { eligible: true, effectiveValue: factor, reason: "personalized_active", source: "personalized_state" };
}

function resolveMealComponent(state) {
  if (!state) {
    return { eligible: false, classes: {}, reason: "no_state_record", eligibleClasses: [] };
  }
  if (state.baseline_locked) {
    return { eligible: false, classes: {}, reason: "baseline_locked", eligibleClasses: [] };
  }
  const params = state.speed_class_parameters;
  if (!params) {
    return { eligible: false, classes: {}, reason: "no_class_parameters", eligibleClasses: [] };
  }

  const classes = {};
  const eligibleClasses = [];

  for (const cls of SPEED_CLASSES) {
    const cp = params[cls];
    if (!cp) {
      classes[cls] = { eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0, reason: "no_params", source: "baseline" };
      continue;
    }
    const sf = Number(cp.speed_factor);
    const mf = Number(cp.magnitude_factor);
    if (!Number.isFinite(sf) || sf < MIN_MEAL_SPEED_FACTOR || sf > MAX_MEAL_SPEED_FACTOR) {
      classes[cls] = { eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0, reason: "speed_factor_out_of_range", source: "baseline" };
      continue;
    }
    if (!Number.isFinite(mf) || mf < MIN_MEAL_MAGNITUDE_FACTOR || mf > MAX_MEAL_MAGNITUDE_FACTOR) {
      classes[cls] = { eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0, reason: "magnitude_factor_out_of_range", source: "baseline" };
      continue;
    }
    if (Math.abs(sf - 1.0) < FACTOR_EPSILON && Math.abs(mf - 1.0) < FACTOR_EPSILON) {
      classes[cls] = { eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0, reason: "no_meaningful_correction", source: "baseline" };
      continue;
    }
    classes[cls] = { eligible: true, speedFactor: sf, magnitudeFactor: mf, reason: "personalized_active", source: "personalized_state" };
    eligibleClasses.push(cls);
  }

  return {
    eligible: eligibleClasses.length > 0,
    classes,
    reason: eligibleClasses.length > 0 ? "personalized_active" : "no_eligible_classes",
    eligibleClasses,
  };
}

export function resolveModelComponents(projectionState, mealState) {
  const general = resolveGeneralComponent(projectionState);
  const meal = resolveMealComponent(mealState);

  const modelVersion = general.eligible ? PERSONALIZED_MODEL_VERSION : BASELINE_MODEL_VERSION;
  const mealModelVersion = meal.eligible ? MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED : MEAL_RESPONSE_MODEL_VERSION_BASELINE;
  const isIntegrated = general.eligible && meal.eligible;

  let resolutionReason;
  if (isIntegrated) resolutionReason = "integrated_personalized";
  else if (general.eligible) resolutionReason = "general_personalized_meal_baseline";
  else if (meal.eligible) resolutionReason = "meal_personalized_general_baseline";
  else resolutionReason = "full_baseline";

  return { general, meal, modelVersion, mealModelVersion, isIntegrated, resolutionReason };
}

export function createBaselineResolution() {
  return {
    general: { eligible: false, effectiveValue: 1.0, reason: "shadow_baseline", source: "baseline" },
    meal: { eligible: false, classes: {}, reason: "shadow_baseline", eligibleClasses: [] },
    modelVersion: BASELINE_MODEL_VERSION,
    mealModelVersion: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
    isIntegrated: false,
    resolutionReason: "shadow_baseline",
  };
}

export function createGeneralOnlyResolution(rateAdjustmentFactor) {
  const eligible = Number.isFinite(rateAdjustmentFactor)
    && rateAdjustmentFactor >= MIN_RATE_FACTOR
    && rateAdjustmentFactor <= MAX_RATE_FACTOR
    && Math.abs(rateAdjustmentFactor - 1.0) >= FACTOR_EPSILON;
  return {
    general: { eligible, effectiveValue: eligible ? rateAdjustmentFactor : 1.0, reason: eligible ? "shadow_general" : "shadow_baseline", source: eligible ? "personalized_state" : "baseline" },
    meal: { eligible: false, classes: {}, reason: "shadow_baseline", eligibleClasses: [] },
    modelVersion: eligible ? PERSONALIZED_MODEL_VERSION : BASELINE_MODEL_VERSION,
    mealModelVersion: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
    isIntegrated: false,
    resolutionReason: eligible ? "shadow_general_personalized" : "shadow_baseline",
  };
}

export function createMealOnlyResolution(mealParams) {
  const classes = {};
  const eligibleClasses = [];
  for (const cls of SPEED_CLASSES) {
    const p = mealParams[cls];
    if (!p) {
      classes[cls] = { eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0, reason: "shadow_baseline", source: "baseline" };
      continue;
    }
    const sf = Number(p.speedFactor);
    const mf = Number(p.magnitudeFactor);
    const valid = Number.isFinite(sf) && sf >= MIN_MEAL_SPEED_FACTOR && sf <= MAX_MEAL_SPEED_FACTOR
      && Number.isFinite(mf) && mf >= MIN_MEAL_MAGNITUDE_FACTOR && mf <= MAX_MEAL_MAGNITUDE_FACTOR
      && (Math.abs(sf - 1.0) >= FACTOR_EPSILON || Math.abs(mf - 1.0) >= FACTOR_EPSILON);
    classes[cls] = { eligible: valid, speedFactor: valid ? sf : 1.0, magnitudeFactor: valid ? mf : 1.0, reason: valid ? "shadow_meal" : "shadow_baseline", source: valid ? "personalized_state" : "baseline" };
    if (valid) eligibleClasses.push(cls);
  }
  const eligible = eligibleClasses.length > 0;
  return {
    general: { eligible: false, effectiveValue: 1.0, reason: "shadow_baseline", source: "baseline" },
    meal: { eligible, classes, reason: eligible ? "shadow_meal" : "shadow_baseline", eligibleClasses },
    modelVersion: BASELINE_MODEL_VERSION,
    mealModelVersion: eligible ? MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED : MEAL_RESPONSE_MODEL_VERSION_BASELINE,
    isIntegrated: false,
    resolutionReason: eligible ? "shadow_meal_personalized" : "shadow_baseline",
  };
}

export function extractEffectiveMealParams(resolution) {
  if (!resolution.meal.eligible) return null;
  const result = {};
  for (const cls of SPEED_CLASSES) {
    const cr = resolution.meal.classes[cls];
    if (cr && cr.eligible) {
      result[cls] = { speedFactor: cr.speedFactor, magnitudeFactor: cr.magnitudeFactor };
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}