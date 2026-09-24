/**
 * Predicted postprandial glucose response model.
 *
 * Models the shape of glucose rise after a meal based on each carb entry's
 * absorption profile, glycemic index, and high-protein/fat flag — using
 * published research on macronutrient effects on postprandial glucose:
 *
 * - Simple/sugar (fast profile, high GI): sharp rise, peak ~30–60 min
 * - Complex/starchy (slow profile, low GI): gradual rise, peak ~60–120 min
 * - Fat/protein (is_high_protein_fat_meal): blunts the early rise ~35% and
 *   produces a delayed secondary rise centered ~3.5 h post-meal
 *
 * Also provides analysis of ACTUAL glucose readings within a meal window
 * (time to peak, delta from baseline, time in range, second-rise detection).
 *
 * This is an informational wellness model, not a clinical prediction.
 */

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
  if (entry.is_high_protein_fat_meal === true) return "high_fat_protein";
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

/**
 * Analyze actual glucose readings within a meal window.
 * Returns time-to-peak, delta from baseline, time-in-range %, elevated
 * duration, time back to range, and second-rise detection.
 */
export function analyzeGlucoseResponse(readings, mealTime, targetLow, targetHigh, now = Date.now()) {
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
    };
  }

  const baseline = windowReadings[0].value;

  let peak = windowReadings[0];
  for (const r of windowReadings) {
    if (r.value > peak.value) peak = r;
  }
  const timeToPeakMin = Math.round((peak.time - mealTime) / MINUTE_MS);
  const deltaFromBaseline = Math.round(peak.value - baseline);

  const totalDurationMin = (windowReadings[windowReadings.length - 1].time - mealTime) / MINUTE_MS;
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
  const elevatedDurationMin = Math.round(aboveRangeMin);
  const backInRangeMin = backInRangeTime
    ? Math.round((backInRangeTime - (firstAboveTime || mealTime)) / MINUTE_MS)
    : null;

  // Second-rise detection: after the first peak, did glucose fall then rise
  // again by >15 mg/dL? This catches delayed fat/protein-driven rises.
  let secondRise = false;
  const peakIdx = windowReadings.indexOf(peak);
  if (peakIdx < windowReadings.length - 2) {
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
  };
}