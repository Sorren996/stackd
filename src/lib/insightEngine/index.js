// Stackd Insight Engine — Adaptive Glucose Projection (Milestone 1: Foundation)
//
// A transparent, testable baseline glucose projection model. Projects future
// glucose from the latest valid CGM reading by balancing:
//   - Carb appearance rate (g/min from the gamma absorption model)
//     converted to mg/dL/min via the user's insulin-to-carb ratio and ISF.
//   - Insulin activity rate (units/min from the finite-DIA beta curve)
//     converted to mg/dL/min via the user's ISF.
//   - Short-term momentum from the recent glucose trend, decaying into the
//     model-driven rate.
//
// This is a RATE-BALANCE model — the standard insulin/carb balance used in
// open-source APS (Loop, AndroidAPS, OpenAPS). It is NOT an LLM and does NOT
// depend on one. Personalization layers on top in Milestone 2.
//
// SAFETY: Informational wellness estimate, never a clinical decision-maker.
// Never recommends, prescribes, or calculates insulin doses. Never modifies
// user settings. Uncertain predictions widen or abstain — never look like
// confirmed readings.
//
// This is the frontend/testable reference implementation. The backend function
// (base44/functions/generateProjection) uses the matching base44/shared copy
// so predictions are generated server-side with the same algorithm.

// ── Model identity ──────────────────────────────────────────────────────────
export const PROJECTION_MODEL_VERSION = "1.0.0-baseline";
export const BASELINE_MODEL_VERSION = "1.0.0-baseline";
export const PERSONALIZED_MODEL_VERSION = "1.1.0-personalized";

// Meal-response model versions (Milestone 3). Separate from the general
// forecast model version so meal-response personalization can be evaluated
// independently.
export const MEAL_RESPONSE_MODEL_VERSION_BASELINE = "1.0.0-meal-baseline";
export const MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED = "1.1.0-meal-personalized";

import { extractEffectiveMealParams } from "./modelResolution";
import { getEmpiricalSigma } from "./uncertaintyCalibration";

// ── Shadow evaluation (Milestone 4) ─────────────────────────────────────────
export function replayProjection(
  originalProjection,
  historicalReadings,
  historicalMeals,
  historicalDoses,
  settings,
  alternativeResolution,
  uncertaintyCalibration
) {
  const generatedAt = new Date(originalProjection.generated_at).getTime();
  if (!Number.isFinite(generatedAt)) {
    return {
      trajectory: [],
      modelVersion: alternativeResolution.modelVersion,
      mealModelVersion: alternativeResolution.mealModelVersion,
      abstained: true,
      confidence: 0,
    };
  }

  const readingsAtTime = (Array.isArray(historicalReadings) ? historicalReadings : [])
    .filter((r) => {
      const t = new Date(r.recorded_at).getTime();
      return Number.isFinite(t) && t <= generatedAt;
    });

  const snapshot = normalizeInputs(readingsAtTime, historicalMeals || [], historicalDoses || [], settings || {}, generatedAt);

  const result = projectGlucose(snapshot, {
    horizonMin: originalProjection.horizon_minutes,
    modelResolution: alternativeResolution,
    uncertaintyCalibration: uncertaintyCalibration ?? null,
  });

  return {
    trajectory: result.trajectory,
    modelVersion: result.modelVersion,
    mealModelVersion: result.mealModelVersion,
    abstained: result.abstained,
    confidence: result.confidence,
  };
}

// Continuous 0-1 blend factor: how much fat/protein-driven delayed absorption
// is estimated. 0 = pure single-wave, 1 = full dual-wave. Medium levels get
// a graduated blend instead of a hard cliff. Mirrors the backend shared copy.
function deriveDualWaveBlend(entry) {
  const fat = Number(entry?.fat_grams ?? 0) || 0;
  const protein = Number(entry?.protein_grams ?? 0) || 0;
  const carbs = Number(entry?.carbs ?? 0) || 0;
  const fatScore = Math.min(1, fat / 40);
  const proteinWithCarbs = carbs > 0 ? Math.min(1, protein / 30) : 0;
  const proteinOnly = carbs === 0 ? Math.min(1, protein / 45) : 0;
  return Math.max(0, Math.min(1, Math.max(fatScore, proteinWithCarbs, proteinOnly)));
}

