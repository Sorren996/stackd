import { format } from "date-fns";
import { formatDuration } from "@/lib/dayRecapMetrics";
import {
  getInsulinProfile,
  getDoseTimingInfo,
  getInsulinCategory,
  isBolusInsulinType,
  isBasalInsulinType,
} from "@/lib/insulinPharmacology";
import { aggregateStats } from "@/lib/historyAggregations";

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

function normalizeReadings(glucose) {
  return (glucose || [])
    .map((g) => ({ time: new Date(g.recorded_at).getTime(), value: Number(g.value) }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
    .sort((a, b) => a.time - b.time);
}

/**
 * Meal outcomes — for each carb entry, find glucose before/after and the
 *Associated insulin. Only includes meals where sufficient glucose data exists.
 */
export function computeMealOutcomes(carbs, insulin, glucose) {
  if (!carbs?.length || !glucose?.length) return [];

  const readings = normalizeReadings(glucose);
  if (readings.length < 2) return [];

  return (carbs || [])
    .map((carb) => {
      const mealTime = new Date(carb.consumed_at).getTime();
      if (!Number.isFinite(mealTime)) return null;

      // Glucose at meal time — closest reading within 20 min before to 5 min after
      const startingReading = findReadingInWindow(readings, mealTime - 20 * MIN_MS, mealTime + 5 * MIN_MS);
      if (!startingReading) return null;

      // Peak glucose in the 3h window after the meal
      const windowEnd = mealTime + 3 * HOUR_MS;
      const windowReadings = readings.filter((r) => r.time >= mealTime && r.time <= windowEnd);
      if (windowReadings.length < 2) return null;

      let peak = windowReadings[0];
      for (const r of windowReadings) {
        if (r.value > peak.value) peak = r;
      }

      // Glucose at ~1h and ~2h
      const at1h = findReadingInWindow(readings, mealTime + 50 * MIN_MS, mealTime + 75 * MIN_MS);
      const at2h = findReadingInWindow(readings, mealTime + 110 * MIN_MS, mealTime + 135 * MIN_MS);

      // Associated insulin doses within ±30 min of meal
      const associatedInsulin = (insulin || []).filter((d) => {
        const dt = new Date(d.administered_at).getTime();
        return Number.isFinite(dt) && Math.abs(dt - mealTime) <= 30 * MIN_MS;
      });

      const insulinUnits = associatedInsulin.reduce((s, d) => s + (Number(d.units) || 0), 0);

      return {
        id: carb.id,
        name: carb.food_name || carb.name || "Meal",
        time: mealTime,
        carbs: Number(carb.carbs) || 0,
        insulinUnits: insulinUnits > 0 ? insulinUnits : null,
        insulinTypes: associatedInsulin.map((d) => d.insulin_type),
        startingGlucose: startingReading.value,
        peakGlucose: peak.value,
        peakTime: peak.time,
        glucoseAt1h: at1h?.value ?? null,
        glucoseAt2h: at2h?.value ?? null,
        rise: peak.value - startingReading.value,
        highProteinFat: carb.is_high_protein_fat_meal === true,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);
}

/**
 * Insulin activity across the day — total/bolus/basal, highest activity period,
 * overlapping doses. Uses getDoseTimingInfo (fast, no curve generation).
 */
export function computeInsulinActivity(insulin, dayStartMs, dayEndMs) {
  if (!insulin?.length) return null;

  const doses = (insulin || [])
    .map((d) => ({
      ...d,
      time: new Date(d.administered_at).getTime(),
      units: Number(d.units) || 0,
    }))
    .filter((d) => Number.isFinite(d.time) && d.units > 0)
    .sort((a, b) => a.time - b.time);

  if (!doses.length) return null;

  const totalUnits = doses.reduce((s, d) => s + d.units, 0);
  const bolusUnits = doses.filter((d) => isBolusInsulinType(d.insulin_type)).reduce((s, d) => s + d.units, 0);
  const basalUnits = doses.filter((d) => isBasalInsulinType(d.insulin_type)).reduce((s, d) => s + d.units, 0);

  // Find the time when the most bolus doses are simultaneously active
  const step = 15 * MIN_MS;
  const bolusDoses = doses.filter((d) => isBolusInsulinType(d.insulin_type));

  let peakCount = 0;
  let peakTime = null;

  if (bolusDoses.length > 0) {
    for (let t = dayStartMs; t <= dayEndMs; t += step) {
      let activeCount = 0;
      for (const dose of bolusDoses) {
        if (t < dose.time) continue;
        const timing = getDoseTimingInfo(dose, t);
        if (!timing.isExpired) activeCount++;
      }
      if (activeCount > peakCount) {
        peakCount = activeCount;
        peakTime = t;
      }
    }
  }

  // High-activity window (where at least 1 bolus dose is active)
  let highActivityStart = null;
  let highActivityEnd = null;
  if (bolusDoses.length > 0) {
    for (let t = dayStartMs; t <= dayEndMs; t += step) {
      let activeCount = 0;
      for (const dose of bolusDoses) {
        if (t < dose.time) continue;
        const timing = getDoseTimingInfo(dose, t);
        if (!timing.isExpired) activeCount++;
      }
      if (activeCount >= 1) {
        if (highActivityStart === null) highActivityStart = t;
        highActivityEnd = t;
      }
    }
  }

  // Detect overlapping bolus doses (within 90 min)
  const overlaps = [];
  for (let i = 0; i < bolusDoses.length; i++) {
    for (let j = i + 1; j < bolusDoses.length; j++) {
      const gap = Math.abs(bolusDoses[i].time - bolusDoses[j].time);
      if (gap <= 90 * MIN_MS) {
        overlaps.push({ gapMin: Math.round(gap / MIN_MS) });
      }
    }
  }

  return {
    doses,
    totalUnits,
    bolusUnits,
    basalUnits,
    dayStart: dayStartMs,
    dayEnd: dayEndMs,
    peakTime,
    peakCount,
    highActivityStart,
    highActivityEnd,
    overlapCount: overlaps.length,
  };
}

/**
 * Recovery analysis — finds the day's largest glucose excursion and checks
 * whether glucose returned toward baseline.
 */
export function computeRecovery(glucose) {
  const readings = normalizeReadings(glucose);
  if (readings.length < 4) return null;

  let bestExcursion = null;

  for (let i = 0; i < readings.length; i++) {
    let peakIdx = i;
    let peak = readings[i];
    for (let j = i + 1; j < readings.length; j++) {
      if (readings[j].time - readings[i].time > 4 * HOUR_MS) break;
      if (readings[j].value > peak.value) {
        peak = readings[j];
        peakIdx = j;
      }
    }

    const rise = peak.value - readings[i].value;
    if (rise < 50) continue;

    if (!bestExcursion || rise > bestExcursion.rise) {
      let recoveryReading = null;
      for (let k = peakIdx + 1; k < readings.length; k++) {
        if (readings[k].value <= readings[i].value + 20) {
          recoveryReading = readings[k];
          break;
        }
      }

      bestExcursion = {
        startTime: readings[i].time,
        startValue: readings[i].value,
        peakTime: peak.time,
        peakValue: peak.value,
        rise,
        recoveryTime: recoveryReading?.time ?? null,
        recoveryValue: recoveryReading?.value ?? null,
        recoveryMinutes: recoveryReading
          ? Math.round((recoveryReading.time - peak.time) / MIN_MS)
          : null,
      };
    }
  }

  if (!bestExcursion || bestExcursion.rise < 50) return null;
  return bestExcursion;
}

/**
 * Comparison — selected day vs the user's recent 14-day average.
 */
export function computeComparison(daySummary, allDays, selectedDate) {
  if (!allDays?.length || !daySummary || !selectedDate) return null;

  const cutoff = new Date(selectedDate + "T00:00:00").getTime();

  const recentDays = (allDays || [])
    .filter((d) => {
      const dTime = new Date(d.date + "T00:00:00").getTime();
      return dTime < cutoff && dTime >= cutoff - 14 * 24 * HOUR_MS && (d.glucose?.count || 0) > 0;
    });

  if (recentDays.length < 5) return null;

  const stats = aggregateStats(recentDays);

  const todayTir =
    daySummary?.glucose?.count && daySummary.glucose.count > 0
      ? Math.round((daySummary.glucose.inRange / daySummary.glucose.count) * 100)
      : null;
  const todayAvg =
    daySummary?.glucose?.count && daySummary.glucose.count > 0
      ? Math.round(daySummary.glucose.sum / daySummary.glucose.count)
      : null;

  const result = {
    daysCompared: recentDays.length,
    todayTir,
    avgTir: stats.inRangePct,
    todayAvg,
    avgAvg: stats.glucoseAvg,
  };

  if (todayTir != null && stats.inRangePct != null) {
    const diff = todayTir - stats.inRangePct;
    if (diff > 3) result.tirInterpretation = "More time in your comfort zone than your recent average.";
    else if (diff < -3) result.tirInterpretation = "Less time in your comfort zone than your recent average.";
    else result.tirInterpretation = "Similar to your recent average.";
  }

  if (todayAvg != null && stats.glucoseAvg != null) {
    const diff = todayAvg - stats.glucoseAvg;
    if (diff > 8) result.avgInterpretation = "Slightly higher average than usual.";
    else if (diff < -8) result.avgInterpretation = "Slightly lower average than usual.";
    else result.avgInterpretation = "Close to your usual average.";
  }

  return result;
}

/**
 * Build a concise chronological timeline of the day's key events.
 */
export function buildDayTimeline(glucose, carbs, insulin, metrics, recovery, targetLow, targetHigh) {
  if (!metrics?.hasData && !(carbs?.length) && !(insulin?.length)) return [];

  const events = [];
  const readings = normalizeReadings(glucose);

  // Meals
  (carbs || []).forEach((c) => {
    const time = new Date(c.consumed_at).getTime();
    if (!Number.isFinite(time)) return;
    const associatedInsulin = (insulin || []).filter((d) => {
      const dt = new Date(d.administered_at).getTime();
      return Number.isFinite(dt) && Math.abs(dt - time) <= 30 * MIN_MS;
    });
    const insulinUnits = associatedInsulin.reduce((s, d) => s + (Number(d.units) || 0), 0);
    events.push({
      type: "meal",
      time,
      label: c.food_name || c.name || "Meal",
      detail: `${Math.round(Number(c.carbs) || 0)}g carbs${insulinUnits > 0 ? ` · ${insulinUnits}u support` : ""}`,
    });
  });

  // Insulin doses not associated with meals
  (insulin || []).forEach((d) => {
    const time = new Date(d.administered_at).getTime();
    if (!Number.isFinite(time)) return;
    const associatedMeal = (carbs || []).find((c) => {
      const ct = new Date(c.consumed_at).getTime();
      return Number.isFinite(ct) && Math.abs(ct - time) <= 30 * MIN_MS;
    });
    if (associatedMeal) return;
    events.push({
      type: "insulin",
      time,
      label: d.insulin_type || "Support",
      detail: `${Number(d.units) || 0}u`,
    });
  });

  // Glucose peak
  if (metrics.peakTime) {
    events.push({
      type: "peak",
      time: metrics.peakTime,
      label: "Glucose peak",
      detail: `${Math.round(metrics.max)} mg/dL`,
    });
  }

  // Glucose low
  if (metrics.lowTime) {
    events.push({
      type: "low",
      time: metrics.lowTime,
      label: "Glucose low",
      detail: `${Math.round(metrics.min)} mg/dL`,
    });
  }

  // Significant rise
  if (metrics.steepestRise >= 40 && metrics.steepestRiseTime) {
    events.push({
      type: "rise",
      time: metrics.steepestRiseTime,
      label: "Glucose rising",
      detail: `+${metrics.steepestRise} mg/dL`,
    });
  }

  // Significant fall
  if (readings.length >= 2) {
    let steepestFall = 0;
    let steepestFallTime = null;
    for (let i = 1; i < readings.length; i++) {
      const fall = readings[i - 1].value - readings[i].value;
      if (fall > steepestFall) {
        steepestFall = fall;
        steepestFallTime = readings[i].time;
      }
    }
    if (steepestFall >= 40) {
      events.push({
        type: "fall",
        time: steepestFallTime,
        label: "Glucose easing",
        detail: `−${steepestFall} mg/dL`,
      });
    }
  }

  // Recovery point
  if (recovery && recovery.recoveryTime) {
    events.push({
      type: "recovery",
      time: recovery.recoveryTime,
      label: "Recovery",
      detail: `${Math.round(recovery.recoveryValue)} mg/dL`,
    });
  }

  // Sort by time, remove near-duplicates (within 5 min), limit to 12
  events.sort((a, b) => a.time - b.time);
  const deduped = [];
  for (const e of events) {
    if (deduped.length > 0 && Math.abs(e.time - deduped[deduped.length - 1].time) < 5 * MIN_MS) {
      // Skip near-duplicate unless it's a different important type
      continue;
    }
    deduped.push(e);
  }

  return deduped.slice(0, 12);
}

/**
 * Enhanced insights — 1-3 meaningful, non-generic observations about the day.
 */
export function computeEnhancedInsights(metrics, carbs, insulin, glucose, targetLow, targetHigh) {
  if (!metrics?.hasData || metrics.count < 3) return [];

  const insights = [];
  const readings = normalizeReadings(glucose);

  // Morning vs evening variability
  const morningReadings = readings.filter((r) => new Date(r.time).getHours() < 12);
  const eveningReadings = readings.filter((r) => new Date(r.time).getHours() >= 12);

  if (morningReadings.length >= 3 && eveningReadings.length >= 3) {
    const morningTir = morningReadings.filter((r) => r.value >= targetLow && r.value <= targetHigh).length / morningReadings.length;
    const eveningTir = eveningReadings.filter((r) => r.value >= targetLow && r.value <= targetHigh).length / eveningReadings.length;

    if (Math.abs(morningTir - eveningTir) > 0.2) {
      if (morningTir > eveningTir) {
        insights.push("Mostly steady morning → more variable evening.");
      } else {
        insights.push("More variable morning → steadier evening.");
      }
    }
  }

  // Largest excursion
  if (metrics.steepestRise >= 40 && metrics.steepestRiseTime) {
    const precedingCarb = (carbs || []).find((c) => {
      const ct = new Date(c.consumed_at).getTime();
      return Number.isFinite(ct) && ct <= metrics.steepestRiseTime && metrics.steepestRiseTime - ct <= 90 * MIN_MS;
    });
    if (precedingCarb) {
      const name = precedingCarb.food_name || precedingCarb.name || "a meal";
      insights.push(`Your largest glucose excursion (+${metrics.steepestRise} mg/dL) occurred after ${name}.`);
    } else {
      insights.push(`Your largest glucose excursion was +${metrics.steepestRise} mg/dL.`);
    }
  }

  // Longest steady stretch
  if (metrics.longestStableMs >= 60 * MIN_MS) {
    insights.push(`Your longest steady stretch was ${formatDuration(metrics.longestStableMs)}.`);
  }

  // Time in range
  if (metrics.tir >= 80) {
    insights.push("Glucose remained within your comfort zone for most of the day.");
  }

  return insights.slice(0, 3);
}

// Helper: find the reading closest to targetTime within a [windowStart, windowEnd] range.
function findReadingInWindow(readings, windowStart, windowEnd) {
  if (!readings?.length) return null;
  let nearest = null;
  let bestDist = Infinity;
  for (const r of readings) {
    if (r.time < windowStart || r.time > windowEnd) continue;
    const dist = Math.abs(r.time - (windowStart + windowEnd) / 2);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = r;
    }
  }
  return nearest;
}

export { findReadingInWindow };