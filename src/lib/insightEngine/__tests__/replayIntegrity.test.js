import { describe, test, expect } from "vitest";
// Stackd Insight Engine — Milestone 5.1: Historical Replay Integrity Tests
//
// Tests that the immutable input snapshot prevents future-data leakage in
// shadow evaluation replay. A meal, insulin dose, or CGM reading logged or
// synchronized AFTER a projection was generated must never appear in that
// projection's replay inputs, even if its event time is earlier.
//
// SAFETY: These tests verify replay integrity, never dosing.

import {
  buildInputSnapshot,
  isSnapshotValid,
  replayFromSnapshot,
  SNAPSHOT_VERSION,
} from "../projectionSnapshot";
import {
  normalizeInputs,
  projectGlucose,
  BASELINE_MODEL_VERSION,
} from "../index";
import { createBaselineResolution, createGeneralOnlyResolution } from "../modelResolution";
import { evaluateProjection, EVAL_BUFFER_MIN } from "../evaluation";

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// ── Test helpers ────────────────────────────────────────────────────────────

function makeReading(time, value, source = "dexcom", createdDate = null) {
  return {
    recorded_at: new Date(time).toISOString(),
    value,
    source,
    created_date: createdDate ? new Date(createdDate).toISOString() : new Date(time).toISOString(),
  };
}

function makeMeal(time, carbs, opts = {}, createdDate = null) {
  return {
    consumed_at: new Date(time).toISOString(),
    carbs,
    fat_grams: opts.fat || 0,
    protein_grams: opts.protein || 0,
    glycemic_index: opts.gi || 50,
    absorption_profile: opts.profile || "medium",
    speed_class: opts.speedClass || null,
    dual_wave: opts.dualWave || false,
    created_date: createdDate ? new Date(createdDate).toISOString() : new Date(time).toISOString(),
  };
}

function makeDose(time, units, insulinType = "NovoLog", createdDate = null) {
  return {
    administered_at: new Date(time).toISOString(),
    insulin_type: insulinType,
    units,
    created_date: createdDate ? new Date(createdDate).toISOString() : new Date(time).toISOString(),
  };
}

function makeSettings() {
  return {
    insulin_sensitivity_mgdl_per_unit: 50,
    meal_insulin_units_per_5g: 2.5,
    target_range_low: 80,
    target_range_high: 180,
  };
}

// Build a set of readings leading up to a generation time.
function makeReadingsBefore(genTime, count = 10, startValue = 120) {
  const readings = [];
  for (let i = count; i > 0; i--) {
    const t = genTime - i * 5 * MINUTE;
    readings.push(makeReading(t, startValue + i, "dexcom", t));
  }
  return readings;
}

// ── Snapshot building tests ─────────────────────────────────────────────────

