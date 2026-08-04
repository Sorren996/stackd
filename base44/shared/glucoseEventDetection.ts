// Deterministic glucose-event detection for the AI Coach Insight Engine.
// Stage 1 of the pipeline: computes objective high, low, correction-response,
// and overnight events from raw logs. The AI model (Stage 2) only interprets
// these structured events — it must never invent values. Self-contained
// (no frontend imports) so it runs in the backend runtime.

import {
  isBasalType,
  doseIobAt,
  slopeAt,
  nearestReading,
  timeOf,
  clamp,
} from "./mealResponseAnalysis.ts";
import { AnalysisSettings } from "./mealResponseAnalysis.ts";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

export interface GlucoseEventDraft {
  event_type: "high" | "low" | "correction_response" | "overnight";
  start_time: string;
  end_time: string | null;
  starting_glucose: number | null;
  peak_glucose: number | null;
  peak_time: string | null;
  lowest_glucose: number | null;
  lowest_time: string | null;
  ending_glucose: number | null;
  duration_minutes: number | null;
  rate_of_rise: number | null;
  associated_meal_ids: string[];
  associated_insulin_ids: string[];
  associated_activity_ids: string[];
  active_insulin_at_start: number;
  additional_insulin_units: number;
  rescue_carbs: number;
  time_to_return_to_range_minutes: number | null;
  remained_unresolved: boolean;
  confounders: string[];
  classification: string;
  confidence: number;
  metrics: Record<string, any>;
}

interface ParsedReading {
  time: number;
  value: number;
  id: string;
}

