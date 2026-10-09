// Stackd Insight Engine — Adaptive Glucose Projection (Milestone 1: Foundation)
//
// A transparent, testable baseline glucose projection model. Projects future
// glucose from the latest valid CGM reading by balancing:
//   - Carb appearance rate (g/min from the existing gamma absorption model)
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
// SAFETY: This is an informational wellness estimate, never a clinical
// decision-maker. It never recommends, prescribes, or calculates insulin
// doses. It never modifies user settings. It only READS settings to convert
// rates. Uncertain predictions widen or abstain — they never look like
// confirmed readings.
//
// Self-contained (no base44:runtime, no npm: imports) so it runs in both the
// backend function runtime and the vitest test environment.

import {
  getCarbSpeedClass,
  getCarbDualWave,
  BASELINE_CLASS_PARAMS,
  getClassPeakMinutes,
  getClassWindowMinutes,
  MINUTE_MS,
} from "./carbAbsorptionProfile.ts";

// ── Model identity ──────────────────────────────────────────────────────────
export const PROJECTION_MODEL_VERSION = "1.0.0-baseline";
export const BASELINE_MODEL_VERSION = "1.0.0-baseline";
export const PERSONALIZED_MODEL_VERSION = "1.1.0-personalized";

// ── Tunable constants (Milestone 1 baseline) ───────────────────────────────
const STALE_THRESHOLD_MIN = 15;       // abstain if latest reading is older
const MIN_READINGS_FOR_MOMENTUM = 2;  // need 2+ readings for a trend
const MOMENTUM_DECAY_MIN = 20;        // momentum half-life ~14min, ~0 at 60min
const DEFAULT_HORIZON_MIN = 60;       // 1-hour forecast (extendable)
const STEP_MIN = 5;                   // 5-min steps (matches CGM interval)
const BASE_SIGMA_MGDL = 8;            // base uncertainty at the anchor
const SIGMA_PER_SQRT_MIN = 1.5;      // uncertainty growth per sqrt(min)
const MAX_SIGMA_MGDL = 60;            // cap so the band never gets absurd
const MIN_CONFIDENCE = 0.15;
const ABSTAIN_CONFIDENCE_THRESHOLD = 0.12;

// Conservative fallback when user hasn't set ISF / I:C. Flagged as uncalibrated.
const UNCALIBRATED_MG_PER_GRAM = 3.0;

// Gamma shape exponent — matches the frontend ABSORPTION_SHAPE_EXP so the
// engine's carb appearance rate reconciles with the rendered absorption curve.
const ABSORPTION_SHAPE_EXP = 3.0;

// ── Types ──────────────────────────────────────────────────────────────────
export interface NormalizedSnapshot {
  now: number;
  readings: { time: number; value: number; source: string }[];
  activeMeals: any[];
  activeDoses: any[];
  settings: {
    isf: number | null;
    unitsPer5g: number | null;
    targetLow: number | null;
    targetHigh: number | null;
  };
  anchor: { time: number; value: number } | null;
  momentumMgDlPerMin: number;
  dataQuality: DataQuality;
}

export interface DataQuality {
  staleReadings: boolean;
  gapPresent: boolean;
  readingCount: number;
  activeMealCount: number;
  activeDoseCount: number;
  calibrated: boolean;
  confounders: string[];
}

export interface ProjectionPoint {
  time: number;
  min_offset: number;
  value: number;
  lower: number;
  upper: number;
}

export interface ProjectionResult {
  trajectory: ProjectionPoint[];
  anchor: { time: number; value: number } | null;
  modelVersion: string;
  generatedAt: number;
  horizonMinutes: number;
  confidence: number;
  abstained: boolean;
  abstainReason: string | null;
  dataQuality: DataQuality;
  uncertaintySummary: { baseSigma: number; sigmaPerSqrtMin: number; maxSigma: number } | null;
  inputProvenance: {
    readingCount: number;
    mealCount: number;
    doseCount: number;
    anchorAgeMin: number;
    settingsCalibrated: boolean;
  } | null;
  activeInputs: {
    totalActiveCarbGrams: number;
    totalActiveInsulinUnits: number;
    mealCount: number;
    doseCount: number;
  } | null;
}

// ── Math primitives ────────────────────────────────────────────────────────

// Gamma-shaped carb appearance rate (matches frontend gammaRate).
function gammaRate(elapsedMin: number, peakMin: number, shapeExp: number): number {
  if (elapsedMin <= 0 || peakMin <= 0) return 0;
  const ratio = elapsedMin / peakMin;
  if (ratio > 8) return 0;
  return Math.pow(ratio, shapeExp) * Math.exp(shapeExp * (1 - ratio));
}