// Speed-class derivation (inlined from absorptionLearning to keep the engine
// self-contained and testable without pulling in the base44 client).
function deriveSpeedClass(entry) {
  const blend = deriveDualWaveBlend(entry);
  if (blend >= 0.5) return "high_fat";
  const gi = Number(entry?.glycemic_index ?? entry?.gi ?? 0) || 0;
  const profile = entry?.absorption_profile || "medium";
  if (profile === "fast" || gi >= 70) return "fast";
  return "mixed";
}

// ── Speed-class baseline timing (matches base44/shared/carbAbsorptionProfile) ──
const BASELINE_CLASS_PARAMS = {
  fast: { peakMin: 30, windowMin: 120, secPeakMin: null },
  mixed: { peakMin: 60, windowMin: 210, secPeakMin: null },
  high_fat: { peakMin: 40, windowMin: 300, secPeakMin: 120 },
};

const MINUTE_MS = 60 * 1000;

// ── Continuous curve parameter generation ──────────────────────────────────
// Mirrors base44/shared/carbAbsorptionProfile.ts deriveCurveParams. The
// absorption curve is generated from the food's continuous composition —
// peak_minutes and duration_minutes are continuous functions of glycemic_index,
// fat, protein, and fiber. The dual-wave blend scales continuously with
// fat/protein. Two foods with the same speed_class label but different
// compositions get different curves; changing composition moves the curve
// continuously (no bucket jumps).
export function deriveCurveParams(entry, speedFactor) {
  const carbs = Number(entry?.carbs ?? 0) || 0;
  const fat = Number(entry?.fat_grams ?? entry?.fat ?? 0) || 0;
  const protein = Number(entry?.protein_grams ?? entry?.protein ?? 0) || 0;
  const gi = Math.max(0, Math.min(100, Number(entry?.glycemic_index ?? entry?.gi ?? 0) || 0));
  const fiber = Number(entry?.fiber_grams ?? 0) || 0;
  const processed = entry?.processed_state;

  // First-wave peak (front-loaded): GI-driven, NO fat delay on the first wave.
  const effectiveGi = gi > 0 ? gi : (entry?.absorption_profile === "fast" ? 80 : 0);
  const basePeak = effectiveGi >= 70
    ? Math.max(20, 30 - (effectiveGi - 70) * 0.15)
    : (effectiveGi > 0 ? 55 : 60);
  const fatFrontLoad = Math.min(25, fat * 0.5);
  const baseWindow = effectiveGi >= 70
    ? Math.max(90, 120 - (effectiveGi - 70) * 0.6)
    : (effectiveGi > 0 ? Math.max(90, 210 - effectiveGi * 0.9) : 210);
  const fatExtend = fat * 0.625;
  const proteinExtend = carbs > 0 ? protein * 2.225 : protein * 1.5;
  const fiberExtend = fiber * 2.0;
  let procExtend = 0;
  if (processed === "raw") procExtend = 15;
  else if (processed === "processed") procExtend = -12;
  const fatDelay = fat * 0.9;
  const proteinDelay = carbs > 0 ? protein * 0.3 : 0;
  const fiberDelay = fiber * 1.0;
  let procDelay = 0;
  if (processed === "raw") procDelay = 8;
  else if (processed === "processed") procDelay = -6;

  let firstPeak = basePeak - fatFrontLoad;
  let windowMin = baseWindow + fatExtend + proteinExtend + fiberExtend + procExtend;
  let secondPeak = firstPeak + 60 + fatDelay + proteinDelay + fiberDelay + procDelay;

  firstPeak = Math.max(20, Math.min(60, Math.round(firstPeak)));
  windowMin = Math.max(90, Math.min(360, Math.round(windowMin)));
  secondPeak = Math.max(firstPeak + 50, Math.min(windowMin - 20, Math.round(secondPeak)));

  const blend = deriveDualWaveBlend(entry);
  const dualWave = blend >= 0.5;

  const s = Number.isFinite(speedFactor) && speedFactor > 0 ? speedFactor : 1;
  const peakMinutes = Math.max(20, Math.min(240, Math.round(firstPeak * s)));
  const durationMinutes = Math.max(90, Math.min(360, Math.round(windowMin * s)));
  const secondPeakMinutes = dualWave
    ? Math.max(peakMinutes + 40, Math.min(durationMinutes - 20, Math.round(secondPeak * s)))
    : null;

  return { peakMinutes, durationMinutes, blend, secondPeakMinutes, dualWave, derivedGi: gi };
}

