// Meal Narrative Reconciler — single source of truth for meal-window copy.
//
// Every meal-card summary string derives from this ONE function, never from
// the latest reading alone. This eliminates contradictory labels like
// "Steady through the window" next to a +49 mg/dL rise, or "Absorption
// nearly complete" next to "100% processed / 75 of 75 g absorbed".
//
// Pure local math — no LLM, no external data. Takes the full meal window
// (start, peak, max rise, curve shape, doses, elapsed) and returns ONE
// verdict object with four fields:
//   glucoseVerdict   — the insight line (window summary)
//   doseVerdict      — whether to show the dose-vs-math comparison
//   absorptionStatus — the absorption caption
//   reconciliation   — the estimation-miss copy (or null)
//
// Current reading/trend may only describe the PRESENT value (the header),
// never the window summary line. The reconciler uses the full window.

const MINUTE_MS = 60 * 1000;

function formatPeakTime(peakTime, mealTime) {
  if (!Number.isFinite(peakTime) || !Number.isFinite(mealTime)) return null;
  const minAfter = Math.round((peakTime - mealTime) / MINUTE_MS);
  if (minAfter < 60) return `+${minAfter}m`;
  const h = Math.floor(minAfter / 60);
  const m = minAfter % 60;
  return m ? `+${h}h ${m}m` : `+${h}h`;
}

/**
 * @param {Object} opts
 * @param {boolean}  opts.waitingForReadings  — no post-meal readings yet
 * @param {boolean}  opts.secondRise          — a second glucose climb was detected
 * @param {boolean}  opts.mealHasDelayedRise  — meal is high fat/protein
 * @param {string}   opts.phase               — meal phase from state machine
 * @param {boolean}  opts.validPeak           — a valid peak was detected
 * @param {number}   opts.startGlucose        — glucose at meal start (mg/dL)
 * @param {number}   opts.peakGlucose         — observed peak glucose (mg/dL)
 * @param {number}   opts.peakTime            — when the peak occurred (ms)
 * @param {number}   opts.mealTime            — when the meal was logged (ms)
 * @param {number}   opts.maxRise             — max rise across the window (mg/dL)
 * @param {boolean}  opts.isDualWave          — meal has a dual-wave absorption curve
 * @param {number}   opts.targetHigh          — upper target bound (mg/dL)
 * @param {boolean}  opts.hasInsulinDose      — a meal insulin dose was logged
 * @param {boolean}  opts.settingsConfirmed   — insulin plan is confirmed
 * @param {number}   opts.absorbedGrams       — grams absorbed so far
 * @param {number}   opts.totalCarbs          — total grams in the meal
 * @param {number}   opts.absorptionPct       — percent absorbed (0-100)
 * @param {number}   opts.estimatedPeakMin    — estimated carb peak (minutes)
 * @param {Object}   opts.glucoseAnalysis     — raw analysis object
 * @returns {Object} verdict
 */