// Numerical integration of the gamma rate (trapezoidal, 2-min step).
function integrateGamma(toMin: number, peakMin: number, shapeExp: number, step = 2): number {
  if (toMin <= 0) return 0;
  let area = 0;
  for (let t = 0; t < toMin; t += step) {
    const r1 = gammaRate(t, peakMin, shapeExp);
    const r2 = gammaRate(t + step, peakMin, shapeExp);
    area += ((r1 + r2) / 2) * step;
  }
  return area;
}

// Dual-wave rate for high-fat/protein meals (first quick wave + delayed second).
function dualWaveRate(minOffset: number, peakMin: number): number {
  const firstPeak = Math.min(35, peakMin * 0.8);
  const secondPeak = Math.max(Math.min(120, peakMin + 80), firstPeak + 25);
  const firstShare = 0.35;
  const secondShare = 0.65;
  return gammaRate(minOffset, firstPeak, 2.2) * firstShare + gammaRate(minOffset, secondPeak, 3.2) * secondShare;
}

// Carb appearance rate (g/min) for a meal at elapsed minutes since meal time.
export function carbAppearanceRateGPerMin(entry: any, atTime: number): number {
  const carbs = Number(entry?.carbs) || 0;
  if (carbs <= 0) return 0;
  const mealTime = new Date(entry.consumed_at).getTime();
  if (!Number.isFinite(mealTime)) return 0;
  const elapsedMin = (atTime - mealTime) / MINUTE_MS;
  if (elapsedMin <= 0) return 0;

  const speedClass = getCarbSpeedClass(entry);
  const dualWave = getCarbDualWave(entry);
  const peakMin = getClassPeakMinutes(speedClass);
  const windowMin = getClassWindowMinutes(speedClass);
  if (elapsedMin >= windowMin) return 0;

  const rateFn = dualWave
    ? (t: number) => dualWaveRate(t, peakMin)
    : (t: number) => gammaRate(t, peakMin, ABSORPTION_SHAPE_EXP);

  // Total area under the rate curve (integrates to 1.0 when normalized).
  let totalArea = 0;
  const step = 2;
  for (let t = 0; t < windowMin; t += step) {
    totalArea += ((rateFn(t) + rateFn(t + step)) / 2) * step;
  }
  if (totalArea <= 0) return 0;

  return (rateFn(elapsedMin) / totalArea) * carbs;
}

// ── Insulin activity (finite-DIA beta curve) ────────────────────────────────
// Matches the frontend iobModel beta curve for rapid-acting analogs. For
// other bolus insulins (regular, NPH), uses a simplified exponential. Basal
// insulins contribute no acute activity to the projection (background only).

const BASAL_HINTS = ["lantus", "levemir", "tresiba", "toujeo", "basaglar", "semglee", "rezvoglar", "nph", "novolin n", "humulin n", "degludec", "detemir", "glargine", "icodec", "awiqli"];

function isBasalType(insulinType: string): boolean {
  const lower = String(insulinType || "").toLowerCase();
  return BASAL_HINTS.some((h) => lower.includes(h));
}

function getDoseTierDIA(units: number): number {
  const u = Math.max(0, units);
  if (u >= 25) return 300;
  if (u >= 15) return 270;
  if (u >= 5) return 240;
  return 210;
}

// Beta-curve insulin activity rate (units/min) for rapid-acting analogs.
function betaActivityRate(tMin: number, diaMin: number, units: number): number {
  const t = Math.max(0, tMin);
  const dia = Math.max(1, diaMin);
  if (t <= 0 || t >= dia || units <= 0) return 0;
  const x = t / dia;
  return (units * 105 * x * x * Math.pow(1 - x, 4)) / dia;
}

