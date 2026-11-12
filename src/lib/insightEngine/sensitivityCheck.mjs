// ── Sensitivity contract ────────────────────────────────────────────────────
// Two directions the forecast model must always have. If either stops holding,
// the shape has stopped responding to its own inputs and no amount of
// calibration will save it — so this runs before every build
// (see the `prebuild` script in package.json) and in the test suite.
//
// Doubling insulin must steepen the fall. Doubling carbohydrate must raise the
// peak.

import { normalizeInputs, projectGlucose } from "./index.js";

const NOW = Date.parse("2026-11-12T18:00:00Z");
const MIN = 60 * 1000;

const readings = Array.from({ length: 13 }, (_, i) => ({
  recorded_at: new Date(NOW - (12 - i) * 5 * MIN).toISOString(),
  value: 140,
  source: "dexcom",
}));

// A realistic plan: 50 mg/dL per unit, one unit per 12.5 g of carbohydrate.
const SETTINGS = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 0.4,
  target_range_low: 70,
  target_range_high: 180,
  meal_outcome_window_minutes: 240,
};

function project({ carbs = 0, units = 0 }) {
  const meals = carbs > 0
    ? [{ id: "m", carbs, consumed_at: new Date(NOW - 20 * MIN).toISOString(), classification: "meal" }]
    : [];
  const doses = units > 0
    ? [{ id: "d", insulin_type: "NovoLog", units, administered_at: new Date(NOW - 20 * MIN).toISOString() }]
    : [];
  const snapshot = normalizeInputs(readings, meals, doses, SETTINGS, NOW);
  const result = projectGlucose(snapshot, { horizonMin: 120 });
  const at = (offset) => result.trajectory.find((p) => p.min_offset === offset)?.value;
  return { result, at, peak: Math.max(...result.trajectory.map((p) => p.value)) };
}

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

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const failures = checkSensitivity();
  if (failures.length) {
    console.error("Sensitivity contract broken:");
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exit(1);
  }
  console.log("Sensitivity contract holds.");
}