export function reconcileMealNarrative(opts) {
  const {
    waitingForReadings = false,
    secondRise = false,
    mealHasDelayedRise = false,
    phase = "rising",
    validPeak = false,
    startGlucose,
    peakGlucose,
    peakTime,
    mealTime,
    maxRise = 0,
    isDualWave = false,
    targetHigh = 180,
    hasInsulinDose = false,
    settingsConfirmed = true,
    absorbedGrams = 0,
    totalCarbs = 0,
    absorptionPct = 0,
    estimatedPeakMin = null,
    glucoseAnalysis = {},
  } = opts;

  // ── Glucose verdict (the insight line) ────────────────────────────
  // "steady" requires max rise < 20 mg/dL across the window (not current
  // trend). Rise 20-50: "Gentle rise, nothing sharp." Rise > 50 or peak
  // beyond target: describe the excursion. If curve rose in multiple
  // waves, include "in two waves" wording instead of "steady".
  let glucoseVerdict;

  if (waitingForReadings) {
    glucoseVerdict = "Your glucose response isn't available yet — still watching.";
  } else if (secondRise) {
    glucoseVerdict = "A second gentle climb appeared after the first peak.";
  } else if (mealHasDelayedRise && phase === "rising") {
    glucoseVerdict = "High in fat and protein — glucose may climb later in the window.";
  } else if (mealHasDelayedRise && !validPeak) {
    glucoseVerdict = "Watching for a possible delayed wave.";
  } else {
    const rise = Math.round(maxRise);
    const peakBeyondTarget = Number.isFinite(peakGlucose) && peakGlucose > targetHigh;
    const multiWave = isDualWave || secondRise;

    if (rise > 50 || peakBeyondTarget) {
      const peakTimeStr = formatPeakTime(peakTime, mealTime);
      if (multiWave) {
        glucoseVerdict = `Rose in two waves from ${Math.round(startGlucose)} to ${Math.round(peakGlucose)} (+${rise}), peaking at ${peakTimeStr}.`;
      } else {
        glucoseVerdict = `Rose from ${Math.round(startGlucose)} to ${Math.round(peakGlucose)} (+${rise}), peaking at ${peakTimeStr}.`;
      }
    } else if (rise >= 20) {
      glucoseVerdict = multiWave
        ? "A gentle two-wave rise, nothing sharp."
        : "Gentle rise, nothing sharp.";
    } else {
      glucoseVerdict = multiWave
        ? "Steady in two waves through the window so far."
        : "Steady through the window so far.";
    }
  }

  // ── Dose-vs-math gate ─────────────────────────────────────────────
  // If no insulin dose is logged for the meal, do not run the comparison
  // at all. Render a neutral state. Never compute "Xu over/under" from a
  // null dose against default settings. Also respect the dose-math-paused
  // gate (settings not confirmed).
  let doseVerdict;
  if (!hasInsulinDose) {
    doseVerdict = { show: false, neutralLabel: "No insulin logged for this meal." };
  } else if (!settingsConfirmed) {
    doseVerdict = { show: false, neutralLabel: "Dose math paused — confirm your plan." };
  } else {
    doseVerdict = { show: true };
  }

  // ── Absorption status tier ───────────────────────────────────────
  // Terminal case: processed >= 99% AND absorbed == total carbs.
  // Keep "nearly complete" ONLY for 90-98%.
  let absorptionStatus;
  const absorbedRounded = Math.round(absorbedGrams);
  const totalRounded = Math.round(totalCarbs);
  if (absorptionPct >= 99 && absorbedRounded >= totalRounded) {
    absorptionStatus = "Absorption complete.";
  } else if (absorptionPct >= 90) {
    absorptionStatus = "Absorption nearly complete";
  } else if (absorptionPct >= 50) {
    absorptionStatus = `${absorbedRounded} g absorbed, ${Math.max(0, totalRounded - absorbedRounded)} g still in play`;
  } else {
    absorptionStatus = "Absorption underway";
  }

  // ── Estimation miss copy ──────────────────────────────────────────
  // When actual glucose peak is far later than the estimated carb peak,
  // use plain language about the delta. Include the fat/protein
  // explanation when the actual peak is later.
  let reconciliation = null;
  if (glucoseAnalysis?.validPeak && glucoseAnalysis?.timeToPeakMin != null && Number.isFinite(estimatedPeakMin)) {
    const timingDiff = glucoseAnalysis.timeToPeakMin - estimatedPeakMin;
    if (Math.abs(timingDiff) <= 40) {
      reconciliation = "Your glucose peaked in line with the estimation.";
    } else if (timingDiff < 0) {
      reconciliation = `Your glucose peaked about ${Math.round(Math.abs(timingDiff))} minutes earlier than our estimate.`;
    } else {
      reconciliation = `Your glucose peaked about ${Math.round(timingDiff)} minutes later than our estimate. Fatty, protein-heavy meals often digest slower than our model assumes.`;
    }
  }

  return {
    glucoseVerdict,
    doseVerdict,
    absorptionStatus,
    reconciliation,
  };
}