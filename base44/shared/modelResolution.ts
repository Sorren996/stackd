// Stackd Insight Engine — Explicit Model Resolution & Arbitration (Milestone 4)
//
// Resolves which model components (general forecast-bias correction, per-class
// meal-response correction) are eligible for a given projection, based on the
// user's persisted model state. Makes model selection EXPLICIT: each component
// is checked for eligibility, parameter validity, and supported bounds before
// it is applied. A component that fails any check falls back to baseline while
// retaining any other independently eligible component.
//
// DESIGN PRINCIPLE:
//   A user may have an eligible general model but insufficient meal-response
//   evidence, or vice versa. The two components are resolved INDEPENDENTLY.
//   The absence of one personalized component must not disable another valid
//   component or contaminate the baseline.
//
// SAFETY: Never recommends, prescribes, or calculates insulin doses. Only
// resolves which multiplicative correction factors to apply. Baseline is
// always the final fallback for every component.
//
// SCOPE: rateAdjustmentFactor, speedFactor, and magnitudeFactor are EMPIRICAL
// corrections — NOT models of individual glucose physiology. They describe
// what the baseline model tended to get wrong; they never prescribe.
//
// Self-contained (no base44:runtime, no npm: imports).

import {
  BASELINE_MODEL_VERSION,
  PERSONALIZED_MODEL_VERSION,
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
  MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
} from "./insightEngine.ts";

// ── Parameter bounds (must match the learning modules' clamps) ──────────────
export const MIN_RATE_FACTOR = 0.7;
export const MAX_RATE_FACTOR = 1.3;
export const MIN_MEAL_SPEED_FACTOR = 0.7;
export const MAX_MEAL_SPEED_FACTOR = 1.45;
export const MIN_MEAL_MAGNITUDE_FACTOR = 0.7;
export const MAX_MEAL_MAGNITUDE_FACTOR = 1.3;

// Tolerance for "no meaningful correction" (factor ≈ 1.0).
const FACTOR_EPSILON = 0.001;

export type SpeedClass = "fast" | "mixed" | "high_fat";
const SPEED_CLASSES: SpeedClass[] = ["fast", "mixed", "high_fat"];

// ── Types ──────────────────────────────────────────────────────────────────

export interface GeneralComponentResolution {
  eligible: boolean;
  effectiveValue: number;  // rateAdjustmentFactor actually used (1.0 if not eligible)
  reason: string;
  source: "baseline" | "personalized_state";
}

export interface MealClassResolution {
  eligible: boolean;
  speedFactor: number;       // effective value (1.0 if not eligible)
  magnitudeFactor: number;   // effective value (1.0 if not eligible)
  reason: string;
  source: "baseline" | "personalized_state";
}

export interface MealComponentResolution {
  eligible: boolean;
  classes: Record<string, MealClassResolution>;
  reason: string;
  eligibleClasses: SpeedClass[];
}

export interface ModelResolution {
  general: GeneralComponentResolution;
  meal: MealComponentResolution;
  modelVersion: string;           // general forecast model version
  mealModelVersion: string;       // meal-response model version
  isIntegrated: boolean;           // both components personalized
  resolutionReason: string;       // human-readable summary
}

// ── Resolution functions ────────────────────────────────────────────────────

