/**
 * Predicted postprandial glucose response model.
 *
 * Models the shape of glucose rise after a meal based on each carb entry's
 * absorption profile, glycemic index, and delayed-rise detection — using
 * published research on macronutrient effects on postprandial glucose:
 *
 * - Simple/sugar (fast profile, high GI): sharp rise, peak ~30–60 min
 * - Complex/starchy (slow profile, low GI): gradual rise, peak ~60–120 min
 * - Fat/protein (delayed rise): blunts the early rise ~35% and
 *   produces a delayed secondary rise centered ~3.5 h post-meal
 *
 * Also provides analysis of ACTUAL glucose readings within a meal window
 * (time to peak, delta from baseline, time in range, second-rise detection).
 *
 * This is an informational wellness model, not a clinical prediction.
 */

import { hasDelayedRise } from "@/lib/mealMonitoring";

const MINUTE_MS = 60 * 1000;

// Gamma-like skewed bell: smooth rise → peak → long tail.
function gammaShape(t, peakMin, amplitude, shapeExp) {
  if (t <= 0 || peakMin <= 0) return 0;
  const ratio = t / peakMin;
  if (ratio > 6) return 0;
  return amplitude * Math.pow(ratio, shapeExp) * Math.exp(shapeExp * (1 - ratio));
}

const CHARACTER_PARAMS = {
  simple: { peakMin: 45, shapeExp: 2.2, mgPerGram: 2.8 },
  moderate: { peakMin: 75, shapeExp: 2.5, mgPerGram: 2.5 },
  complex: { peakMin: 110, shapeExp: 2.8, mgPerGram: 2.2 },
  high_fat_protein: {
    peakMin: 90,
    shapeExp: 2.6,
    mgPerGram: 2.0,
    bluntFactor: 0.65,
    secPeakMin: 210,
    secShapeExp: 3.0,
    secMgPerGram: 1.2,
  },
};

function getEntryCharacter(entry) {
  const profile = entry.absorption_profile || "medium";
  const gi = Number(entry.glycemic_index) || 0;
  if (hasDelayedRise(entry)) return "high_fat_protein";
  if (profile === "fast" || gi >= 70) return "simple";
  if (profile === "slow" || (gi > 0 && gi < 50)) return "complex";
  return "moderate";
}

/**
 * Generate the predicted glucose response curve for a meal's carb entries.
 * Returns { points, peakTime, peakValue, hasDelayedRise }.
 */
export function generateMealGlucoseResponse(carbEntries, mealTime, now = Date.now()) {
  const entries = (Array.isArray(carbEntries) ? carbEntries : []).filter(
    (e) => e && Number.isFinite(e.carbs) && e.consumed_at
  );
  if (!entries.length || !Number.isFinite(mealTime)) {
    return { points: [], peakTime: null, peakValue: 0, hasDelayedRise: false };
  }

  const start = mealTime;
  const horizonMin = 360; // 6 hours
  const stepMin = 5;

  const components = entries.map((entry) => {
    const character = getEntryCharacter(entry);
    const params = CHARACTER_PARAMS[character];
    const entryStart = new Date(entry.consumed_at).getTime();
    const carbs = Number(entry.carbs);
    const primaryAmplitude = carbs * params.mgPerGram * (params.bluntFactor || 1);
    const secondaryAmplitude = params.secPeakMin ? carbs * params.secMgPerGram : 0;
    return { entryStart, params, primaryAmplitude, secondaryAmplitude, character };
  });

  const hasDelayedRise = components.some((c) => c.character === "high_fat_protein");
  const points = [];

  for (let minOffset = 0; minOffset <= horizonMin; minOffset += stepMin) {
    const t = start + minOffset * MINUTE_MS;
    let totalResponse = 0;

    for (const comp of components) {
      const elapsedMin = (t - comp.entryStart) / MINUTE_MS;
      if (elapsedMin < 0) continue;

      totalResponse += gammaShape(elapsedMin, comp.params.peakMin, comp.primaryAmplitude, comp.params.shapeExp);

      if (comp.secondaryAmplitude > 0 && elapsedMin > comp.params.peakMin * 0.5) {
        const secElapsed = elapsedMin - comp.params.peakMin * 0.5;
        const secPeak = comp.params.secPeakMin - comp.params.peakMin * 0.5;
        totalResponse += gammaShape(secElapsed, secPeak, comp.secondaryAmplitude, comp.params.secShapeExp);
      }
    }

    points.push({ time: t, minOffset, response: Math.max(0, totalResponse) });
  }

  let peakValue = 0;
  let peakTime = null;
  for (const p of points) {
    if (p.response > peakValue) { peakValue = p.response; peakTime = p.time; }
  }

  return { points, peakTime, peakValue, hasDelayedRise };
}

