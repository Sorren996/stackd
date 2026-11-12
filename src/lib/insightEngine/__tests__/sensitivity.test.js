import { describe, it, expect } from "vitest";
import { normalizeInputs, projectGlucose } from "../index";

// ── Build-time sensitivity contract ─────────────────────────────────────────
// Two directions the superposition model must always have. If either of these
// stops holding, the shape has stopped responding to its own inputs and no
// amount of calibration will save the forecast — so these run before every
// build (see the `prebuild` script).

const NOW = Date.parse("2026-11-12T18:00:00Z");
const MIN = 60 * 1000;

function readingsFlat(value = 140, count = 13) {
  return Array.from({ length: count }, (_, i) => ({
    recorded_at: new Date(NOW - (count - 1 - i) * 5 * MIN).toISOString(),
    value,
    source: "dexcom",
  }));
}

const SETTINGS = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 1,
  target_range_low: 70,
  target_range_high: 180,
  meal_outcome_window_minutes: 240,
};

function project({ carbs = 0, units = 0, mealMinutesAgo = 20, doseMinutesAgo = 20 }) {
  const meals = carbs > 0
    ? [{ id: "m", carbs, consumed_at: new Date(NOW - mealMinutesAgo * MIN).toISOString(), classification: "meal" }]
    : [];
  const doses = units > 0
    ? [{ id: "d", insulin_type: "NovoLog", units, administered_at: new Date(NOW - doseMinutesAgo * MIN).toISOString() }]
    : [];
  const snapshot = normalizeInputs(readingsFlat(), meals, doses, SETTINGS, NOW);
  const result = projectGlucose(snapshot, { horizonMin: 120 });
  const at = (offset) => result.trajectory.find((p) => p.min_offset === offset)?.value ?? null;
  return { result, at };
}

describe("sensitivity — the shape responds to its inputs", () => {
  it("doubling insulin steepens the fall", () => {
    const single = project({ units: 4 });
    const doubled = project({ units: 8 });

    // Compare the same span of the curve: from the 60-minute mark to the end.
    const singleDrop = single.at(60) - single.at(120);
    const doubledDrop = doubled.at(60) - doubled.at(120);

    expect(singleDrop).toBeGreaterThanOrEqual(0);
    expect(doubledDrop).toBeGreaterThan(singleDrop);
    // and the doubled dose is lower than the single dose at the far horizon
    expect(doubled.at(120)).toBeLessThan(single.at(120));
  });

  it("doubling carbs raises the peak", () => {
    const single = project({ carbs: 40 });
    const doubled = project({ carbs: 80 });

    const peak = (series) => Math.max(...series.result.trajectory.map((p) => p.value));

    expect(peak(doubled)).toBeGreaterThan(peak(single));
    expect(doubled.at(60)).toBeGreaterThan(single.at(60));
  });
});