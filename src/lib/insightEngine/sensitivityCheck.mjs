// ── Build contracts ─────────────────────────────────────────────────────────
// Checks that must hold before every build (see `prebuild` in package.json) and
// in the test suite.
//
// 1. SENSITIVITY. Doubling insulin must steepen the fall; doubling carbohydrate
//    must raise the peak. If either stops holding, the shape has stopped
//    responding to its own inputs.
//
// 2. DRAWABLE. A clean afternoon — 200 fresh readings, no gaps, no meals, two
//    active doses, volatility 0.3 — must produce a drawn trajectory with at
//    least the 15 and 30 minute points and a band narrower than the cap. This is
//    the case that was abstaining on every run, so it is checked explicitly.
//
// 3. PRIOR. A shape model with no scored outcomes of its own must still get a
//    band, seeded from the account's earlier scored forecasts — otherwise
//    abstaining produces no residuals and the model can never recover.

import { normalizeInputs, projectGlucose } from "./index.js";
import { calibrateUncertainty } from "./uncertaintyCalibration.js";

const NOW = Date.parse("2026-11-12T18:00:00Z");
const MIN = 60 * 1000;

// A realistic plan: 50 mg/dL per unit, one unit per 12.5 g of carbohydrate.
const SETTINGS = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 0.4,
  target_range_low: 70,
  target_range_high: 180,
  meal_outcome_window_minutes: 240,
};

const flat = (value = 140, count = 13) =>
  Array.from({ length: count }, (_, i) => ({
    recorded_at: new Date(NOW - (count - 1 - i) * 5 * MIN).toISOString(),
    value,
    source: "dexcom",
  }));

function project({ carbs = 0, units = 0, readings = flat(), doses = null, options = {} }) {
  const meals = carbs > 0
    ? [{ id: "m", carbs, consumed_at: new Date(NOW - 20 * MIN).toISOString(), classification: "meal" }]
    : [];
  const doseRows = doses !== null
    ? doses
    : (units > 0
      ? [{ id: "d", insulin_type: "NovoLog", units, administered_at: new Date(NOW - 20 * MIN).toISOString() }]
      : []);
  const snapshot = normalizeInputs(readings, meals, doseRows, SETTINGS, NOW);
  const result = projectGlucose(snapshot, { horizonMin: 120, ...options });
  const at = (offset) => result.trajectory.find((p) => p.min_offset === offset)?.value;
  const maxHalfWidth = result.trajectory.reduce(
    (widest, p) => Math.max(widest, (p.upper - p.lower) / 2), 0
  );
  return { result, snapshot, at, maxHalfWidth, peak: Math.max(...result.trajectory.map((p) => p.value)) };
}

// ── 1. Sensitivity ─────────────────────────────────────────────────────────
export function checkSensitivity() {
  const failures = [];

  const singleDose = project({ units: 1 });
  const doubledDose = project({ units: 2 });
  const singleFall = singleDose.at(60) - singleDose.at(120);
  const doubledFall = doubledDose.at(60) - doubledDose.at(120);
  if (!(singleFall > 0)) {
    failures.push(`insulin 1u should fall between 60 and 120 min (got ${singleFall})`);
  }
  if (!(doubledFall > singleFall)) {
    failures.push(`doubling insulin should steepen the fall (1u fell ${singleFall}, 2u fell ${doubledFall})`);
  }
  if (!(doubledDose.at(120) < singleDose.at(120))) {
    failures.push("doubling insulin should end lower at 120 min");
  }

  const singleMeal = project({ carbs: 20 });
  const doubledMeal = project({ carbs: 40 });
  if (!(doubledMeal.peak > singleMeal.peak)) {
    failures.push(`doubling carbs should raise the peak (20g peaked ${singleMeal.peak}, 40g peaked ${doubledMeal.peak})`);
  }
  if (!(doubledMeal.at(60) > singleMeal.at(60))) {
    failures.push("doubling carbs should be higher at 60 min");
  }

  return failures;
}