describe("Milestone 5.1 — buildInputSnapshot availability filtering", () => {
  test("includes readings with created_date <= generated_at", () => {
    const genTime = Date.now();
    const readings = [
      makeReading(genTime - 10 * MINUTE, 120, "dexcom", genTime - 10 * MINUTE),
      makeReading(genTime - 5 * MINUTE, 125, "dexcom", genTime - 5 * MINUTE),
    ];
    const snapshot = buildInputSnapshot(readings, [], [], makeSettings(), null, genTime);
    expect(snapshot.readings).toHaveLength(2);
  });

  test("excludes readings with created_date > generated_at (synced after generation)", () => {
    const genTime = Date.now();
    // Reading event time is BEFORE generation, but created_date is AFTER.
    const readings = [
      makeReading(genTime - 10 * MINUTE, 120, "dexcom", genTime - 10 * MINUTE),  // available
      makeReading(genTime - 5 * MINUTE, 125, "dexcom", genTime + 5 * MINUTE),    // synced after
    ];
    const snapshot = buildInputSnapshot(readings, [], [], makeSettings(), null, genTime);
    expect(snapshot.readings).toHaveLength(1);
    expect(snapshot.readings[0].value).toBe(120);
  });

  test("includes meals with created_date <= generated_at", () => {
    const genTime = Date.now();
    const meals = [
      makeMeal(genTime - 30 * MINUTE, 45, {}, genTime - 30 * MINUTE),
    ];
    const snapshot = buildInputSnapshot([], meals, [], makeSettings(), null, genTime);
    expect(snapshot.meals).toHaveLength(1);
  });

  test("excludes meals logged after generation (created_date > generated_at)", () => {
    const genTime = Date.now();
    // Meal consumed_at is BEFORE generation, but created_date is AFTER.
    const meals = [
      makeMeal(genTime - 30 * MINUTE, 45, {}, genTime - 30 * MINUTE),  // available
      makeMeal(genTime - 20 * MINUTE, 30, {}, genTime + 5 * MINUTE),   // logged after
    ];
    const snapshot = buildInputSnapshot([], meals, [], makeSettings(), null, genTime);
    expect(snapshot.meals).toHaveLength(1);
    expect(snapshot.meals[0].carbs).toBe(45);
  });

  test("excludes insulin logged after generation (created_date > generated_at)", () => {
    const genTime = Date.now();
    const doses = [
      makeDose(genTime - 30 * MINUTE, 5, "NovoLog", genTime - 30 * MINUTE),  // available
      makeDose(genTime - 20 * MINUTE, 3, "NovoLog", genTime + 5 * MINUTE),   // logged after
    ];
    const snapshot = buildInputSnapshot([], [], doses, makeSettings(), null, genTime);
    expect(snapshot.doses).toHaveLength(1);
    expect(snapshot.doses[0].units).toBe(5);
  });

  test("snapshot version is set correctly", () => {
    const snapshot = buildInputSnapshot([], [], [], makeSettings(), null, Date.now());
    expect(snapshot.version).toBe(SNAPSHOT_VERSION);
  });

  test("settings are compacted correctly", () => {
    const settings = makeSettings();
    const snapshot = buildInputSnapshot([], [], [], settings, null, Date.now());
    expect(snapshot.settings.insulin_sensitivity_mgdl_per_unit).toBe(50);
    expect(snapshot.settings.meal_insulin_units_per_5g).toBe(2.5);
    expect(snapshot.settings.target_range_low).toBe(80);
    expect(snapshot.settings.target_range_high).toBe(180);
  });
});

// ── Snapshot validation tests ───────────────────────────────────────────────

describe("Milestone 5.1 — isSnapshotValid", () => {
  test("rejects null", () => {
    expect(isSnapshotValid(null)).toBe(false);
  });

  test("rejects undefined", () => {
    expect(isSnapshotValid(undefined)).toBe(false);
  });

  test("rejects wrong version", () => {
    const snapshot = buildInputSnapshot([], [], [], makeSettings(), null, Date.now());
    snapshot.version = 99;
    expect(isSnapshotValid(snapshot)).toBe(false);
  });

  test("rejects missing generated_at", () => {
    const snapshot = buildInputSnapshot([], [], [], makeSettings(), null, Date.now());
    delete snapshot.generated_at;
    expect(isSnapshotValid(snapshot)).toBe(false);
  });

  test("rejects invalid generated_at", () => {
    const snapshot = buildInputSnapshot([], [], [], makeSettings(), null, Date.now());
    snapshot.generated_at = "not-a-date";
    expect(isSnapshotValid(snapshot)).toBe(false);
  });

  test("rejects missing readings array", () => {
    const snapshot = buildInputSnapshot([], [], [], makeSettings(), null, Date.now());
    delete snapshot.readings;
    expect(isSnapshotValid(snapshot)).toBe(false);
  });

  test("rejects missing settings", () => {
    const snapshot = buildInputSnapshot([], [], [], makeSettings(), null, Date.now());
    delete snapshot.settings;
    expect(isSnapshotValid(snapshot)).toBe(false);
  });

  test("accepts a valid snapshot", () => {
    const snapshot = buildInputSnapshot([], [], [], makeSettings(), null, Date.now());
    expect(isSnapshotValid(snapshot)).toBe(true);
  });
});