// ── Meal-state machine (Issue 4) ──────────────────────────────────────────
// A peak is only declared when glucose has risen by a meaningful margin AND
// then fallen by a meaningful margin, with enough readings to trust the
// shape. This prevents false "peaked" declarations from 1-2 readings where
// the max is just the first or second reading with no subsequent decline.
//
// States: not_started → rising → plateau → peaked_and_declining → clearing
//
// THRESHOLDS: These are engineering defaults, not clinically validated
// boundaries. They describe what counts as a meaningful rise/fall for the
// purpose of narrative copy — never a clinical determination.
const PEAK_RISE_THRESHOLD_MGDL = 10;  // must rise >= 10 mg/dL above baseline
const PEAK_FALL_THRESHOLD_MGDL = 5;   // must then fall >= 5 mg/dL from the max
const MIN_READINGS_FOR_PEAK = 3;      // need 3+ readings spanning rise and fall

export function analyzeMealPhase(readings, mealTime, baseline, now = Date.now()) {
  const windowReadings = (Array.isArray(readings) ? readings : [])
    .map((r) => ({ time: new Date(r.recorded_at).getTime(), value: Number(r.value) }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value) && r.time >= mealTime && r.time <= now)
    .sort((a, b) => a.time - b.time);

  if (windowReadings.length === 0) return { phase: "not_started", validPeak: false, peak: null, peakIdx: -1 };

  const base = Number.isFinite(baseline) ? baseline : windowReadings[0].value;

  // Find the max reading.
  let peakIdx = 0;
  let peak = windowReadings[0];
  for (let i = 0; i < windowReadings.length; i++) {
    if (windowReadings[i].value > peak.value) { peak = windowReadings[i]; peakIdx = i; }
  }

  const peakRise = peak.value - base;

  // Check for a meaningful decline after the peak.
  let declineAfterPeak = 0;
  if (peakIdx < windowReadings.length - 1) {
    for (let i = peakIdx + 1; i < windowReadings.length; i++) {
      const decline = peak.value - windowReadings[i].value;
      if (decline > declineAfterPeak) declineAfterPeak = decline;
    }
  }

  // A valid peak requires: meaningful rise, meaningful fall, and enough
  // readings to trust the shape (readings spanning both rise and fall).
  const hasRise = peakRise >= PEAK_RISE_THRESHOLD_MGDL;
  const hasFall = declineAfterPeak >= PEAK_FALL_THRESHOLD_MGDL;
  const hasEnoughReadings = windowReadings.length >= MIN_READINGS_FOR_PEAK;
  const hasReadingsAfterPeak = peakIdx < windowReadings.length - 1;
  const validPeak = hasRise && hasFall && hasEnoughReadings && hasReadingsAfterPeak;

  // Determine the phase.
  let phase;
  if (windowReadings.length < 2) {
    phase = "not_started";
  } else if (validPeak) {
    // Check if glucose has returned close to baseline (clearing) or is still
    // declining (peaked_and_declining).
    const lastValue = windowReadings[windowReadings.length - 1].value;
    const backToBase = Math.abs(lastValue - base) < PEAK_FALL_THRESHOLD_MGDL;
    phase = backToBase ? "clearing" : "peaked_and_declining";
  } else if (hasRise && !hasFall) {
    // Rising or plateauing but not yet declined.
    phase = peakRise > PEAK_RISE_THRESHOLD_MGDL * 1.5 ? "plateau" : "rising";
  } else {
    phase = "rising";
  }

  return { phase, validPeak, peak, peakIdx, peakRise, declineAfterPeak };
}

/**
 * Analyze actual glucose readings within a meal window.
 * Returns time-to-peak, delta from baseline, time-in-range %, elevated
 * duration, time back to range, second-rise detection, and the meal phase
 * from the state machine (Issue 4).
 */
