import test from "node:test";
import assert from "node:assert/strict";

import {
  MIN_EPISODES,
  MAGNITUDE_BOUNDS,
  observeRescueEpisodes,
  learnRescueCarbModel,
} from "../rescueCarbLearning.ts";
import { normalizeInputs, projectGlucose } from "../insightEngine.ts";

const MINUTE_MS = 60 * 1000;
const now = Date.parse("2026-11-12T12:00:00.000Z");
const at = (minutesAgo) => new Date(now - minutesAgo * MINUTE_MS).toISOString();

const rescue = (carbs, minutesAgo) => ({
  carbs,
  consumed_at: at(minutesAgo),
  food_name: "Juice",
  is_rescue_carb: true,
});

const mealEntry = (carbs, minutesAgo) => ({
  carbs,
  consumed_at: at(minutesAgo),
  food_name: "Sandwich",
});

const reading = (value, minutesAgo) => ({ value, recorded_at: at(minutesAgo) });

// A rescue 90 minutes ago at 15 g, starting from 70 and peaking at 110.
const cleanReadings = [
  reading(70, 95),
  reading(70, 92),
  reading(78, 75),
  reading(96, 65),
  reading(110, 60),
  reading(104, 50),
  reading(96, 40),
];

test("a clean rescue episode is measurable", () => {
  const episodes = observeRescueEpisodes({
    meals: [rescue(15, 90)],
    doses: [],
    readings: cleanReadings,
    nowMs: now,
  });
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].carbs, 15);
  assert.equal(episodes[0].riseMgdl, 40);
  assert.equal(episodes[0].minutesToPeak, 30);
});

test("a rescue with another meal beside it is not evidence", () => {
  const episodes = observeRescueEpisodes({
    meals: [rescue(15, 90), mealEntry(45, 70)],
    doses: [],
    readings: cleanReadings,
    nowMs: now,
  });
  assert.equal(episodes.length, 0);
});

test("a rescue with a nearby insulin dose is not evidence", () => {
  const episodes = observeRescueEpisodes({
    meals: [rescue(15, 90)],
    doses: [{ units: 2, administered_at: at(80) }],
    readings: cleanReadings,
    nowMs: now,
  });
  assert.equal(episodes.length, 0);
});

test("a rescue still within its observation window is not judged yet", () => {
  const episodes = observeRescueEpisodes({
    meals: [rescue(15, 10)],
    doses: [],
    readings: [reading(70, 15), reading(85, 5)],
    nowMs: now,
  });
  assert.equal(episodes.length, 0);
});

test("nothing is learned from too few episodes", () => {
  const result = learnRescueCarbModel({
    episodes: [{ carbs: 15, riseMgdl: 40, minutesToPeak: 30 }],
    previous: null,
    mgPerGram: 3,
  });
  assert.equal(result.magnitudeFactor, 1);
  assert.equal(result.speedFactor, 1);
  assert.equal(result.changed, false);
  assert.ok(MIN_EPISODES > 1);
});

test("a larger-than-generic rise raises the magnitude factor, within bounds", () => {
  const episodes = Array.from({ length: 5 }, () => ({ carbs: 15, riseMgdl: 44, minutesToPeak: 30 }));
  const result = learnRescueCarbModel({ episodes, previous: null, mgPerGram: 3 });
  assert.equal(result.changed, true);
  assert.ok(result.magnitudeFactor > 1);
  assert.ok(result.magnitudeFactor <= MAGNITUDE_BOUNDS.max);
});

test("a slower-than-generic peak raises the speed factor", () => {
  const episodes = Array.from({ length: 5 }, () => ({ carbs: 15, riseMgdl: 20, minutesToPeak: 60 }));
  const result = learnRescueCarbModel({ episodes, previous: null, mgPerGram: 3 });
  assert.equal(result.changed, true);
  assert.ok(result.speedFactor > 1);
});

test("a smaller-than-generic rise lowers the magnitude factor", () => {
  const episodes = Array.from({ length: 5 }, () => ({ carbs: 15, riseMgdl: 8, minutesToPeak: 30 }));
  const result = learnRescueCarbModel({ episodes, previous: null, mgPerGram: 3 });
  assert.equal(result.changed, true);
  assert.ok(result.magnitudeFactor < 1);
});

test("the learned magnitude reaches the projection", () => {
  const settings = {
    insulin_sensitivity_mgdl_per_unit: 50,
    meal_insulin_units_per_5g: 2.5,
    target_range_low: 70,
    target_range_high: 180,
  };
  // Flat readings, so the only thing driving the forecast is the rescue carb.
  const readings = [
    reading(120, 5),
    reading(120, 10),
    reading(120, 15),
    reading(120, 20),
    reading(121, 25),
  ].map((r) => ({ ...r, source: "dexcom" }));
  const meals = [rescue(15, 12)];

  const generic = projectGlucose(normalizeInputs(readings, meals, [], settings, now), {
    horizonMin: 60,
  });
  const learned = projectGlucose(normalizeInputs(readings, meals, [], settings, now), {
    horizonMin: 60,
    rescueParams: { magnitudeFactor: MAGNITUDE_BOUNDS.max, speedFactor: 1 },
  });

  assert.equal(generic.abstained, false);
  assert.equal(learned.abstained, false);
  // Same moment, same everything, only the learned magnitude differs.
  const at30 = (result) => result.trajectory.find((p) => p.min_offset === 30).value;
  assert.ok(at30(learned) > at30(generic));
});