// ── Tunable constants ───────────────────────────────────────────────────────
const STALE_THRESHOLD_MIN = 15;
const MIN_READINGS_FOR_MOMENTUM = 2;
const MOMENTUM_DECAY_MIN = 20;
const DEFAULT_HORIZON_MIN = 60;
const STEP_MIN = 5;
const BASE_SIGMA_MGDL = 8;
const SIGMA_PER_SQRT_MIN = 1.5;
const MAX_SIGMA_MGDL = 60;
const MIN_CONFIDENCE = 0.15;
const ABSTAIN_CONFIDENCE_THRESHOLD = 0.12;
const UNCALIBRATED_MG_PER_GRAM = 3.0;
const ABSORPTION_SHAPE_EXP = 3.0;

// ── Math primitives ────────────────────────────────────────────────────────

function gammaRate(elapsedMin, peakMin, shapeExp) {
  if (elapsedMin <= 0 || peakMin <= 0) return 0;
  const ratio = elapsedMin / peakMin;
  if (ratio > 8) return 0;
  return Math.pow(ratio, shapeExp) * Math.exp(shapeExp * (1 - ratio));
}

function integrateGamma(toMin, peakMin, shapeExp, step = 2) {
  if (toMin <= 0) return 0;
  let area = 0;
  for (let t = 0; t < toMin; t += step) {
    const r1 = gammaRate(t, peakMin, shapeExp);
    const r2 = gammaRate(t + step, peakMin, shapeExp);
    area += ((r1 + r2) / 2) * step;
  }
  return area;
}

// Front-loaded dual-wave rate for high-fat/protein meals. firstPeakMin and
// secondPeakMin are the continuous positions of the two waves (derived from
// composition by deriveCurveParams). The `blend` (0-1) controls intensity.
// ESTIMATE — describes, never prescribes.
function dualWaveRate(minOffset, firstPeakMin, secondPeakMin, blend = 1.0) {
  const fp = Math.max(20, firstPeakMin);
  const sp = Math.max(fp + 40, secondPeakMin || fp + 90);
  const fullDual = gammaRate(minOffset, fp, 1.0) * 0.65 + gammaRate(minOffset, sp, 2.0) * 0.35;
  if (blend >= 1.0) return fullDual;
  const single = gammaRate(minOffset, fp, ABSORPTION_SHAPE_EXP);
  return single * (1 - blend) + fullDual * blend;
}

// Carb appearance rate (g/min) for a meal at a future time. The curve is
// generated from the meal's continuous composition via deriveCurveParams —
// NOT from a speed-class bucket. The learned per-class speedFactor scales the
// composition-derived timing. Area always integrates to the logged carbs.
export function carbAppearanceRateGPerMin(entry, atTime, mealModelParams) {
  const carbs = Number(entry?.carbs) || 0;
  if (carbs <= 0) return 0;
  const mealTime = new Date(entry.consumed_at).getTime();
  if (!Number.isFinite(mealTime)) return 0;
  const elapsedMin = (atTime - mealTime) / MINUTE_MS;
  if (elapsedMin <= 0) return 0;

  const rescue = isRescueCarb(entry);
  const params = rescue
    ? { peakMinutes: BASELINE_CLASS_PARAMS.fast.peakMin, durationMinutes: BASELINE_CLASS_PARAMS.fast.windowMin, blend: 0, secondPeakMinutes: null, dualWave: false }
    : (() => {
        const speedClass = deriveSpeedClass(entry);
        const classParams = mealModelParams?.[speedClass];
        const speedFactor = classParams?.speedFactor != null ? Number(classParams.speedFactor) : null;
        return deriveCurveParams(entry, speedFactor);
      })();

  if (elapsedMin >= params.durationMinutes) return 0;

  const rateFn = params.dualWave && params.secondPeakMinutes != null
    ? (t) => dualWaveRate(t, params.peakMinutes, params.secondPeakMinutes, params.blend)
    : (t) => gammaRate(t, params.peakMinutes, ABSORPTION_SHAPE_EXP);

  let totalArea = 0;
  const step = 2;
  for (let t = 0; t < params.durationMinutes; t += step) {
    totalArea += ((rateFn(t) + rateFn(t + step)) / 2) * step;
  }
  if (totalArea <= 0) return 0;

  return (rateFn(elapsedMin) / totalArea) * carbs;
}

// ── Insulin activity (finite-DIA beta curve) ────────────────────────────────

const BASAL_HINTS = ["lantus", "levemir", "tresiba", "toujeo", "basaglar", "semglee", "rezvoglar", "nph", "novolin n", "humulin n", "degludec", "detemir", "glargine", "icodec", "awiqli"];