export function analyzeGlucoseResponse(readings, mealTime, targetLow, targetHigh, now = Date.now(), baselineGlucose = null) {
  const windowReadings = (Array.isArray(readings) ? readings : [])
    .map((r) => ({ time: new Date(r.recorded_at).getTime(), value: Number(r.value) }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value) && r.time >= mealTime && r.time <= now)
    .sort((a, b) => a.time - b.time);

  if (windowReadings.length < 2) {
    return {
      timeToPeakMin: null,
      deltaFromBaseline: null,
      timeInRangePct: null,
      elevatedDurationMin: null,
      backInRangeMin: null,
      secondRise: false,
      phase: "not_started",
      validPeak: false,
    };
  }

  // Use the shared before-meal baseline when provided so the "Rise from
  // pre-meal" stat always matches the RISE stat in the card header.
  const baseline = Number.isFinite(baselineGlucose) ? baselineGlucose : windowReadings[0].value;

  // ── Meal-state machine (Issue 4) ──
  // A valid peak requires a meaningful rise AND fall with enough readings.
  // Only report timeToPeakMin / deltaFromBaseline when the peak is valid.
  const { phase, validPeak, peak, peakIdx } = analyzeMealPhase(readings, mealTime, baseline, now);

  const timeToPeakMin = validPeak ? Math.round((peak.time - mealTime) / MINUTE_MS) : null;
  const deltaFromBaseline = validPeak ? Math.round(peak.value - baseline) : null;

  // ── TIR (Issue 6 fix) ──
  // Both numerator and denominator now cover the SAME span: from the first
  // reading to the last reading (no gap between mealTime and first reading
  // in the denominator). This ensures 100% in-range returns exactly 100%.
  const coverageStart = windowReadings[0].time;
  const coverageEnd = windowReadings[windowReadings.length - 1].time;
  const totalDurationMin = (coverageEnd - coverageStart) / MINUTE_MS;
  let inRangeMin = 0;
  let aboveRangeMin = 0;
  let firstAboveTime = null;
  let backInRangeTime = null;

  for (let i = 1; i < windowReadings.length; i++) {
    const segMin = (windowReadings[i].time - windowReadings[i - 1].time) / MINUTE_MS;
    const avgVal = (windowReadings[i].value + windowReadings[i - 1].value) / 2;
    if (avgVal >= targetLow && avgVal <= targetHigh) {
      inRangeMin += segMin;
      if (firstAboveTime && !backInRangeTime) {
        backInRangeTime = windowReadings[i].time;
      }
    } else if (avgVal > targetHigh) {
      aboveRangeMin += segMin;
      if (!firstAboveTime) firstAboveTime = windowReadings[i - 1].time;
    }
  }

  const timeInRangePct = totalDurationMin > 0 ? Math.round((inRangeMin / totalDurationMin) * 100) : null;
  // If the last reading is still above range, extend the elevated duration to
  // `now` so the "Still elevated" timer counts up in real time instead of
  // freezing at the last reading-to-reading gap.
  const lastReading = windowReadings[windowReadings.length - 1];
  const lastIsAbove = lastReading && lastReading.value > targetHigh;
  const elevatedDurationMin = lastIsAbove && firstAboveTime
    ? Math.round((now - firstAboveTime) / MINUTE_MS)
    : Math.round(aboveRangeMin);
  const backInRangeMin = backInRangeTime
    ? Math.round((backInRangeTime - (firstAboveTime || mealTime)) / MINUTE_MS)
    : null;

  // Second-rise detection: after the first peak, did glucose fall then rise
  // again by >15 mg/dL? This catches delayed fat/protein-driven rises.
  // Only check for second rise when a valid peak exists.
  let secondRise = false;
  if (validPeak && peakIdx < windowReadings.length - 2) {
    let trough = peak;
    for (let i = peakIdx + 1; i < windowReadings.length; i++) {
      if (windowReadings[i].value < trough.value) trough = windowReadings[i];
    }
    const troughIdx = windowReadings.indexOf(trough);
    for (let i = troughIdx + 1; i < windowReadings.length; i++) {
      if (windowReadings[i].value - trough.value > 15) {
        secondRise = true;
        break;
      }
    }
  }

  return {
    timeToPeakMin,
    deltaFromBaseline,
    timeInRangePct,
    elevatedDurationMin,
    backInRangeMin,
    secondRise,
    phase,
    validPeak,
  };
}