// Insulin activity rate (units/min) for a dose at a future time.
export function insulinActivityRateUnitsPerMin(dose: any, atTime: number): number {
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

function parseReadings(raw: any[]): { time: number; value: number; source: string }[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const parsed: { time: number; value: number; source: string }[] = [];
  for (const r of raw) {
    if (!r) continue;
    const time = new Date(r.recorded_at).getTime();
    const value = Number(r.value);
    if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
    const key = `${time}|${value}`;
    if (seen.has(key)) continue; // deduplicate
    seen.add(key);
    parsed.push({ time, value, source: String(r.source || "manual") });
  }
  return parsed.sort((a, b) => a.time - b.time);
}

function computeMomentum(readings: { time: number; value: number }[], now: number): number {
  if (readings.length < MIN_READINGS_FOR_MOMENTUM) return 0;
  // Use the last 2-3 readings within a 30-min span for a short-term slope.
  const recent = readings.slice(-3);
  const newest = recent[recent.length - 1];
  const span = recent.filter((p) => p.time >= newest.time - 30 * MINUTE_MS);
  if (span.length < 2) return 0;
  const first = span[0];
  const last = span[span.length - 1];
  const dtMin = (last.time - first.time) / MINUTE_MS;
  if (dtMin <= 0) return 0;
  return (last.value - first.value) / dtMin; // mg/dL per min
}

function detectGap(readings: { time: number; value: number }[], now: number): boolean {
  if (readings.length < 2) return false;
  // A gap is any interval > 20 min between consecutive readings in the last 6h.
  const cutoff = now - 6 * 60 * MINUTE_MS;
  const recent = readings.filter((r) => r.time >= cutoff);
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].time - recent[i - 1].time > 20 * MINUTE_MS) return true;
  }
  return false;
}