function isBasalType(insulinType) {
  const lower = String(insulinType || "").toLowerCase();
  return BASAL_HINTS.some((h) => lower.includes(h));
}

function getDoseTierDIA(units) {
  const u = Math.max(0, units);
  if (u >= 25) return 300;
  if (u >= 15) return 270;
  if (u >= 5) return 240;
  return 210;
}

function betaActivityRate(tMin, diaMin, units) {
  const t = Math.max(0, tMin);
  const dia = Math.max(1, diaMin);
  if (t <= 0 || t >= dia || units <= 0) return 0;
  const x = t / dia;
  return (units * 105 * x * x * Math.pow(1 - x, 4)) / dia;
}

export function insulinActivityRateUnitsPerMin(dose, atTime) {
  const units = Number(dose?.units) || 0;
  if (units <= 0) return 0;
  if (isBasalType(dose?.insulin_type)) return 0;
  const doseTime = new Date(dose?.administered_at || dose?.created_at).getTime();
  if (!Number.isFinite(doseTime) || doseTime > atTime) return 0;
  const elapsedMin = (atTime - doseTime) / MINUTE_MS;
  const dia = getDoseTierDIA(units);
  if (elapsedMin >= dia) return 0;
  return betaActivityRate(elapsedMin, dia, units);
}

// ── Data normalization ──────────────────────────────────────────────────────

// Rescue carbs: fast-acting glucose to treat/prevent lows. Modeled with the
// "fast" speed-class profile — never counted as meals for confounding or
// meal-response learning. Informational inputs to a forecast only.
const RESCUE_WINDOW_MIN = 120;

function isRescueCarb(entry) {
  return entry?.is_rescue_carb === true || entry?.classification === "rescue_carbs";
}

