// Momentum: the forecast must leave the anchor at the speed glucose is actually
// moving, then hand off to the mechanistic shapes.
//
// Every assertion below corresponds to something a reader saw and did not
// believe: a falling morning drawn as a rise, a dashed line starting a few
// points above the solid one, a steady stretch forecast as a drift, a rise that
// climbed to the horizon without ever levelling. Each one fails if the old
// behaviour returns.

import test from "node:test";
import assert from "node:assert/strict";

import { normalizeInputs, projectGlucose } from "../insightEngine.ts";
import { measureVelocity, trendFromVelocity } from "../measuredVelocity.ts";

const MINUTE_MS = 60 * 1000;
const now = Date.parse("2026-11-12T06:45:00.000Z");
const at = (minutesAgo) => new Date(now - minutesAgo * MINUTE_MS).toISOString();

const settings = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 0.5,
  target_range_low: 70,
  target_range_high: 180,
  meal_outcome_window_minutes: 210,
};

// Readings every five minutes, newest last, anchored at `now`.
const series = (values) =>
  values.map((value, i) => ({
    value,
    recorded_at: at((values.length - 1 - i) * 5),
    source: "dexcom",
  }));

const dose = (units, minutesAgo) => ({
  units,
  administered_at: at(minutesAgo),
  insulin_type: "Humalog",
});

function project(readings, meals = [], doses = [], horizonMin = 120) {
  const result = projectGlucose(normalizeInputs(readings, meals, doses, settings, now), { horizonMin });
  assert.equal(result.abstained, false, `engine abstained: ${result.abstainReason}`);
  return result;
}

const valueAt = (result, offset) => {
  const point = result.trajectory.find((p) => p.min_offset === offset);
  assert.ok(point, `no point at ${offset} min`);
  return point.value;
};

const halfWidthAt = (result, offset) => {
  const point = result.trajectory.find((p) => p.min_offset === offset);
  assert.ok(point, `no point at ${offset} min`);
  return (point.upper - point.lower) / 2;
};

// ── 1. A fall keeps falling while insulin is at work ───────────────────────

test("falling readings never forecast a rise at 15 minutes while insulin is active", () => {
  // 115 → 103 over fifteen minutes, with rapid-acting insulin 30 min ago.
  const readings = series([115, 111, 107, 103]);
  const result = project(readings, [], [dose(1, 30)]);

  const anchor = 103;
  const predicted = valueAt(result, 15);
  assert.ok(
    predicted <= anchor,
    `a measured fall must not be drawn rising: ${anchor} → ${predicted} at 15 min`
  );
  assert.ok(
    result.momentum.measuredVelocity < -0.5,
    `the measured velocity should be a fall, got ${result.momentum.measuredVelocity}`
  );
  assert.ok(
    result.momentum.openingRate < 0,
    `the opening rate should be negative, got ${result.momentum.openingRate}`
  );
});

// ── 2. The first point IS the reading ──────────────────────────────────────

test("the first trajectory point is the anchor reading exactly, and leaves at the measured velocity", () => {
  // A reading that is not a whole number, so rounding would be caught too.
  const readings = series([118.6, 114.2, 109.4, 104.7]);
  const result = project(readings, [], [dose(1, 30)]);

  assert.equal(result.trajectory[0].min_offset, 0);
  assert.equal(result.trajectory[0].value, 104.7, "offset 0 must be the anchor exactly, not rounded or nudged");
  assert.equal(result.trajectory[0].lower, 104.7);
  assert.equal(result.trajectory[0].upper, 104.7);

  // The opening segment's own slope, and the reported opening rate, both agree
  // with what the last three readings measured.
  const measured = result.momentum.measuredVelocity;
  const openingSegment = (valueAt(result, 5) - 104.7) / 5;
  assert.ok(
    Math.abs(openingSegment - measured) <= 0.5,
    `opening slope ${openingSegment.toFixed(2)} should agree with measured ${measured} within 0.5`
  );
  assert.ok(
    Math.abs(result.momentum.openingRate - measured) <= 0.5,
    `opening rate ${result.momentum.openingRate} should agree with measured ${measured} within 0.5`
  );
});

// ── 3. A stable series carries no momentum ─────────────────────────────────

test("a stable series measures approximately zero velocity and carries no momentum", () => {
  const readings = series([100, 100, 100, 100]);
  const result = project(readings, [], []);

  assert.ok(
    Math.abs(result.momentum.measuredVelocity) < 0.05,
    `a flat series should measure ~0, got ${result.momentum.measuredVelocity}`
  );
  assert.ok(
    Math.abs(result.momentum.appliedStart) < 0.05,
    `no momentum should be applied, got ${result.momentum.appliedStart}`
  );

  const spread = valueAt(result, 20) - valueAt(result, 0);
  assert.ok(Math.abs(spread) <= 1, `a flat series should stay flat, drifted ${spread} mg/dL in 20 min`);
});

