// The forecast has to behave like the arithmetic it claims to do.
//
// Three properties are checked here, because they are the ones a reader would
// notice if they were wrong:
//   1. More insulin on board than carbohydrate → the line ends lower and falls
//      faster than the same day with half the insulin.
//   2. More carbohydrate → a correspondingly larger rise. The term is linear in
//      grams, so the rise above the starting reading should scale with them.
//   3. A rescue carbohydrate is fast and finite: it lifts glucose briefly, then
//      insulin underneath it takes over and the line goes below where it
//      started. A rescue that never ends would pass a "rises" test but fail a
//      reader looking at two hours.

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeInputs, projectGlucose } from "../insightEngine.ts";

const MINUTE_MS = 60 * 1000;
const now = Date.parse("2026-11-12T12:00:00.000Z");
const at = (minutesAgo) => new Date(now - minutesAgo * MINUTE_MS).toISOString();

// ISF 50, 1 unit per 10 g → 5 mg/dL per gram of carbohydrate.
const settings = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 0.5,
  target_range_low: 70,
  target_range_high: 180,
  meal_outcome_window_minutes: 210,
};

const flatReadings = (value, count = 6) =>
  Array.from({ length: count }, (_, i) => ({
    value,
    recorded_at: at(5 + i * 5),
    source: "dexcom",
  }));

const meal = (carbs, minutesAgo) => ({
  carbs,
  consumed_at: at(minutesAgo),
  food_name: "Toast",
});

const rescue = (carbs, minutesAgo) => ({
  carbs,
  consumed_at: at(minutesAgo),
  food_name: "Glucose tabs",
  is_rescue_carb: true,
});

const dose = (units, minutesAgo) => ({
  units,
  administered_at: at(minutesAgo),
  insulin_type: "Humalog",
});

function project(readings, meals, doses, horizonMin = 120) {
  const result = projectGlucose(
    normalizeInputs(readings, meals, doses, settings, now),
    { horizonMin }
  );
  assert.equal(result.abstained, false, `engine abstained: ${result.abstainReason}`);
  return result;
}

const valueAt = (result, offset) => {
  const point = result.trajectory.find((p) => p.min_offset === offset);
  assert.ok(point, `no point at ${offset} min`);
  return point.value;
};

test("more insulin ends lower and falls faster than the same meal with less", () => {
  const readings = flatReadings(150);
  const meals = [meal(45, 20)];

  const modest = project(readings, meals, [dose(4, 15)]);
  const generous = project(readings, meals, [dose(8, 15)]);

  assert.ok(
    valueAt(generous, 120) < valueAt(modest, 120),
    `8 units should end lower than 4 units (${valueAt(generous, 120)} vs ${valueAt(modest, 120)})`
  );

  const fall = (result) => valueAt(result, 60) - valueAt(result, 120);
  assert.ok(
    fall(generous) > fall(modest),
    `8 units should be falling faster over the second hour (${fall(generous)} vs ${fall(modest)})`
  );
});

test("the rise scales with the carbohydrate logged", () => {
  const readings = flatReadings(110);

  const small = project(readings, [meal(20, 10)], []);
  const large = project(readings, [meal(40, 10)], []);
  const anchor = 110;

  const smallRise = Math.max(...small.trajectory.map((p) => p.value)) - anchor;
  const largeRise = Math.max(...large.trajectory.map((p) => p.value)) - anchor;

  assert.ok(smallRise > 0 && largeRise > smallRise, `40 g should rise more than 20 g (${largeRise} vs ${smallRise})`);
  const ratio = largeRise / smallRise;
  assert.ok(ratio > 1.8 && ratio < 2.2, `doubling the grams should roughly double the rise, got ${ratio}`);
});

test("a rescue lifts glucose briefly, then insulin takes the line below where it started", () => {
  // 160 with 6 units of insulin on board, taking 15 g of rescue carbohydrate.
  const readings = flatReadings(160);
  const meals = [rescue(15, 12)];
  const doses = [dose(6, 30)];

  const result = project(readings, meals, doses);

  const peak = result.trajectory.reduce((best, p) => (p.value > best.value ? p : best), result.trajectory[0]);
  assert.ok(peak.value > 160, `the rescue should raise glucose (peak ${peak.value})`);
  assert.ok(peak.min_offset <= 45, `the rescue's lift should arrive inside 45 minutes, got ${peak.min_offset}`);

  assert.ok(
    valueAt(result, 120) < 160,
    `insulin should take the line below the starting reading by 120 minutes, got ${valueAt(result, 120)}`
  );
});