function parseReadings(readings: any[]): ParsedReading[] {
  return (Array.isArray(readings) ? readings : [])
    .map((r) => ({ time: timeOf(r, "recorded_at"), value: Number(r.value), id: r.id }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
    .sort((a, b) => a.time - b.time);
}

function toPairs(readings: ParsedReading[]): number[][] {
  return readings.map((r) => [r.time, r.value]);
}

function nonBasalDoses(doses: any[]): any[] {
  return (Array.isArray(doses) ? doses : []).filter((d) => !isBasalType(d?.insulin_type));
}

export function isCorrectionDose(dose: any): boolean {
  const meal = Number(dose?.meal_units) || 0;
  const correction = Number(dose?.correction_units) || 0;
  if (correction > 0 && correction >= meal) return true;
  if (correction > 0) return true;
  // legacy records without the split: treat as correction if no units breakdown
  return meal === 0 && correction === 0 && Number(dose?.units) > 0
    ? false
    : correction > 0;
}

function round(n: number, p = 1): number {
  const f = Math.pow(10, p);
  return Math.round(n * f) / f;
}

function maxGapInRun(readings: ParsedReading[]): number {
  let max = 0;
  for (let i = 1; i < readings.length; i++) {
    max = Math.max(max, readings[i].time - readings[i - 1].time);
  }
  return max;
}

// ---------------------------------------------------------------------------
// High-glucose events
// ---------------------------------------------------------------------------

export function detectHighEvents(
  glucoseReadings: any[],
  doses: any[],
  carbEntries: any[],
  settings: AnalysisSettings
): GlucoseEventDraft[] {
  const readings = parseReadings(glucoseReadings);
  if (readings.length < 2) return [];

  const events: GlucoseEventDraft[] = [];
  let i = 0;
  while (i < readings.length) {
    if (readings[i].value <= settings.targetHigh) {
      i++;
      continue;
    }
    // start of a high run
    const run: ParsedReading[] = [];
    let j = i;
    let lastAboveIdx = i;
    while (j < readings.length && readings[j].value > settings.targetHigh) {
      run.push(readings[j]);
      lastAboveIdx = j;
      j++;
    }
    // end: the reading that brought it back to range (readings[j]) if present
    const startReading = readings[Math.max(0, i - 1)];
    const startTime = startReading.time;
    const startingGlucose = startReading.value;
    const endTime = j < readings.length ? readings[j].time : null;
    const endingGlucose = endTime != null ? readings[j].value : null;

    let peak = run[0];
    for (const r of run) if (r.value > peak.value) peak = r;

    const resolved = endTime != null;
    const durationMin = resolved ? round((endTime - startTime) / MINUTE_MS) : null;

    // associations
    const precedingMeals = (Array.isArray(carbEntries) ? carbEntries : []).filter((c) => {
      const t = timeOf(c, "consumed_at");
      return Number.isFinite(t) && t <= startTime && t >= startTime - 2 * HOUR_MS;
    });
    const precedingInsulin = nonBasalDoses(doses).filter((d) => {
      const t = timeOf(d, "administered_at");
      return Number.isFinite(t) && t <= startTime && t >= startTime - 4 * HOUR_MS;
    });
    const duringInsulin = nonBasalDoses(doses).filter((d) => {
      const t = timeOf(d, "administered_at");
      return Number.isFinite(t) && t >= startTime && (!endTime || t <= endTime);
    });
    const activeInsulinAtStart = precedingInsulin.reduce((s, d) => s + doseIobAt(d, startTime), 0);
    const additionalInsulin = duringInsulin.reduce((s, d) => s + (Number(d.units) || 0), 0);

    // confounders
    const confounders: string[] = [];
    if (precedingMeals.length > 1) confounders.push("multiple_preceding_meals");
    if (activeInsulinAtStart > 2) confounders.push("active_insulin_at_start");
    if (run.length < 4) confounders.push("sparse_glucose_data");
    if (maxGapInRun(run) > 45 * MINUTE_MS) confounders.push("reading_gap");
    // recent low before this high (rebound)
    const recentLow = readings.slice(Math.max(0, i - 12), i).some((r) => r.value < settings.targetLow);
    if (recentLow) confounders.push("recent_low_before_high");

    // classification
    let classification: string;
    if (!resolved) {
      classification = durationMin != null && durationMin > 240 ? "prolonged_high" : "unresolved";
    } else if (recentLow) {
      classification = "rebound_high";
    } else {
      // check for a low within 2h after resolution
      const lowAfter = readings.slice(j, j + 24).some((r) => r.value < settings.targetLow);
      if (lowAfter) classification = "high_followed_by_low";
      else if (additionalInsulin > 0.5) classification = "resolved_after_additional_insulin";
      else classification = "resolved_without_additional_insulin";
    }

    let confidence = 1.0;
    if (run.length < 6) confidence -= 0.3;
    if (maxGapInRun(run) > 45 * MINUTE_MS) confidence -= 0.2;
    if (activeInsulinAtStart > 2) confidence -= 0.1;
    if (precedingMeals.length > 1) confidence -= 0.15;
    if (!resolved) confidence -= 0.1;
    confidence = clamp(confidence, 0, 1);

    events.push({
      event_type: "high",
      start_time: new Date(startTime).toISOString(),
      end_time: resolved ? new Date(endTime).toISOString() : null,
      starting_glucose: startingGlucose,
      peak_glucose: peak.value,
      peak_time: new Date(peak.time).toISOString(),
      lowest_glucose: run.reduce((m, r) => Math.min(m, r.value), peak.value),
      lowest_time: null,
      ending_glucose: endingGlucose,
      duration_minutes: durationMin,
      rate_of_rise: peak.time > startTime ? round((peak.value - startingGlucose) / ((peak.time - startTime) / MINUTE_MS), 2) : null,
      associated_meal_ids: precedingMeals.map((c) => c.id),
      associated_insulin_ids: [...precedingInsulin, ...duringInsulin].map((d) => d.id),
      associated_activity_ids: [],
      active_insulin_at_start: round(activeInsulinAtStart),
      additional_insulin_units: round(additionalInsulin),
      rescue_carbs: 0,
      time_to_return_to_range_minutes: resolved ? durationMin : null,
      remained_unresolved: !resolved,
      confounders,
      classification,
      confidence: round(confidence, 2),
      metrics: { run_reading_count: run.length },
    });

    i = j;
  }

  return events;
}

// ---------------------------------------------------------------------------
// Low-glucose events
// ---------------------------------------------------------------------------

export function detectLowEvents(
  glucoseReadings: any[],
  doses: any[],
  carbEntries: any[],
  settings: AnalysisSettings
): GlucoseEventDraft[] {
  const readings = parseReadings(glucoseReadings);
  if (readings.length < 2) return [];

  const events: GlucoseEventDraft[] = [];
  let i = 0;
  while (i < readings.length) {
    if (readings[i].value >= settings.targetLow) {
      i++;
      continue;
    }
    const run: ParsedReading[] = [];
    let j = i;
    while (j < readings.length && readings[j].value < settings.targetLow) {
      run.push(readings[j]);
      j++;
    }
    const startReading = readings[Math.max(0, i - 1)];
    const startTime = startReading.time;
    const startingGlucose = startReading.value;
    const endTime = j < readings.length ? readings[j].time : null;
    const endingGlucose = endTime != null ? readings[j].value : null;

    let lowest = run[0];
    for (const r of run) if (r.value < lowest.value) lowest = r;

    const resolved = endTime != null;
    const durationMin = resolved ? round((endTime - startTime) / MINUTE_MS) : null;

    const precedingInsulin = nonBasalDoses(doses).filter((d) => {
      const t = timeOf(d, "administered_at");
      return Number.isFinite(t) && t <= startTime && t >= startTime - 4 * HOUR_MS;
    });
    const activeInsulinAtStart = precedingInsulin.reduce((s, d) => s + doseIobAt(d, startTime), 0);
    const recentCorrections = precedingInsulin.filter((d) => isCorrectionDose(d));
    const duringCarbs = (Array.isArray(carbEntries) ? carbEntries : []).filter((c) => {
      const t = timeOf(c, "consumed_at");
      return Number.isFinite(t) && t >= startTime && (!endTime || t <= endTime + 30 * MINUTE_MS);
    });
    const rescueCarbs = duringCarbs.reduce((s, c) => s + (Number(c.carbs) || 0), 0);

    const trendBefore = slopeAt(toPairs(readings.slice(Math.max(0, i - 6), i + 1)), startTime, 30 * MINUTE_MS);
    const startHour = new Date(startTime).getHours();
    const isOvernight = startHour >= 22 || startHour < 6;

    // confounders
    const confounders: string[] = [];
    if (activeInsulinAtStart > 1) confounders.push("active_insulin_at_start");
    if (recentCorrections.length > 0) confounders.push("recent_correction");
    if (run.length < 3) confounders.push("sparse_glucose_data");
    if (maxGapInRun(run) > 30 * MINUTE_MS) confounders.push("reading_gap");

    // recurrent low: another low run ending within the same insulin-action window
    let recurrent = false;
    let k = j + 1;
    while (k < readings.length && readings[k].time <= endTime + 4 * HOUR_MS) {
      if (readings[k].value < settings.targetLow) {
        recurrent = true;
        break;
      }
      k++;
    }

    // classification
    let classification: string;
    if (recurrent) classification = "recurrent_low";
    else if (rescueCarbs > 0) classification = "recovered_with_rescue_carbs";
    else if (resolved) classification = "recovered_without_logged_treatment";
    else classification = "unresolved";
    if (activeInsulinAtStart > 1 && classification === "recovered_without_logged_treatment") {
      classification = "low_with_active_insulin";
    }
    if (recentCorrections.length > 0 && classification !== "recurrent_low") {
      classification = "post_correction_low";
    }
    if (isOvernight && classification === "recovered_without_logged_treatment") {
      classification = "overnight_low";
    }

    let confidence = 1.0;
    if (run.length < 4) confidence -= 0.3;
    if (maxGapInRun(run) > 30 * MINUTE_MS) confidence -= 0.2;
    if (activeInsulinAtStart > 1) confidence -= 0.1;
    confidence = clamp(confidence, 0, 1);

    events.push({
      event_type: "low",
      start_time: new Date(startTime).toISOString(),
      end_time: resolved ? new Date(endTime).toISOString() : null,
      starting_glucose: startingGlucose,
      peak_glucose: run.reduce((m, r) => Math.max(m, r.value), lowest.value),
      peak_time: null,
      lowest_glucose: lowest.value,
      lowest_time: new Date(lowest.time).toISOString(),
      ending_glucose: endingGlucose,
      duration_minutes: durationMin,
      rate_of_rise: null,
      associated_meal_ids: [],
      associated_insulin_ids: precedingInsulin.map((d) => d.id),
      associated_activity_ids: [],
      active_insulin_at_start: round(activeInsulinAtStart),
      additional_insulin_units: 0,
      rescue_carbs: round(rescueCarbs),
      time_to_return_to_range_minutes: resolved ? durationMin : null,
      remained_unresolved: !resolved,
      confounders,
      classification,
      confidence: round(confidence, 2),
      metrics: {
        trend_before: trendBefore.trend,
        trend_slope: round(trendBefore.slope, 2),
        is_overnight: isOvernight,
        recurrent: recurrent,
      },
    });

    i = j;
  }

  return events;
}

// ---------------------------------------------------------------------------
// Correction-response event
// ---------------------------------------------------------------------------

export function analyzeCorrectionResponse(
  dose: any,
  glucoseReadings: any[],
  allDoses: any[],
  carbEntries: any[],
  settings: AnalysisSettings
): GlucoseEventDraft | null {
  if (!isCorrectionDose(dose)) return null;
  const correctionTime = timeOf(dose, "administered_at");
  if (!Number.isFinite(correctionTime)) return null;

  const readings = parseReadings(glucoseReadings);
  const units = Number(dose.units) || (Number(dose.correction_units) || 0);
  const windowEnd = correctionTime + 5 * HOUR_MS;
  const windowReadings = readings.filter((r) => r.time >= correctionTime - 30 * MINUTE_MS && r.time <= windowEnd);
  if (windowReadings.length < 2) return null;

  const startReading = nearestReading(toPairs(readings), correctionTime, 30 * MINUTE_MS);
  const startingGlucose = startReading?.value ?? null;
  const trend = slopeAt(toPairs(readings), correctionTime, 30 * MINUTE_MS);

  const otherNonBasal = nonBasalDoses(allDoses).filter((d) => d.id !== dose.id);
  const activeInsulinAtStart = otherNonBasal.reduce((s, d) => s + doseIobAt(d, correctionTime), 0);

  // after-correction readings
  const after = windowReadings.filter((r) => r.time > correctionTime);
  let maxAfter = startReading;
  let lowest = startReading;
  let fallStartedAt: number | null = null;
  let prevValue = startingGlucose;
  for (const r of after) {
    if (!maxAfter || r.value > maxAfter.value) maxAfter = r;
    if (!lowest || r.value < lowest.value) lowest = r;
    if (fallStartedAt == null && r.value < prevValue - 3) fallStartedAt = r.time;
    prevValue = r.value;
  }

  // return to range
  let returnedAt: number | null = null;
  if (startingGlucose != null && startingGlucose > settings.targetHigh) {
    for (const r of after) {
      if (r.value <= settings.targetHigh && r.value >= settings.targetLow) {
        returnedAt = r.time;
        break;
      }
    }
  }

  const additionalDoses = otherNonBasal.filter((d) => {
    const t = timeOf(d, "administered_at");
    return Number.isFinite(t) && t > correctionTime && t <= windowEnd;
  });
  const rescueCarbs = (Array.isArray(carbEntries) ? carbEntries : []).filter((c) => {
    const t = timeOf(c, "consumed_at");
    return Number.isFinite(t) && t > correctionTime && t <= windowEnd;
  }).reduce((s, c) => s + (Number(c.carbs) || 0), 0);

  const confounders: string[] = [];
  if (activeInsulinAtStart > 1) confounders.push("active_insulin_at_start");
  if (additionalDoses.length > 0) confounders.push("additional_insulin");
  if (rescueCarbs > 0) confounders.push("rescue_carbs");
  if (after.length < 4) confounders.push("sparse_glucose_data");
  const foodDuring = (Array.isArray(carbEntries) ? carbEntries : []).some((c) => {
    const t = timeOf(c, "consumed_at");
    return Number.isFinite(t) && Math.abs(t - correctionTime) < 45 * MINUTE_MS && (Number(c.carbs) || 0) >= 15;
  });
  if (foodDuring) confounders.push("food_near_correction");

  let classification = "incomplete_data";
  if (after.length >= 4) {
    if (lowest && lowest.value < settings.targetLow) classification = "correction_followed_by_low";
    else if (rescueCarbs > 0) classification = "required_rescue_carbs";
    else if (returnedAt != null) classification = "resolved_to_range";
    else classification = "unresolved";
  }
  if (confounders.length >= 3) classification = "confounded";

  let confidence = 1.0;
  if (after.length < 6) confidence -= 0.3;
  if (activeInsulinAtStart > 1) confidence -= 0.15;
  if (foodDuring) confidence -= 0.2;
  if (additionalDoses.length > 0) confidence -= 0.1;
  confidence = clamp(confidence, 0, 1);

  return {
    event_type: "correction_response",
    start_time: new Date(correctionTime).toISOString(),
    end_time: new Date(windowEnd).toISOString(),
    starting_glucose: startingGlucose,
    peak_glucose: maxAfter?.value ?? null,
    peak_time: maxAfter ? new Date(maxAfter.time).toISOString() : null,
    lowest_glucose: lowest?.value ?? null,
    lowest_time: lowest ? new Date(lowest.time).toISOString() : null,
    ending_glucose: after.length ? after[after.length - 1].value : null,
    duration_minutes: round((windowEnd - correctionTime) / MINUTE_MS),
    rate_of_rise: null,
    associated_meal_ids: [],
    associated_insulin_ids: [dose.id, ...additionalDoses.map((d) => d.id)],
    associated_activity_ids: [],
    active_insulin_at_start: round(activeInsulinAtStart),
    additional_insulin_units: round(additionalDoses.reduce((s, d) => s + (Number(d.units) || 0), 0)),
    rescue_carbs: round(rescueCarbs),
    time_to_return_to_range_minutes: returnedAt != null ? round((returnedAt - correctionTime) / MINUTE_MS) : null,
    remained_unresolved: returnedAt == null && after.length >= 4,
    confounders,
    classification,
    confidence: round(confidence, 2),
    metrics: {
      units,
      insulin_type: dose.insulin_type,
      trend_at_correction: trend.trend,
      trend_slope: round(trend.slope, 2),
      minutes_until_fall: fallStartedAt != null ? round((fallStartedAt - correctionTime) / MINUTE_MS) : null,
      food_near_correction: foodDuring,
    },
  };
}

// ---------------------------------------------------------------------------
// Overnight event
// ---------------------------------------------------------------------------

function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function analyzeOvernightWindow(
  glucoseReadings: any[],
  dateISO: string,
  doses: any[],
  carbEntries: any[],
  settings: AnalysisSettings
): GlucoseEventDraft | null {
  const readings = parseReadings(glucoseReadings);
  if (!readings.length) return null;

  // Overnight window: 10pm of the given calendar day to 6am the next day.
  const day = new Date(dateISO);
  if (isNaN(day.getTime())) return null;
  const start = new Date(day);
  start.setHours(22, 0, 0, 0);
  const end = new Date(start);
  end.setHours(end.getHours() + 8);

  const windowReadings = readings.filter((r) => r.time >= start.getTime() && r.time <= end.getTime());
  if (windowReadings.length < 3) return null;

  const values = windowReadings.map((r) => r.value);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const startReading = nearestReading(toPairs(readings), start.getTime(), 60 * MINUTE_MS);
  let peak = windowReadings[0];
  let lowest = windowReadings[0];
  for (const r of windowReadings) {
    if (r.value > peak.value) peak = r;
    if (r.value < lowest.value) lowest = r;
  }
  const highsCount = values.filter((v) => v > settings.targetHigh).length;
  const lowsCount = values.filter((v) => v < settings.targetLow).length;

  // detect a sustained rise window (dawn phenomenon): largest monotonic rise
  let bestRise = 0;
  let bestRiseStart: number | null = null;
  let bestRiseEnd: number | null = null;
  for (let a = 0; a < windowReadings.length; a++) {
    for (let b = a + 1; b < windowReadings.length; b++) {
      const rise = windowReadings[b].value - windowReadings[a].value;
      if (rise > bestRise) {
        bestRise = rise;
        bestRiseStart = windowReadings[a].time;
        bestRiseEnd = windowReadings[b].time;
      }
    }
  }

  const overnightDoses = nonBasalDoses(doses).filter((d) => {
    const t = timeOf(d, "administered_at");
    return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
  });
  const overnightCarbs = (Array.isArray(carbEntries) ? carbEntries : []).filter((c) => {
    const t = timeOf(c, "consumed_at");
    return Number.isFinite(t) && t >= start.getTime() && t <= end.getTime();
  });

  const confounders: string[] = [];
  if (overnightCarbs.length > 0) confounders.push("overnight_carbs");
  if (overnightDoses.length > 0) confounders.push("overnight_correction");
  if (windowReadings.length < 6) confounders.push("sparse_glucose_data");

  let classification = "stable_overnight";
  if (lowsCount > 0) classification = "overnight_low";
  else if (highsCount > 0) classification = "overnight_high";
  else if (bestRise >= 40 && bestRiseStart != null && new Date(bestRiseStart).getHours() >= 2) classification = "dawn_rise";
  else if (stdev(values) > 35) classification = "overnight_variability";

  let confidence = 1.0;
  if (windowReadings.length < 8) confidence -= 0.3;
  if (overnightCarbs.length > 0) confidence -= 0.2;
  confidence = clamp(confidence, 0, 1);

  return {
    event_type: "overnight",
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    starting_glucose: startReading?.value ?? null,
    peak_glucose: peak.value,
    peak_time: new Date(peak.time).toISOString(),
    lowest_glucose: lowest.value,
    lowest_time: new Date(lowest.time).toISOString(),
    ending_glucose: windowReadings[windowReadings.length - 1].value,
    duration_minutes: round((end.getTime() - start.getTime()) / MINUTE_MS),
    rate_of_rise: null,
    associated_meal_ids: overnightCarbs.map((c) => c.id),
    associated_insulin_ids: overnightDoses.map((d) => d.id),
    associated_activity_ids: [],
    active_insulin_at_start: 0,
    additional_insulin_units: round(overnightDoses.reduce((s, d) => s + (Number(d.units) || 0), 0)),
    rescue_carbs: round(overnightCarbs.reduce((s, c) => s + (Number(c.carbs) || 0), 0)),
    time_to_return_to_range_minutes: null,
    remained_unresolved: false,
    confounders,
    classification,
    confidence: round(confidence, 2),
    metrics: {
      average_glucose: round(avg),
      glucose_variability: round(stdev(values)),
      highs_count: highsCount,
      lows_count: lowsCount,
      largest_rise: round(bestRise),
      rise_window_start: bestRiseStart != null ? new Date(bestRiseStart).toISOString() : null,
      rise_window_end: bestRiseEnd != null ? new Date(bestRiseEnd).toISOString() : null,
      overnight_carbs_count: overnightCarbs.length,
      overnight_corrections: overnightDoses.length,
    },
  };
}