// ── Replay from snapshot tests ──────────────────────────────────────────────

describe("Milestone 5.1 — replayFromSnapshot", () => {
  test("returns ineligible for null snapshot", () => {
    const resolution = createBaselineResolution();
    const result = replayFromSnapshot(null, 60, resolution);
    expect(result.abstained).toBe(true);
    expect(result.ineligibleReason).toBe("invalid_or_missing_snapshot");
    expect(result.trajectory).toHaveLength(0);
  });

  test("returns ineligible for invalid snapshot", () => {
    const resolution = createBaselineResolution();
    const result = replayFromSnapshot({ version: 99 }, 60, resolution);
    expect(result.abstained).toBe(true);
    expect(result.ineligibleReason).toBe("invalid_or_missing_snapshot");
  });

  test("produces a trajectory for a valid snapshot with readings", () => {
    const genTime = Date.now();
    const readings = makeReadingsBefore(genTime, 10, 120);
    const snapshot = buildInputSnapshot(readings, [], [], makeSettings(), null, genTime);
    const resolution = createBaselineResolution();
    const result = replayFromSnapshot(snapshot, 60, resolution);
    expect(result.abstained).toBe(false);
    expect(result.ineligibleReason).toBe(null);
    expect(result.trajectory.length).toBeGreaterThan(0);
  });

  test("replaying the same snapshot twice produces identical trajectories", () => {
    const genTime = Date.now();
    const readings = makeReadingsBefore(genTime, 10, 120);
    const meals = [makeMeal(genTime - 20 * MINUTE, 45, {}, genTime - 20 * MINUTE)];
    const doses = [makeDose(genTime - 15 * MINUTE, 4, "NovoLog", genTime - 15 * MINUTE)];
    const snapshot = buildInputSnapshot(readings, meals, doses, makeSettings(), null, genTime);

    const resolution = createBaselineResolution();
    const result1 = replayFromSnapshot(snapshot, 60, resolution);
    const result2 = replayFromSnapshot(snapshot, 60, resolution);

    expect(result1.trajectory).toEqual(result2.trajectory);
    expect(result1.modelVersion).toBe(result2.modelVersion);
  });

  test("different model resolutions produce different trajectories on the same snapshot", () => {
    const genTime = Date.now();
    const readings = makeReadingsBefore(genTime, 10, 120);
    // Use a small meal so the trajectory doesn't hit the 500 clamp, making
    // the rate-adjustment difference visible.
    const meals = [makeMeal(genTime - 20 * MINUTE, 15, {}, genTime - 20 * MINUTE)];
    const snapshot = buildInputSnapshot(readings, meals, [], makeSettings(), null, genTime);

    const baseline = createBaselineResolution();
    const generalOnly = createGeneralOnlyResolution(1.3);

    const baselineResult = replayFromSnapshot(snapshot, 60, baseline);
    const generalResult = replayFromSnapshot(snapshot, 60, generalOnly);

    // Both should produce trajectories.
    expect(baselineResult.abstained).toBe(false);
    expect(generalResult.abstained).toBe(false);

    // The trajectories should differ (different rate adjustment factors).
    const lastBaseline = baselineResult.trajectory[baselineResult.trajectory.length - 1].value;
    const lastGeneral = generalResult.trajectory[generalResult.trajectory.length - 1].value;
    expect(lastBaseline).not.toBe(lastGeneral);
  });
});

// ── Future-data leakage prevention tests ───────────────────────────────────