test("a single outlying sample does not turn a steady stretch into a trend", () => {
  // One bad sensor sample at -10 min: 100, 130, 100, 100.
  const readings = series([100, 130, 100, 100]);
  const measured = measureVelocity(readings, now);
  assert.ok(
    Math.abs(measured.velocity) <= 1,
    `Theil–Sen should not follow one outlier, measured ${measured.velocity}`
  );
});

// ── 4. A rise levels instead of climbing to the horizon ────────────────────

test("a rise levels off as momentum decays, instead of climbing to the horizon", () => {
  // +1.2 mg/dL/min with nothing on board to sustain it.
  const readings = series([76, 82, 88, 94]);
  const result = project(readings, [], [], 120);

  const measured = result.momentum.measuredVelocity;
  assert.ok(measured > 0.8, `the series should measure a rise, got ${measured}`);
  assert.ok(
    result.momentum.openingRate >= measured - 0.5,
    `the curve should open at the measured rise, opening ${result.momentum.openingRate} vs ${measured}`
  );
  assert.ok(valueAt(result, 15) > 94, "the first quarter hour should still rise");

  const earlyChange = valueAt(result, 15) - valueAt(result, 0);
  const lateChange = valueAt(result, 105) - valueAt(result, 90);
  assert.ok(
    lateChange < earlyChange * 0.2,
    `the rise should have levelled by 90 min (early ${earlyChange.toFixed(1)}, late ${lateChange.toFixed(1)})`
  );

  // Momentum itself is nearly spent inside an hour — the shapes are in charge.
  const rateAt60 = result.momentum.appliedStart * Math.exp(-60 / result.momentum.tauMin);
  assert.ok(
    Math.abs(rateAt60) < Math.abs(result.momentum.appliedStart) * 0.12,
    `momentum should be under 12% of its opening value at 60 min, got ${rateAt60}`
  );
});

// ── 5. Guards: no measurement, and sensor compression ──────────────────────

test("fewer than three fresh readings means no momentum at all", () => {
  const readings = series([90, 84]);
  const measured = measureVelocity(readings, now);
  assert.equal(measured.velocity, null);
  assert.equal(measured.reason, "too_few_readings");

  const result = project(readings, [], [dose(1, 30)], 30);
  assert.equal(result.momentum.measuredVelocity, null);
  assert.equal(result.momentum.appliedStart, 0);
  assert.equal(result.momentum.unusableReason, "too_few_readings");
});

test("stale, duplicated and carried-forward readings are refused", () => {
  const stale = series([90, 84, 80, 76]).map((r) => ({ ...r, recorded_at: at(40) }));
  assert.equal(measureVelocity(stale, now).reason, "stale");

  const duplicated = [
    { value: 90, recorded_at: at(15) },
    { value: 88, recorded_at: at(10) },
    { value: 86, recorded_at: at(10) },
    { value: 84, recorded_at: at(5) },
  ];
  assert.equal(measureVelocity(duplicated, now).reason, "duplicate_readings");

  const interpolated = series([90, 86, 82, 78]).map((r, i) => (i === 1 ? { ...r, source: "system" } : r));
  assert.equal(measureVelocity(interpolated, now).reason, "interpolated_readings");
});

test("a fast fall with nothing on board is damped, and the band widens instead", () => {
  // -2 mg/dL/min, with no insulin and no carbohydrate to explain it.
  const readings = series([140, 130, 120, 110]);

  const unexplained = project(readings, [], [], 60);
  assert.equal(unexplained.momentum.damped, true);
  assert.ok(
    Math.abs(unexplained.momentum.appliedStart) < Math.abs(unexplained.momentum.measuredVelocity) * 0.5,
    `the centre line should not be yanked by an unexplained fall (applied ${unexplained.momentum.appliedStart} vs measured ${unexplained.momentum.measuredVelocity})`
  );
  assert.ok(
    valueAt(unexplained, 15) > 110 - 30,
    "a damped fall must not be extrapolated as a cliff"
  );

  // The same readings with a dose on board are explained, so they are followed,
  // and the damped case answers with a wider band rather than a shifted centre.
  const explained = project(readings, [], [dose(1, 45)], 60);
  assert.equal(explained.momentum.damped, false);
  assert.ok(
    halfWidthAt(unexplained, 45) > halfWidthAt(explained, 45),
    "the unexplained case should widen the band rather than shift its centre"
  );
});

// ── 6. One velocity, one arrow ─────────────────────────────────────────────

test("the projection and the trend arrow speak about the same measurement", () => {
  // -1.6 mg/dL/min: the arrow beside the reading says "Slowly falling".
  const readings = series([130, 122, 114, 106]);
  const measured = measureVelocity(readings, now);
  const arrow = trendFromVelocity(measured.velocity);

  const result = project(readings, [], [dose(1, 30)], 60);
  assert.equal(arrow.icon, "down-right");
  assert.equal(arrow.label, "Slowly falling");
  assert.equal(result.momentum.measuredVelocity, measured.velocity);
  assert.ok(result.momentum.openingRate < 0, "the forecast must open in the same direction as the arrow");
  assert.ok(valueAt(result, 15) < 106, "and must actually be falling 15 minutes out");
});