export function normalizeInputs(
  rawReadings: any[],
  rawMeals: any[],
  rawDoses: any[],
  settings: any,
  now: number
): NormalizedSnapshot {
  const readings = parseReadings(rawReadings);

  const isf = Number.isFinite(Number(settings?.insulin_sensitivity_mgdl_per_unit))
    ? Number(settings.insulin_sensitivity_mgdl_per_unit)
    : null;
  const unitsPer5g = Number.isFinite(Number(settings?.meal_insulin_units_per_5g))
    ? Number(settings.meal_insulin_units_per_5g)
    : null;
  const targetLow = Number.isFinite(Number(settings?.target_range_low))
    ? Number(settings.target_range_low)
    : null;
  const targetHigh = Number.isFinite(Number(settings?.target_range_high))
    ? Number(settings.target_range_high)
    : null;
  const calibrated = isf != null && isf > 0 && unitsPer5g != null && unitsPer5g > 0;

  // Anchor: latest valid reading within the stale threshold.
  const latestReading = readings.length ? readings[readings.length - 1] : null;
  const anchorAgeMin = latestReading ? (now - latestReading.time) / MINUTE_MS : Infinity;
  const stale = !latestReading || anchorAgeMin > STALE_THRESHOLD_MIN;
  const anchor = stale ? null : { time: latestReading!.time, value: latestReading!.value };

  // Active meals: within their absorption window (meal time to window end).
  const activeMeals = (Array.isArray(rawMeals) ? rawMeals : [])
    .filter((m) => {
      if (!m || !Number.isFinite(Number(m.carbs)) || Number(m.carbs) <= 0) return false;
      const mealTime = new Date(m.consumed_at).getTime();
      if (!Number.isFinite(mealTime)) return false;
      const speedClass = getCarbSpeedClass(m);
      const windowMin = getClassWindowMinutes(speedClass);
      return mealTime <= now && mealTime + windowMin * MINUTE_MS > now;
    });

  // Active doses: bolus doses within their activity window (dose time to DIA).
  const activeDoses = (Array.isArray(rawDoses) ? rawDoses : [])
    .filter((d) => {
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

  const confounders: string[] = [];
  if (stale) confounders.push("stale_readings");
  if (gapPresent) confounders.push("sensor_gap");
  if (!calibrated) confounders.push("uncalibrated_settings");
  if (activeMeals.length > 1) confounders.push("overlapping_meals");
  if (activeDoses.length > 2) confounders.push("multiple_active_doses");

  return {
    now,
    readings,
    activeMeals,
    activeDoses,
    settings: { isf, unitsPer5g, targetLow, targetHigh },
    anchor,
    momentumMgDlPerMin: momentum,
    dataQuality: {
      staleReadings: stale,
      gapPresent,
      readingCount: readings.length,
      activeMealCount: activeMeals.length,
      activeDoseCount: activeDoses.length,
      calibrated,
      confounders,
    },
  };
}

// ── Uncertainty ─────────────────────────────────────────────────────────────

function computeSigmaAtOffset(minOffset: number, dq: DataQuality, netRate: number): number {
  let sigma = BASE_SIGMA_MGDL + SIGMA_PER_SQRT_MIN * Math.sqrt(Math.max(0, minOffset));

  // Widen for data quality issues.
  if (dq.staleReadings) sigma += 10;
  if (dq.gapPresent) sigma += 8;
  if (!dq.calibrated) sigma += 6;
  if (dq.confounders.includes("overlapping_meals")) sigma += 5;
  if (dq.confounders.includes("multiple_active_doses")) sigma += 4;

  // Asymmetric widening: a strongly rising net rate has more upside uncertainty;
  // a strongly falling rate has more downside. This keeps the band honest
  // about which direction is less certain.
  const rateInfluence = Math.min(15, Math.abs(netRate) * 3);
  sigma += rateInfluence;

  return Math.min(MAX_SIGMA_MGDL, sigma);
}

function computeConfidence(dq: DataQuality, hasActiveInputs: boolean, momentum: number): number {
  let confidence = 0.7;
  if (dq.staleReadings) confidence -= 0.3;
  if (dq.gapPresent) confidence -= 0.15;
  if (!dq.calibrated) confidence -= 0.15;
  if (dq.confounders.includes("overlapping_meals")) confidence -= 0.1;
  if (dq.confounders.includes("multiple_active_doses")) confidence -= 0.05;
  if (!hasActiveInputs && Math.abs(momentum) < 0.5) confidence -= 0.25; // nothing to project
  if (dq.readingCount < 3) confidence -= 0.1;
  return Math.max(MIN_CONFIDENCE, Math.min(1, confidence));
}

// ── Projection ──────────────────────────────────────────────────────────────

export function projectGlucose(
  snapshot: NormalizedSnapshot,
  opts: { horizonMin?: number; stepMin?: number; modelParams?: { rateAdjustmentFactor?: number } | null } = {}
): ProjectionResult {
  const horizonMin = Math.max(5, Math.min(180, Number(opts.horizonMin) || DEFAULT_HORIZON_MIN));
  const stepMin = Math.max(1, Number(opts.stepMin) || STEP_MIN);
  const generatedAt = snapshot.now;
  // rateAdjustmentFactor: a single learned correction for systematic prediction
  // bias (Milestone 2). NOT a model of the individual's glucose physiology —
  // it cannot distinguish absorption timing, magnitude, insulin action, or
  // activity/stress causes. It describes what the baseline tended to get wrong
  // on average; it never prescribes. Baseline = 1.0 (no correction).
  const rateAdjustmentFactor = Number(opts.modelParams?.rateAdjustmentFactor) || 1.0;
  const isPersonalized = Math.abs(rateAdjustmentFactor - 1.0) > 0.001;
  const modelVersion = isPersonalized ? PERSONALIZED_MODEL_VERSION : BASELINE_MODEL_VERSION;

  // Abstain if no valid anchor.
  if (!snapshot.anchor) {
    return {
      trajectory: [],
      anchor: null,
      modelVersion,
      generatedAt,
      horizonMinutes: horizonMin,
      confidence: 0,
      abstained: true,
      abstainReason: "No valid CGM reading within the freshness window. Connect a glucose source or log a reading.",
      dataQuality: snapshot.dataQuality,
      uncertaintySummary: null,
      inputProvenance: null,
      activeInputs: null,
    };
  }

  const hasActiveInputs = snapshot.activeMeals.length > 0 || snapshot.activeDoses.length > 0;
  const confidence = computeConfidence(snapshot.dataQuality, hasActiveInputs, snapshot.momentumMgDlPerMin);

  // Abstain if confidence is too low.
  if (confidence < ABSTAIN_CONFIDENCE_THRESHOLD) {
    return {
      trajectory: [],
      anchor: snapshot.anchor,
      modelVersion,
      generatedAt,
      horizonMinutes: horizonMin,
      confidence,
      abstained: true,
      abstainReason: "Insufficient evidence to project — data is too sparse or stale.",
      dataQuality: snapshot.dataQuality,
      uncertaintySummary: null,
      inputProvenance: null,
      activeInputs: null,
    };
  }

  // Conversion factors.
  const isf = snapshot.settings.isf && snapshot.settings.isf > 0 ? snapshot.settings.isf : null;
  const unitsPer5g = snapshot.settings.unitsPer5g && snapshot.settings.unitsPer5g > 0 ? snapshot.settings.unitsPer5g : null;
  const mgPerGram = isf != null && unitsPer5g != null
    ? isf * (unitsPer5g / 5)
    : UNCALIBRATED_MG_PER_GRAM;
  const insulinDropPerUnit = isf != null ? isf : null;

  const anchorTime = snapshot.anchor.time;
  const anchorValue = snapshot.anchor.value;
  const trajectory: ProjectionPoint[] = [];

  let currentValue = anchorValue;

  for (let offset = 0; offset <= horizonMin; offset += stepMin) {
    const futureTime = anchorTime + offset * MINUTE_MS;

    // Carb-driven rise (mg/dL/min).
    let carbRiseRate = 0;
    for (const meal of snapshot.activeMeals) {
      carbRiseRate += carbAppearanceRateGPerMin(meal, futureTime) * mgPerGram;
    }

    // Insulin-driven drop (mg/dL/min).
    let insulinDropRate = 0;
    if (insulinDropPerUnit != null) {
      for (const dose of snapshot.activeDoses) {
        insulinDropRate += insulinActivityRateUnitsPerMin(dose, futureTime) * insulinDropPerUnit;
      }
    }

    // Momentum (decaying).
    const momentum = snapshot.momentumMgDlPerMin * Math.exp(-offset / MOMENTUM_DECAY_MIN);

    const netRate = (carbRiseRate - insulinDropRate + momentum) * rateAdjustmentFactor;

    // Integrate: advance the value by netRate * stepMin (except at offset 0).
    if (offset > 0) {
      currentValue += netRate * stepMin;
    }

    // Clamp to a physiologically plausible range.
    currentValue = Math.max(20, Math.min(500, currentValue));

    const sigma = computeSigmaAtOffset(offset, snapshot.dataQuality, netRate);
    trajectory.push({
      time: futureTime,
      min_offset: offset,
      value: Math.round(currentValue),
      lower: Math.round(Math.max(20, currentValue - sigma)),
      upper: Math.round(Math.min(500, currentValue + sigma)),
    });
  }

  // Active inputs summary.
  const totalActiveCarbGrams = snapshot.activeMeals.reduce((s, m) => {
    const mealTime = new Date(m.consumed_at).getTime();
    const elapsed = (snapshot.now - mealTime) / MINUTE_MS;
    const speedClass = getCarbSpeedClass(m);
    const windowMin = getClassWindowMinutes(speedClass);
    const peakMin = getClassPeakMinutes(speedClass);
    const totalArea = integrateGamma(windowMin, peakMin, ABSORPTION_SHAPE_EXP);
    if (totalArea <= 0) return s;
    const elapsedArea = integrateGamma(Math.min(elapsed, windowMin), peakMin, ABSORPTION_SHAPE_EXP);
    const fraction = Math.max(0, Math.min(1, elapsedArea / totalArea));
    return s + Number(m.carbs) * (1 - fraction);
  }, 0);

  const totalActiveInsulinUnits = snapshot.activeDoses.reduce((s, d) => {
    const units = Number(d?.units) || 0;
    const doseTime = new Date(d?.administered_at || d?.created_at).getTime();
    const elapsed = (snapshot.now - doseTime) / MINUTE_MS;
    const dia = getDoseTierDIA(units);
    if (elapsed >= dia) return s;
    // Beta IOB fraction.
    const x = elapsed / dia;
    const iobFrac = Math.pow(1 - x, 7) + 7 * x * Math.pow(1 - x, 6) + 21 * x * x * Math.pow(1 - x, 5);
    return s + units * Math.max(0, iobFrac);
  }, 0);

  return {
    trajectory,
    anchor: snapshot.anchor,
    modelVersion,
    generatedAt,
    horizonMinutes: horizonMin,
    confidence: Math.round(confidence * 100) / 100,
    abstained: false,
    abstainReason: null,
    dataQuality: snapshot.dataQuality,
    uncertaintySummary: { baseSigma: BASE_SIGMA_MGDL, sigmaPerSqrtMin: SIGMA_PER_SQRT_MIN, maxSigma: MAX_SIGMA_MGDL },
    inputProvenance: {
      readingCount: snapshot.dataQuality.readingCount,
      mealCount: snapshot.dataQuality.activeMealCount,
      doseCount: snapshot.dataQuality.activeDoseCount,
      anchorAgeMin: Math.round((generatedAt - anchorTime) / MINUTE_MS),
      settingsCalibrated: snapshot.dataQuality.calibrated,
    },
    activeInputs: {
      totalActiveCarbGrams: Math.round(totalActiveCarbGrams),
      totalActiveInsulinUnits: Math.round(totalActiveInsulinUnits * 10) / 10,
      mealCount: snapshot.activeMeals.length,
      doseCount: snapshot.activeDoses.length,
    },
  };
}