// ── 2. Drawable in the clean case ──────────────────────────────────────────
// 200 readings, 5-minute cadence, no gaps, ±0.75 jitter (0.3 mg/dL/min
// reading-to-reading volatility), no meals, two active doses.
const CLEAN_READINGS = Array.from({ length: 200 }, (_, i) => ({
  recorded_at: new Date(NOW - (199 - i) * 5 * MIN).toISOString(),
  value: 165 + (i % 2 === 0 ? 0.75 : -0.75),
  source: "dexcom",
}));

const CLEAN_DOSES = [
  { id: "d1", insulin_type: "NovoLog", units: 4, administered_at: new Date(NOW - 30 * MIN).toISOString() },
  { id: "d2", insulin_type: "NovoLog", units: 2, administered_at: new Date(NOW - 10 * MIN).toISOString() },
];

export const MAX_DRAWN_HALF_WIDTH = 95;

export function checkDrawable() {
  const failures = [];
  const run = project({ readings: CLEAN_READINGS, doses: CLEAN_DOSES });
  const dq = run.result.dataQuality;

  if (run.result.abstained) {
    failures.push(`the clean afternoon must not abstain (it abstained: ${run.result.abstainReason})`);
  }
  const offsets = run.result.trajectory.map((p) => p.min_offset);
  if (!offsets.includes(15)) failures.push("the clean afternoon must include the 15-minute point");
  if (!offsets.includes(30)) failures.push("the clean afternoon must include the 30-minute point");
  if (!(run.maxHalfWidth < MAX_DRAWN_HALF_WIDTH)) {
    failures.push(`band must be narrower than the ${MAX_DRAWN_HALF_WIDTH} mg/dL cap (got ${run.maxHalfWidth})`);
  }
  if (dq?.staleReadings) failures.push("the clean afternoon must not be marked stale");
  if (dq?.gapPresent) failures.push("the clean afternoon must not be marked as having a gap");
  if (Number(dq?.activeDoseCount) !== 2) failures.push(`expected 2 active doses, got ${dq?.activeDoseCount}`);
  if (!(Number(dq?.volatilitySd) <= 0.5)) failures.push(`expected a quiet sensor, got volatility ${dq?.volatilitySd}`);

  return failures;
}

// ── 3. A prior band for a model with no residuals of its own ───────────────
function syntheticEvaluated(count, modelVersion) {
  return Array.from({ length: count }, (_, i) => ({
    model_version: modelVersion,
    evaluation: {
      status: "evaluated",
      mae: 20,
      coverage: 0.8,
      horizons: [
        { horizon_min: 15, scored: true, abs_error: 12, error: i % 2 === 0 ? 12 : -12, in_interval: true },
        { horizon_min: 30, scored: true, abs_error: 24, error: i % 2 === 0 ? 24 : -24, in_interval: true },
        { horizon_min: 60, scored: true, abs_error: 39, error: i % 2 === 0 ? 39 : -39, in_interval: false },
      ],
    },
  }));
}

export function checkPriorBand() {
  const failures = [];

  // 40 scored forecasts, all from the previous shape model.
  const prior = calibrateUncertainty(syntheticEvaluated(40, "1.0.0-baseline"), {
    currentModelVersion: "2.0.0-superposition",
    volatilitySd: 0.3,
  });

  if (prior.bandSource !== "prior") failures.push(`expected a prior band, got "${prior.bandSource}"`);
  if (!prior.calibrated) failures.push("a prior band must count as calibrated");
  if (!(prior.residualCount > 0)) failures.push("the prior band must record how many residuals fed it");
  if (!(Object.keys(prior.sigmaByHorizon).length > 0)) failures.push("the prior band must have a width");

  // And the clean afternoon draws with it, with the source recorded.
  const run = project({
    readings: CLEAN_READINGS,
    doses: CLEAN_DOSES,
    options: { uncertaintyCalibration: prior },
  });
  if (run.result.abstained) failures.push("the clean afternoon must still draw with a prior band");
  if (!run.result.trajectory.some((p) => p.min_offset === 30)) {
    failures.push("the clean afternoon must reach 30 minutes with a prior band");
  }
  if (run.result.uncertainty?.bandSource !== "prior") {
    failures.push(`the projection must record its band source (got "${run.result.uncertainty?.bandSource}")`);
  }

  return failures;
}

export function checkAll() {
  return [...checkSensitivity(), ...checkDrawable(), ...checkPriorBand()];
}