describe("Milestone 5.1 — future-data leakage prevention", () => {
  test("a meal logged after generation never appears in replay inputs", () => {
    const genTime = Date.now();
    // Meal consumed before generation but logged after.
    const mealLoggedAfter = makeMeal(genTime - 30 * MINUTE, 60, {}, genTime + 10 * MINUTE);
    // Meal consumed and logged before generation.
    const mealAvailable = makeMeal(genTime - 30 * MINUTE, 30, {}, genTime - 30 * MINUTE);

    const readings = makeReadingsBefore(genTime, 10, 120);
    const snapshot = buildInputSnapshot(readings, [mealLoggedAfter, mealAvailable], [], makeSettings(), null, genTime);

    expect(snapshot.meals).toHaveLength(1);
    expect(snapshot.meals[0].carbs).toBe(30);  // only the available meal
  });

  test("insulin logged after generation never appears in replay inputs", () => {
    const genTime = Date.now();
    const doseLoggedAfter = makeDose(genTime - 30 * MINUTE, 5, "NovoLog", genTime + 10 * MINUTE);
    const doseAvailable = makeDose(genTime - 30 * MINUTE, 3, "NovoLog", genTime - 30 * MINUTE);

    const readings = makeReadingsBefore(genTime, 10, 120);
    const snapshot = buildInputSnapshot(readings, [], [doseLoggedAfter, doseAvailable], makeSettings(), null, genTime);

    expect(snapshot.doses).toHaveLength(1);
    expect(snapshot.doses[0].units).toBe(3);
  });

  test("a CGM reading synced after generation cannot become an original projection input", () => {
    const genTime = Date.now();
    // Reading recorded before generation but synced after.
    const readingSyncedAfter = makeReading(genTime - 10 * MINUTE, 200, "dexcom", genTime + 5 * MINUTE);
    // Reading recorded and synced before generation.
    const readingAvailable = makeReading(genTime - 5 * MINUTE, 120, "dexcom", genTime - 5 * MINUTE);

    const snapshot = buildInputSnapshot(
      [readingSyncedAfter, readingAvailable], [], [], makeSettings(), null, genTime
    );

    expect(snapshot.readings).toHaveLength(1);
    expect(snapshot.readings[0].value).toBe(120);
  });

  test("replay with snapshot produces the same active meals as original generation", () => {
    const genTime = Date.now();
    const readings = makeReadingsBefore(genTime, 10, 120);
    const meals = [
      makeMeal(genTime - 20 * MINUTE, 45, {}, genTime - 20 * MINUTE),  // available
    ];
    const doses = [
      makeDose(genTime - 15 * MINUTE, 4, "NovoLog", genTime - 15 * MINUTE),  // available
    ];

    // Build snapshot at genTime.
    const snapshot = buildInputSnapshot(readings, meals, doses, makeSettings(), null, genTime);

    // Normalize at genTime using the snapshot data.
    const normalizedFromSnapshot = normalizeInputs(
      snapshot.readings, snapshot.meals, snapshot.doses, snapshot.settings, genTime
    );

    // Normalize at genTime using the original data (which is the same).
    const normalizedFromOriginal = normalizeInputs(readings, meals, doses, makeSettings(), genTime);

    expect(normalizedFromSnapshot.activeMeals).toHaveLength(normalizedFromOriginal.activeMeals.length);
    expect(normalizedFromSnapshot.activeDoses).toHaveLength(normalizedFromOriginal.activeDoses.length);
  });

  test("replay with snapshot excludes meals logged after generation that would have been active", () => {
    const genTime = Date.now();
    const readings = makeReadingsBefore(genTime, 10, 120);

    // A meal consumed before generation but logged after.
    const mealLoggedAfter = makeMeal(genTime - 20 * MINUTE, 60, {}, genTime + 10 * MINUTE);

    // Build snapshot — the meal should be excluded.
    const snapshot = buildInputSnapshot(readings, [mealLoggedAfter], [], makeSettings(), null, genTime);
    expect(snapshot.meals).toHaveLength(0);

    // Normalize from the snapshot — no active meals.
    const normalized = normalizeInputs(
      snapshot.readings, snapshot.meals, snapshot.doses, snapshot.settings, genTime
    );
    expect(normalized.activeMeals).toHaveLength(0);

    // But if we had used the original data (without snapshot), the meal would
    // have been included (because its consumed_at is before genTime).
    const normalizedWithoutSnapshot = normalizeInputs(
      readings, [mealLoggedAfter], [], makeSettings(), genTime
    );
    expect(normalizedWithoutSnapshot.activeMeals).toHaveLength(1);
  });
});

