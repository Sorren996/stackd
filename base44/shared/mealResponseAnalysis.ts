// Core retrospective meal-response analysis shared by the scheduled processor.
// Computes glucose/insulin outcome metrics for a single historical meal and
// classifies the response in cautious, retrospective language. Self-contained
// (no frontend imports) so it runs in the backend runtime.

import { buildMealFingerprint } from "./mealFingerprint.ts";

const MINUTE_MS = 60 * 1000;

const BASAL_HINTS = ["lantus", "levemir", "tresiba", "toujeo", "basaglar", "nph", "novolin n", "humulin n", "degludec", "detemir", "glargine"];

export function isBasalType(insulinType: string): boolean {
  const lower = String(insulinType || "").toLowerCase();
  return BASAL_HINTS.some((h) => lower.includes(h));
}

export function timeOf(entry: any, field: string): number {
  const t = entry?.[field];
  if (!t) return NaN;
  return new Date(t).getTime();
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export function nearestReading(readings: number[][], target: number, maxDistanceMs: number): { value: number; time: number } | null {
  let best: { value: number; time: number; dist: number } | null = null;
  for (const [t, v] of readings) {
    if (!Number.isFinite(t) || !Number.isFinite(v)) continue;
    const dist = Math.abs(t - target);
    if (dist > maxDistanceMs) continue;
    if (!best || dist < best.dist) best = { value: v, time: t, dist };
  }
  return best ? { value: best.value, time: best.time } : null;
}

export function slopeAt(readings: number[][], target: number, windowMs: number): { slope: number; trend: string } {
  const start = target - windowMs;
  const inWindow = readings.filter(([t, v]) => t >= start && t <= target && Number.isFinite(v));
  if (inWindow.length < 2) return { slope: 0, trend: "unknown" };
  inWindow.sort((a, b) => a[0] - b[0]);
  const first = inWindow[0];
  const last = inWindow[inWindow.length - 1];
  const dt = (last[0] - first[0]) / MINUTE_MS;
  if (dt <= 0) return { slope: 0, trend: "steady" };
  const slope = (last[1] - first[1]) / dt; // mg/dL per min
  let trend = "steady";
  if (slope > 0.5) trend = "rising";
  else if (slope < -0.5) trend = "falling";
  return { slope, trend };
}

// Time-weighted in-range percentage across the window using linear interpolation
// at a fixed sampling interval.
export function timeInRange(readings: number[][], windowStart: number, windowEnd: number, low: number, high: number): number {
  if (!readings.length) return 0;
  const step = 5 * MINUTE_MS;
  const sorted = readings.slice().sort((a, b) => a[0] - b[0]);
  let inRange = 0;
  let total = 0;
  for (let t = windowStart; t < windowEnd; t += step) {
    total += step;
    // interpolate between bracketing readings
    let v: number | null = null;
    for (let i = 0; i < sorted.length - 1; i++) {
      const [t0, v0] = sorted[i];
      const [t1, v1] = sorted[i + 1];
      if (t >= t0 && t <= t1) {
        const ratio = t1 === t0 ? 0 : (t - t0) / (t1 - t0);
        v = v0 + ratio * (v1 - v0);
        break;
      }
    }
    if (v == null) {
      // clamp to nearest within 30 min
      const near = nearestReading(sorted, t, 30 * MINUTE_MS);
      if (!near) continue;
      v = near.value;
    }
    if (v >= low && v <= high) inRange += step;
  }
  return total ? Math.round((inRange / total) * 100) : 0;
}

// Rough IOB estimate for a dose at a target time using linear decay.
export function doseIobAt(dose: any, targetTime: number): number {
  const units = Number(dose?.units);
  if (!Number.isFinite(units) || units <= 0) return 0;
  const doseTime = timeOf(dose, "administered_at");
  if (!Number.isFinite(doseTime) || doseTime > targetTime) return 0;
  if (isBasalType(dose?.insulin_type)) return 0; // basal handled as background
  const elapsedMin = (targetTime - doseTime) / MINUTE_MS;
  // approximate rapid/short acting duration ~300 min
  const durationMin = 300;
  if (elapsedMin >= durationMin) return 0;
  return units * (1 - elapsedMin / durationMin);
}

export interface AnalysisSettings {
  targetLow: number;
  targetHigh: number;
  preMealWindowMinutes: number;
  postMealWindowMinutes: number;
}

export function computeMealResponse(
  meal: any,
  glucoseReadings: any[],
  doses: any[],
  otherCarbs: any[],
  settings: AnalysisSettings
) {
  const mealTime = timeOf(meal, "consumed_at");
  if (!Number.isFinite(mealTime)) return null;

  const highProteinFat = Boolean(meal.is_high_protein_fat_meal);
  const windowHours = highProteinFat ? 6 : 4;
  const windowEnd = mealTime + windowHours * 60 * MINUTE_MS;
  const windowStart = mealTime - 30 * MINUTE_MS;
  const carbs = Number(meal.carbs) || 0;

  const preMs = (settings.preMealWindowMinutes || 45) * MINUTE_MS;
  const postMs = (settings.postMealWindowMinutes || 90) * MINUTE_MS;
  const initialStart = mealTime - preMs;
  const initialEnd = mealTime + postMs;

  const readings: number[][] = glucoseReadings
    .map((r) => [timeOf(r, "recorded_at"), Number(r.value)])
    .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v))
    .sort((a, b) => a[0] - b[0]);

  const windowReadings = readings.filter(([t]) => t >= windowStart && t <= windowEnd);
  const startReading = nearestReading(readings, mealTime, 30 * MINUTE_MS);
  const startTrend = slopeAt(readings, mealTime, 30 * MINUTE_MS);

  // glucose outcome metrics
  let peak: { value: number; time: number } | null = null;
  let lowest: { value: number; time: number } | null = null;
  for (const [t, v] of windowReadings) {
    if (!peak || v > peak.value) peak = { value: v, time: t };
    if (!lowest || v < lowest.value) lowest = { value: v, time: t };
  }
  const endReading = nearestReading(readings, windowEnd, 30 * MINUTE_MS);
  const startValue = startReading?.value ?? null;
  const maxValueRise = peak && startValue != null ? Math.max(0, peak.value - startValue) : 0;
  const tir = timeInRange(windowReadings, windowStart, windowEnd, settings.targetLow, settings.targetHigh);

  // insulin analysis
  const mealDoses = doses.filter((d) => {
    const t = timeOf(d, "administered_at");
    return Number.isFinite(t) && !isBasalType(d?.insulin_type) && t >= initialStart && t <= initialEnd;
  });
  const additionalDoses = doses.filter((d) => {
    const t = timeOf(d, "administered_at");
    return Number.isFinite(t) && !isBasalType(d?.insulin_type) && t > initialEnd && t <= windowEnd;
  });

  const initialUnits = mealDoses.reduce((s, d) => s + (Number(d.units) || 0), 0);
  const initialDose = mealDoses
    .slice()
    .sort((a, b) => Math.abs(timeOf(a, "administered_at") - mealTime) - Math.abs(timeOf(b, "administered_at") - mealTime))[0];
  const additionalUnits = additionalDoses.reduce((s, d) => s + (Number(d.units) || 0), 0);
  const additionalDetails = additionalDoses.map((d) => ({
    insulin_type: d.insulin_type,
    units: Number(d.units) || 0,
    minutes_after_meal: Math.round((timeOf(d, "administered_at") - mealTime) / MINUTE_MS),
  }));
  const totalUnits = initialUnits + additionalUnits;
  const activeInsulinAtStart = doses
    .filter((d) => !isBasalType(d?.insulin_type))
    .reduce((s, d) => s + doseIobAt(d, mealTime), 0);

  // carb / confounding analysis
  const otherWindowCarbs = otherCarbs.filter((c) => {
    if (c.id === meal.id) return false;
    const t = timeOf(c, "consumed_at");
    return Number.isFinite(t) && t >= windowStart && t <= windowEnd;
  });
  const overlappingMeal = otherWindowCarbs.some((c) => (Number(c.carbs) || 0) >= 15);
  let rescueCarbs = 0;
  const lowTime = lowest?.time;
  for (const c of otherWindowCarbs) {
    const cTime = timeOf(c, "consumed_at");
    const cCarbs = Number(c.carbs) || 0;
    if (cCarbs < 15) rescueCarbs += cCarbs;
    else if (lowTime && cTime > lowTime && cTime <= lowTime + 30 * MINUTE_MS) rescueCarbs += cCarbs;
  }

  // confounding events
  const confounding: string[] = [];
  if (overlappingMeal) confounding.push("overlapping_meal");
  if (rescueCarbs > 0) confounding.push("rescue_carbs");
  if (additionalDoses.length >= 2) confounding.push("multiple_corrections");
  if (windowReadings.length < 4) confounding.push("missing_glucose_data");
  if (activeInsulinAtStart > 1) confounding.push("active_insulin_at_start");
  if (startTrend.trend === "rising" && Math.abs(startTrend.slope) > 1.5) confounding.push("already_rising");
  if (startTrend.trend === "falling" && Math.abs(startTrend.slope) > 1.5) confounding.push("already_falling");
  if (highProteinFat) confounding.push("high_protein_fat");

  // outcome classification
  let classification = "unclear";
  const endValue = endReading?.value ?? null;
  const peakValue = peak?.value ?? null;
  const lowValue = lowest?.value ?? null;
  const aboveRangeAtEnd = endValue != null && endValue > settings.targetHigh;
  const belowRangeDuring = lowValue != null && lowValue < settings.targetLow;
  const returnedNearStart = endValue != null && startValue != null && Math.abs(endValue - startValue) <= 25;
  const substantialRise = maxValueRise >= 60;

  if (windowReadings.length < 4 || (overlappingMeal && rescueCarbs > 0 && additionalUnits > 0)) {
    classification = "unclear";
  } else if (belowRangeDuring || rescueCarbs > 0) {
    classification = "may_have_more_than_needed";
  } else if (aboveRangeAtEnd && substantialRise) {
    classification = "may_need_more";
  } else if (highProteinFat && substantialRise && belowRangeDuring) {
    classification = "mixed_or_delayed";
  } else if (substantialRise && belowRangeDuring) {
    classification = "mixed_or_delayed";
  } else if (returnedNearStart || tir >= 70) {
    classification = "well_supported";
  } else {
    classification = "unclear";
  }

  // confidence
  let confidence = 1.0;
  if (windowReadings.length < 6) confidence -= 0.3;
  if (overlappingMeal) confidence -= 0.25;
  if (rescueCarbs > 0) confidence -= 0.15;
  if (additionalDoses.length >= 2) confidence -= 0.15;
  if (activeInsulinAtStart > 1) confidence -= 0.1;
  if (highProteinFat) confidence -= 0.05;
  if (startTrend.trend !== "steady" && startTrend.trend !== "unknown") confidence -= 0.05;
  confidence = clamp(confidence, 0, 1);

  const fingerprint = buildMealFingerprint(meal.food_name || meal.name || "Meal", carbs, highProteinFat);

  return {
    meal_log_id: meal.id,
    meal_name_original: meal.food_name || meal.name || "Meal",
    meal_name_normalized: fingerprint.normalized_name,
    meal_fingerprint: fingerprint,
    carbs_logged: carbs,
    high_protein_fat: highProteinFat,
    meal_time: new Date(mealTime).toISOString(),
    analysis_window_end: new Date(windowEnd).toISOString(),
    starting_glucose: startValue,
    starting_trend: startTrend.trend,
    starting_slope: Number(startTrend.slope.toFixed(2)),
    peak_glucose: peak?.value ?? null,
    peak_time: peak ? new Date(peak.time).toISOString() : null,
    lowest_glucose: lowest?.value ?? null,
    lowest_time: lowest ? new Date(lowest.time).toISOString() : null,
    glucose_at_4_hours: endValue,
    maximum_glucose_rise: Math.round(maxValueRise),
    time_in_user_range: tir,
    initial_insulin_units: Number(initialUnits.toFixed(1)),
    initial_insulin_type: initialDose?.insulin_type || null,
    initial_insulin_time: initialDose ? new Date(timeOf(initialDose, "administered_at")).toISOString() : null,
    additional_insulin_units: Number(additionalUnits.toFixed(1)),
    additional_insulin_details: additionalDetails,
    total_insulin_units: Number(totalUnits.toFixed(1)),
    active_insulin_at_start: Number(activeInsulinAtStart.toFixed(1)),
    rescue_carbs: Math.round(rescueCarbs),
    overlapping_meal: overlappingMeal,
    confounding_events: confounding,
    outcome_classification: classification,
    confidence_score: Number(confidence.toFixed(2)),
    target_range_low: settings.targetLow,
    target_range_high: settings.targetHigh,
  };
}

export const DEFAULT_SETTINGS: AnalysisSettings = {
  targetLow: 70,
  targetHigh: 180,
  preMealWindowMinutes: 45,
  postMealWindowMinutes: 90,
};