// Resolve the general forecast-bias correction (rateAdjustmentFactor).
// Checks: state existence, baseline_locked, parameter validity, bounds, and
// whether the factor meaningfully differs from 1.0.
function resolveGeneralComponent(state: any | null): GeneralComponentResolution {
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

// Resolve the meal-response correction for each speed class.
// Each class is checked independently — a malformed class falls back to
// baseline without affecting other classes.
function resolveMealComponent(state: any | null): MealComponentResolution {
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

  const classes: Record<string, MealClassResolution> = {};
  const eligibleClasses: SpeedClass[] = [];

  for (const cls of SPEED_CLASSES) {
    const cp = params[cls];
    if (!cp) {
      classes[cls] = {
        eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0,
        reason: "no_params", source: "baseline",
      };
      continue;
    }

    const sf = Number(cp.speed_factor);
    const mf = Number(cp.magnitude_factor);

    // Validate speed factor.
    if (!Number.isFinite(sf) || sf < MIN_MEAL_SPEED_FACTOR || sf > MAX_MEAL_SPEED_FACTOR) {
      classes[cls] = {
        eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0,
        reason: "speed_factor_out_of_range", source: "baseline",
      };
      continue;
    }

    // Validate magnitude factor.
    if (!Number.isFinite(mf) || mf < MIN_MEAL_MAGNITUDE_FACTOR || mf > MAX_MEAL_MAGNITUDE_FACTOR) {
      classes[cls] = {
        eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0,
        reason: "magnitude_factor_out_of_range", source: "baseline",
      };
      continue;
    }

    // Check if any factor meaningfully differs from baseline.
    if (Math.abs(sf - 1.0) < FACTOR_EPSILON && Math.abs(mf - 1.0) < FACTOR_EPSILON) {
      classes[cls] = {
        eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0,
        reason: "no_meaningful_correction", source: "baseline",
      };
      continue;
    }

    classes[cls] = {
      eligible: true, speedFactor: sf, magnitudeFactor: mf,
      reason: "personalized_active", source: "personalized_state",
    };
    eligibleClasses.push(cls);
  }

  return {
    eligible: eligibleClasses.length > 0,
    classes,
    reason: eligibleClasses.length > 0 ? "personalized_active" : "no_eligible_classes",
    eligibleClasses,
  };
}

// Resolve the full model from the user's persisted state.
export function resolveModelComponents(
  projectionState: any | null,
  mealState: any | null
): ModelResolution {
  const general = resolveGeneralComponent(projectionState);
  const meal = resolveMealComponent(mealState);

  const modelVersion = general.eligible ? PERSONALIZED_MODEL_VERSION : BASELINE_MODEL_VERSION;
  const mealModelVersion = meal.eligible ? MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED : MEAL_RESPONSE_MODEL_VERSION_BASELINE;
  const isIntegrated = general.eligible && meal.eligible;

  let resolutionReason: string;
  if (isIntegrated) {
    resolutionReason = "integrated_personalized";
  } else if (general.eligible) {
    resolutionReason = "general_personalized_meal_baseline";
  } else if (meal.eligible) {
    resolutionReason = "meal_personalized_general_baseline";
  } else {
    resolutionReason = "full_baseline";
  }

  return {
    general,
    meal,
    modelVersion,
    mealModelVersion,
    isIntegrated,
    resolutionReason,
  };
}

// ── Factory functions for shadow evaluation ─────────────────────────────────
// These construct specific model resolutions for replaying alternative
// configurations on the same historical inputs.

export function createBaselineResolution(): ModelResolution {
  return {
    general: { eligible: false, effectiveValue: 1.0, reason: "shadow_baseline", source: "baseline" },
    meal: { eligible: false, classes: {}, reason: "shadow_baseline", eligibleClasses: [] },
    modelVersion: BASELINE_MODEL_VERSION,
    mealModelVersion: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
    isIntegrated: false,
    resolutionReason: "shadow_baseline",
  };
}

export function createGeneralOnlyResolution(rateAdjustmentFactor: number): ModelResolution {
  const eligible = Number.isFinite(rateAdjustmentFactor)
    && rateAdjustmentFactor >= MIN_RATE_FACTOR
    && rateAdjustmentFactor <= MAX_RATE_FACTOR
    && Math.abs(rateAdjustmentFactor - 1.0) >= FACTOR_EPSILON;

  return {
    general: {
      eligible,
      effectiveValue: eligible ? rateAdjustmentFactor : 1.0,
      reason: eligible ? "shadow_general" : "shadow_baseline",
      source: eligible ? "personalized_state" : "baseline",
    },
    meal: { eligible: false, classes: {}, reason: "shadow_baseline", eligibleClasses: [] },
    modelVersion: eligible ? PERSONALIZED_MODEL_VERSION : BASELINE_MODEL_VERSION,
    mealModelVersion: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
    isIntegrated: false,
    resolutionReason: eligible ? "shadow_general_personalized" : "shadow_baseline",
  };
}

export function createMealOnlyResolution(
  mealParams: Record<string, { speedFactor: number; magnitudeFactor: number }>
): ModelResolution {
  const classes: Record<string, MealClassResolution> = {};
  const eligibleClasses: SpeedClass[] = [];

  for (const cls of SPEED_CLASSES) {
    const p = mealParams[cls];
    if (!p) {
      classes[cls] = {
        eligible: false, speedFactor: 1.0, magnitudeFactor: 1.0,
        reason: "shadow_baseline", source: "baseline",
      };
      continue;
    }
    const sf = Number(p.speedFactor);
    const mf = Number(p.magnitudeFactor);
    const valid = Number.isFinite(sf) && sf >= MIN_MEAL_SPEED_FACTOR && sf <= MAX_MEAL_SPEED_FACTOR
      && Number.isFinite(mf) && mf >= MIN_MEAL_MAGNITUDE_FACTOR && mf <= MAX_MEAL_MAGNITUDE_FACTOR
      && (Math.abs(sf - 1.0) >= FACTOR_EPSILON || Math.abs(mf - 1.0) >= FACTOR_EPSILON);

    classes[cls] = {
      eligible: valid,
      speedFactor: valid ? sf : 1.0,
      magnitudeFactor: valid ? mf : 1.0,
      reason: valid ? "shadow_meal" : "shadow_baseline",
      source: valid ? "personalized_state" : "baseline",
    };
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

// Extract the effective meal params from a ModelResolution for the projection
// engine. Returns null when no class is eligible (baseline).
export function extractEffectiveMealParams(resolution: ModelResolution): Record<string, { speedFactor: number; magnitudeFactor: number }> | null {
  if (!resolution.meal.eligible) return null;
  const result: Record<string, { speedFactor: number; magnitudeFactor: number }> = {};
  for (const cls of SPEED_CLASSES) {
    const cr = resolution.meal.classes[cls];
    if (cr && cr.eligible) {
      result[cls] = { speedFactor: cr.speedFactor, magnitudeFactor: cr.magnitudeFactor };
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}