function parseReadings(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const parsed = [];
  for (const r of raw) {
    if (!r) continue;
    const time = new Date(r.recorded_at).getTime();
    const value = Number(r.value);
    if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
    const key = `${time}|${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    parsed.push({ time, value, source: String(r.source || "manual") });
  }
  return parsed.sort((a, b) => a.time - b.time);
}

function computeMomentum(readings, now) {
  if (readings.length < MIN_READINGS_FOR_MOMENTUM) return 0;
  const recent = readings.slice(-3);
  const newest = recent[recent.length - 1];
  const span = recent.filter((p) => p.time >= newest.time - 30 * MINUTE_MS);
  if (span.length < 2) return 0;
  const first = span[0];
  const last = span[span.length - 1];
  const dtMin = (last.time - first.time) / MINUTE_MS;
  if (dtMin <= 0) return 0;
  return (last.value - first.value) / dtMin;
}

function detectGap(readings, now) {
  if (readings.length < 2) return false;
  const cutoff = now - 6 * 60 * MINUTE_MS;
  const recent = readings.filter((r) => r.time >= cutoff);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].time - recent[i - 1].time > 20 * MINUTE_MS) return true;
  }
  return false;
}

export function normalizeInputs(rawReadings, rawMeals, rawDoses, settings, now) {
  const readings = parseReadings(rawReadings);

  const isf = Number.isFinite(Number(settings?.insulin_sensitivity_mgdl_per_unit))
    ? Number(settings.insulin_sensitivity_mgdl_per_unit) : null;
  const unitsPer5g = Number.isFinite(Number(settings?.meal_insulin_units_per_5g))
    ? Number(settings.meal_insulin_units_per_5g) : null;
  const targetLow = Number.isFinite(Number(settings?.target_range_low))
    ? Number(settings.target_range_low) : null;
  const targetHigh = Number.isFinite(Number(settings?.target_range_high))
    ? Number(settings.target_range_high) : null;
  const calibrated = isf != null && isf > 0 && unitsPer5g != null && unitsPer5g > 0;

  const latestReading = readings.length ? readings[readings.length - 1] : null;
  const anchorAgeMin = latestReading ? (now - latestReading.time) / MINUTE_MS : Infinity;
  const stale = !latestReading || anchorAgeMin > STALE_THRESHOLD_MIN;
  const anchor = stale ? null : { time: latestReading.time, value: latestReading.value };

  const activeMeals = (Array.isArray(rawMeals) ? rawMeals : []).filter((m) => {
    if (!m || isRescueCarb(m)) return false;
    if (!Number.isFinite(Number(m.carbs)) || Number(m.carbs) <= 0) return false;
    const mealTime = new Date(m.consumed_at).getTime();
    if (!Number.isFinite(mealTime)) return false;
    const windowMin = deriveCurveParams(m).durationMinutes;
    return mealTime <= now && mealTime + windowMin * MINUTE_MS > now;
  });

  // Active rescue carbs: rapid absorption window (fast-class: 120 min).
  const activeRescueCarbs = (Array.isArray(rawMeals) ? rawMeals : []).filter((m) => {
    if (!m || !isRescueCarb(m)) return false;
    if (!Number.isFinite(Number(m.carbs)) || Number(m.carbs) <= 0) return false;
    const mealTime = new Date(m.consumed_at).getTime();
    if (!Number.isFinite(mealTime)) return false;
    return mealTime <= now && mealTime + RESCUE_WINDOW_MIN * MINUTE_MS > now;
  });

  const activeDoses = (Array.isArray(rawDoses) ? rawDoses : []).filter((d) => {
    if (!d || isBasalType(d?.insulin_type)) return false;
    const units = Number(d?.units) || 0;
    if (units <= 0) return false;
    const doseTime = new Date(d?.administered_at || d?.created_at).getTime();
    if (!Number.isFinite(doseTime)) return false;
    const dia = getDoseTierDIA(units);
    return doseTime <= now && doseTime + dia * MINUTE_MS > now;
  });

  const momentum = computeMomentum(readings, now);
  const gapPresent = detectGap(readings, now);

  const confounders = [];
  if (stale) confounders.push("stale_readings");
  if (gapPresent) confounders.push("sensor_gap");
  if (!calibrated) confounders.push("uncalibrated_settings");
  if (activeMeals.length > 1) confounders.push("overlapping_meals");
  if (activeDoses.length > 2) confounders.push("multiple_active_doses");
  if (activeRescueCarbs.length > 0) confounders.push("active_rescue_carb");

  return {
    now, readings, activeMeals, activeRescueCarbs, activeDoses,
    settings: { isf, unitsPer5g, targetLow, targetHigh },
    anchor, momentumMgDlPerMin: momentum,
    dataQuality: {
      staleReadings: stale, gapPresent, readingCount: readings.length,
      activeMealCount: activeMeals.length, activeRescueCarbCount: activeRescueCarbs.length,
      activeDoseCount: activeDoses.length, calibrated, confounders,
    },
  };
}

// ── Horizon resolution (close-window rule) ──────────────────────────────────
//
// The forecast horizon adapts to what's driving glucose:
//   - Active meals: 60 min (the near-term meal-response window). Existing
//     behavior, unchanged.
//   - No meals, active insulin: 30 min (close window).
//   - No meals, no insulin: 20 min (very close — momentum only, decays ~20 min).
export function resolveHorizonMin(snapshot) {
  if (snapshot.activeMeals.length > 0 || snapshot.activeRescueCarbs.length > 0) return 60;
  if (snapshot.activeDoses.length > 0) return 30;
  return 20;
}

// ── Uncertainty ─────────────────────────────────────────────────────────────

function computeSigmaAtOffset(minOffset, dq, netRate, uncertaintyCalibration) {
  // The band starts at ZERO WIDTH at the anchor (the current reading) and
  // widens with the horizon. We know the current value exactly; uncertainty
  // grows as we project forward. The high/low lines connect to the glucose
  // line at the anchor and expand outward.
  if (minOffset <= 0) return 0;

  // Data-quality penalties ramp in over the first few minutes.
  const dqRamp = Math.min(1, minOffset / 5);

  // ── Empirically calibrated sigma (Milestone 4) ──
  if (uncertaintyCalibration?.calibrated) {
    const empirical = getEmpiricalSigma(minOffset, uncertaintyCalibration);
    if (empirical != null) {
      // Ramp from 0 at the anchor to the full empirical sigma at the first
      // measured horizon. The MAE at offset 0 is 0 (we know the current
      // value), so we scale by sqrt(offset/firstHorizon).
      const horizonKeys = Object.keys(uncertaintyCalibration.sigmaByHorizon)
        .map(Number)
        .sort((a, b) => a - b);
      const firstHorizon = horizonKeys.length > 0 ? horizonKeys[0] : 15;
      const anchorRamp = Math.min(1, Math.sqrt(minOffset / firstHorizon));
      let sigma = empirical * anchorRamp;
      if (dq.staleReadings) sigma += 10 * dqRamp;
      if (dq.gapPresent) sigma += 8 * dqRamp;
      return Math.min(MAX_SIGMA_MGDL, sigma);
    }
  }

  // ── Heuristic sigma (Milestone 1 fallback) ──
  // Starts at zero width at the anchor and widens with sqrt(offset) — no base
  // sigma, because we know the current value exactly.
  let sigma = SIGMA_PER_SQRT_MIN * Math.sqrt(minOffset);
  if (dq.staleReadings) sigma += 10 * dqRamp;
  if (dq.gapPresent) sigma += 8 * dqRamp;
  if (!dq.calibrated) sigma += 6 * dqRamp;
  if (dq.confounders.includes("overlapping_meals")) sigma += 5 * dqRamp;
  if (dq.confounders.includes("multiple_active_doses")) sigma += 4 * dqRamp;
  if (dq.confounders.includes("active_rescue_carb")) sigma += 3 * dqRamp;
  sigma += Math.min(15, Math.abs(netRate) * 3) * dqRamp;
  return Math.min(MAX_SIGMA_MGDL, sigma);
}

function computeConfidence(dq, hasActiveInputs, momentum, modelResolution, uncertaintyCalibration) {
  let confidence = 0.7;
  if (dq.staleReadings) confidence -= 0.3;
  if (dq.gapPresent) confidence -= 0.15;
  if (!dq.calibrated) confidence -= 0.15;
  if (dq.confounders.includes("overlapping_meals")) confidence -= 0.1;
  if (dq.confounders.includes("multiple_active_doses")) confidence -= 0.05;
  if (!hasActiveInputs && Math.abs(momentum) < 0.5) confidence -= 0.25;
  if (dq.readingCount < 3) confidence -= 0.1;
  const hasPersonalization = modelResolution?.general.eligible || modelResolution?.meal.eligible;
  if (hasPersonalization && !uncertaintyCalibration?.calibrated) {
    confidence -= 0.05;
  }
  return Math.max(MIN_CONFIDENCE, Math.min(1, confidence));
}

// ── Projection ──────────────────────────────────────────────────────────────

export function projectGlucose(snapshot, opts = {}) {
  const horizonMin = Number(opts.horizonMin) > 0
    ? Math.max(5, Math.min(180, Number(opts.horizonMin)))
    : resolveHorizonMin(snapshot);
  const stepMin = Math.max(1, Number(opts.stepMin) || STEP_MIN);
  const generatedAt = snapshot.now;

  // ── Model resolution (Milestone 4) ──
  const modelResolution = opts.modelResolution ?? null;
  const uncertaintyCalibration = opts.uncertaintyCalibration ?? null;

  let rateAdjustmentFactor;
  let mealModelParams;
  let modelVersion;
  let mealModelVersion;

  if (modelResolution) {
    rateAdjustmentFactor = modelResolution.general.eligible
      ? modelResolution.general.effectiveValue
      : 1.0;
    mealModelParams = extractEffectiveMealParams(modelResolution);
    modelVersion = modelResolution.modelVersion;
    mealModelVersion = modelResolution.mealModelVersion;
  } else {
    rateAdjustmentFactor = Number(opts.modelParams?.rateAdjustmentFactor) || 1.0;
    const isPersonalized = Math.abs(rateAdjustmentFactor - 1.0) > 0.001;
    modelVersion = isPersonalized ? PERSONALIZED_MODEL_VERSION : BASELINE_MODEL_VERSION;
    mealModelParams = opts.mealModelParams || null;
    const hasMealPersonalization = mealModelParams != null &&
      Object.values(mealModelParams).some((p) =>
        p && (Math.abs(Number(p.speedFactor) - 1.0) > 0.001 || Math.abs(Number(p.magnitudeFactor) - 1.0) > 0.001)
      );
    mealModelVersion = hasMealPersonalization
      ? MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED
      : MEAL_RESPONSE_MODEL_VERSION_BASELINE;
  }

  if (!snapshot.anchor) {
    return {
      trajectory: [], anchor: null, modelVersion, mealModelVersion,
      generatedAt, horizonMinutes: horizonMin, confidence: 0,
      abstained: true, abstainReason: "No valid CGM reading within the freshness window.",
      dataQuality: snapshot.dataQuality, uncertaintySummary: null,
      inputProvenance: null, activeInputs: null,
    };
  }

  const hasActiveInputs = snapshot.activeMeals.length > 0 || snapshot.activeRescueCarbs.length > 0 || snapshot.activeDoses.length > 0;
  const confidence = computeConfidence(
    snapshot.dataQuality, hasActiveInputs, snapshot.momentumMgDlPerMin,
    modelResolution, uncertaintyCalibration
  );

  if (confidence < ABSTAIN_CONFIDENCE_THRESHOLD) {
    return {
      trajectory: [], anchor: snapshot.anchor, modelVersion, mealModelVersion,
      generatedAt, horizonMinutes: horizonMin, confidence,
      abstained: true, abstainReason: "Insufficient evidence to project.",
      dataQuality: snapshot.dataQuality, uncertaintySummary: null,
      inputProvenance: null, activeInputs: null,
    };
  }

  const isf = snapshot.settings.isf && snapshot.settings.isf > 0 ? snapshot.settings.isf : null;
  const unitsPer5g = snapshot.settings.unitsPer5g && snapshot.settings.unitsPer5g > 0 ? snapshot.settings.unitsPer5g : null;
  const mgPerGram = isf != null && unitsPer5g != null ? isf * (unitsPer5g / 5) : UNCALIBRATED_MG_PER_GRAM;
  const insulinDropPerUnit = isf != null ? isf : null;

  const anchorTime = snapshot.anchor.time;
  const anchorValue = snapshot.anchor.value;
  const trajectory = [];
  let currentValue = anchorValue;

  for (let offset = 0; offset <= horizonMin; offset += stepMin) {
    const futureTime = anchorTime + offset * MINUTE_MS;

    // Carb-driven rise (mg/dL/min).
    // The speed factor is applied inside carbAppearanceRateGPerMin (timing).
    // The magnitude factor is applied here per-meal (excursion magnitude).
    // These are SEPARATE corrections: speedFactor shapes WHEN carbs hit,
    // magnitudeFactor shapes HOW MUCH glucose rise they produce.
    let carbRiseRate = 0;
    for (const meal of snapshot.activeMeals) {
      const mealSpeedClass = deriveSpeedClass(meal);
      const mealClassParams = mealModelParams?.[mealSpeedClass];
      const magnitudeFactor = mealClassParams?.magnitudeFactor != null
        ? Number(mealClassParams.magnitudeFactor)
        : 1.0;
      carbRiseRate += carbAppearanceRateGPerMin(meal, futureTime, mealModelParams) * mgPerGram * magnitudeFactor;
    }
    // Rescue carbs: rapid absorption (fast-class profile), no personalization.
    for (const rescue of snapshot.activeRescueCarbs) {
      carbRiseRate += carbAppearanceRateGPerMin(rescue, futureTime, null) * mgPerGram;
    }

    let insulinDropRate = 0;
    if (insulinDropPerUnit != null) {
      for (const dose of snapshot.activeDoses) {
        insulinDropRate += insulinActivityRateUnitsPerMin(dose, futureTime) * insulinDropPerUnit;
      }
    }

    const momentum = snapshot.momentumMgDlPerMin * Math.exp(-offset / MOMENTUM_DECAY_MIN);
    const netRate = (carbRiseRate - insulinDropRate + momentum) * rateAdjustmentFactor;

    if (offset > 0) currentValue += netRate * stepMin;
    currentValue = Math.max(20, Math.min(500, currentValue));

    const sigma = computeSigmaAtOffset(offset, snapshot.dataQuality, netRate, uncertaintyCalibration);
    trajectory.push({
      time: futureTime, min_offset: offset,
      value: Math.round(currentValue),
      lower: Math.round(Math.max(20, currentValue - sigma)),
      upper: Math.round(Math.min(500, currentValue + sigma)),
    });
  }

  // Active speed classes (for meal-response evaluation grouping).
  const activeSpeedClasses = [...new Set(snapshot.activeMeals.map((m) => deriveSpeedClass(m)))];

  const totalActiveCarbGrams = snapshot.activeMeals.reduce((s, m) => {
    const mealTime = new Date(m.consumed_at).getTime();
    const elapsed = (snapshot.now - mealTime) / MINUTE_MS;
    const speedClass = deriveSpeedClass(m);
    const classParams = mealModelParams?.[speedClass];
    const speedFactor = classParams?.speedFactor != null ? Number(classParams.speedFactor) : null;
    const params = deriveCurveParams(m, speedFactor);
    const rateFn = params.dualWave && params.secondPeakMinutes != null
      ? (t) => dualWaveRate(t, params.peakMinutes, params.secondPeakMinutes, params.blend)
      : (t) => gammaRate(t, params.peakMinutes, ABSORPTION_SHAPE_EXP);
    const step = 2;
    let totalArea = 0;
    for (let t = 0; t < params.durationMinutes; t += step) {
      totalArea += ((rateFn(t) + rateFn(t + step)) / 2) * step;
    }
    if (totalArea <= 0) return s;
    let elapsedArea = 0;
    const cap = Math.min(elapsed, params.durationMinutes);
    for (let t = 0; t < cap; t += step) {
      elapsedArea += ((rateFn(t) + rateFn(t + step)) / 2) * step;
    }
    const fraction = Math.max(0, Math.min(1, elapsedArea / totalArea));
    return s + Number(m.carbs) * (1 - fraction);
  }, 0);

  // Rescue carb grams still on board (remaining, using the fixed fast profile).
  const totalActiveRescueCarbGrams = snapshot.activeRescueCarbs.reduce((s, m) => {
    const mealTime = new Date(m.consumed_at).getTime();
    const elapsed = (snapshot.now - mealTime) / MINUTE_MS;
    const peakMin = BASELINE_CLASS_PARAMS.fast.peakMin;
    const windowMin = BASELINE_CLASS_PARAMS.fast.windowMin;
    const rateFn = (t) => gammaRate(t, peakMin, ABSORPTION_SHAPE_EXP);
    const step = 2;
    let totalArea = 0;
    for (let t = 0; t < windowMin; t += step) {
      totalArea += ((rateFn(t) + rateFn(t + step)) / 2) * step;
    }
    if (totalArea <= 0) return s;
    let elapsedArea = 0;
    const cap = Math.min(elapsed, windowMin);
    for (let t = 0; t < cap; t += step) {
      elapsedArea += ((rateFn(t) + rateFn(t + step)) / 2) * step;
    }
    const fraction = Math.max(0, Math.min(1, elapsedArea / totalArea));
    return s + Number(m.carbs) * (1 - fraction);
  }, 0);

  const totalActiveInsulinUnits = snapshot.activeDoses.reduce((s, d) => {
    const units = Number(d?.units) || 0;
    const doseTime = new Date(d?.administered_at || d?.created_at).getTime();
    const elapsed = (snapshot.now - doseTime) / MINUTE_MS;
    const dia = getDoseTierDIA(units);
    if (elapsed >= dia) return s;
    const x = elapsed / dia;
    const iobFrac = Math.pow(1 - x, 7) + 7 * x * Math.pow(1 - x, 6) + 21 * x * x * Math.pow(1 - x, 5);
    return s + units * Math.max(0, iobFrac);
  }, 0);

  return {
    trajectory, anchor: snapshot.anchor, modelVersion, mealModelVersion,
    generatedAt, horizonMinutes: horizonMin,
    confidence: Math.round(confidence * 100) / 100,
    abstained: false, abstainReason: null,
    dataQuality: snapshot.dataQuality,
    uncertaintySummary: { baseSigma: 0, sigmaPerSqrtMin: SIGMA_PER_SQRT_MIN, maxSigma: MAX_SIGMA_MGDL },
    inputProvenance: {
      readingCount: snapshot.dataQuality.readingCount,
      mealCount: snapshot.dataQuality.activeMealCount,
      rescueCarbCount: snapshot.dataQuality.activeRescueCarbCount,
      doseCount: snapshot.dataQuality.activeDoseCount,
      anchorAgeMin: Math.round((generatedAt - anchorTime) / MINUTE_MS),
      settingsCalibrated: snapshot.dataQuality.calibrated,
    },
    activeInputs: {
      totalActiveCarbGrams: Math.round(totalActiveCarbGrams + totalActiveRescueCarbGrams),
      totalActiveInsulinUnits: Math.round(totalActiveInsulinUnits * 10) / 10,
      mealCount: snapshot.activeMeals.length,
      rescueCarbGrams: Math.round(totalActiveRescueCarbGrams),
      rescueCarbCount: snapshot.activeRescueCarbs.length,
      rescueTiming: snapshot.activeRescueCarbs.length > 0
        ? new Date(Math.max(...snapshot.activeRescueCarbs.map((r) => new Date(r.consumed_at).getTime()))).toISOString()
        : null,
      doseCount: snapshot.activeDoses.length,
      activeSpeedClasses,
    },
    modelResolution,
    effectiveParameters: {
      rateAdjustmentFactor,
      mealParams: mealModelParams,
    },
    uncertainty: uncertaintyCalibration
      ? {
          method: uncertaintyCalibration.method,
          version: uncertaintyCalibration.version,
          calibrated: uncertaintyCalibration.calibrated,
          sampleCount: uncertaintyCalibration.sampleCount,
          coverageObserved: uncertaintyCalibration.coverageObserved,
        }
      : null,
  };
}