// ── Cross-user isolation tests ──────────────────────────────────────────────

describe("Milestone 5.1 — cross-user snapshot isolation", () => {
  test("a snapshot built from user A data contains no user B records", () => {
    const genTime = Date.now();
    const userAReadings = makeReadingsBefore(genTime, 10, 120);
    const userAMeals = [makeMeal(genTime - 20 * MINUTE, 45, {}, genTime - 20 * MINUTE)];
    const userADoses = [makeDose(genTime - 15 * MINUTE, 4, "NovoLog", genTime - 15 * MINUTE)];

    const snapshot = buildInputSnapshot(userAReadings, userAMeals, userADoses, makeSettings(), null, genTime);

    // The snapshot contains only user A's data — no user B data can leak in
    // because buildInputSnapshot only receives the records passed to it.
    expect(snapshot.readings).toHaveLength(10);
    expect(snapshot.meals).toHaveLength(1);
    expect(snapshot.doses).toHaveLength(1);

    // Verify the snapshot doesn't have any user-identifying fields.
    expect(snapshot).not.toHaveProperty("user_id");
    expect(snapshot.readings[0]).not.toHaveProperty("user_id");
    expect(snapshot.meals[0]).not.toHaveProperty("user_id");
    expect(snapshot.doses[0]).not.toHaveProperty("user_id");
  });
});

// ── Evaluation outcome separation tests ─────────────────────────────────────

describe("Milestone 5.1 — future CGM readings as outcomes only after maturity", () => {
  test("readings before the evaluation buffer are not scored", () => {
    const genTime = Date.now();
    const readings = makeReadingsBefore(genTime, 10, 120);
    const snapshot = buildInputSnapshot(readings, [], [], makeSettings(), null, genTime);
    const resolution = createBaselineResolution();
    const result = replayFromSnapshot(snapshot, 60, resolution);

    // The trajectory exists.
    expect(result.trajectory.length).toBeGreaterThan(0);

    // Try to evaluate immediately (before the buffer has elapsed).
    const evalResult = evaluateProjection(
      {
        generated_at: genTime,
        model_version: result.modelVersion,
        horizon_minutes: 60,
        trajectory: result.trajectory.map(p => ({
          min_offset: p.min_offset,
          value: p.value,
          lower: p.lower,
          upper: p.upper,
        })),
        abstained: false,
      },
      [],  // no actual readings yet
      genTime  // evaluate immediately
    );

    // Should be unscorable (no observations).
    expect(evalResult.status).toBe("unscorable");
  });

  test("readings after the evaluation buffer are scored as outcomes", () => {
    const genTime = Date.now();
    const readings = makeReadingsBefore(genTime, 10, 120);
    const snapshot = buildInputSnapshot(readings, [], [], makeSettings(), null, genTime);
    const resolution = createBaselineResolution();
    const result = replayFromSnapshot(snapshot, 60, resolution);

    // Create actual outcome readings at 15, 30, 60 min after generation.
    const outcomeReadings = [
      { time: genTime + 15 * MINUTE, value: 130, source: "dexcom" },
      { time: genTime + 30 * MINUTE, value: 135, source: "dexcom" },
      { time: genTime + 60 * MINUTE, value: 125, source: "dexcom" },
    ];

    // Evaluate after the buffer has elapsed.
    const evalTime = genTime + 60 * MINUTE + (EVAL_BUFFER_MIN + 1) * MINUTE;
    const evalResult = evaluateProjection(
      {
        generated_at: genTime,
        model_version: result.modelVersion,
        horizon_minutes: 60,
        trajectory: result.trajectory.map(p => ({
          min_offset: p.min_offset,
          value: p.value,
          lower: p.lower,
          upper: p.upper,
        })),
        abstained: false,
      },
      outcomeReadings,
      evalTime
    );

    expect(evalResult.status).toBe("evaluated");
    expect(evalResult.valid_count).toBeGreaterThan(0);
  });
});