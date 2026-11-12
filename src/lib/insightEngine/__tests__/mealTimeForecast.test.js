import { describe, it, expect } from "vitest";
import { normalizeInputs, projectGlucose, resolveHorizonMin } from "../index";
import { abstainNoteFor } from "@/lib/projection/projectionNote";
import { mealInPlayWindowMinutes } from "@/lib/mealInPlayWindow";

// A meal-time forecast must be DRAWN, never withheld because its band is wide.
// These cover the regression where every 120-minute projection abstained with
// "the range of likely outcomes is too wide", so a dashed line only ever
// appeared when there was nothing to project.
describe("meal-time projection is drawn", () => {
  const now = Date.parse("2026-11-12T17:40:00Z");
  const readings = [];
  for (let i = 24; i >= 0; i--) {
    readings.push({
      recorded_at: new Date(now - i * 300000).toISOString(),
      value: 150 + Math.sin(i / 3) * 4,
      source: "dexcom",
    });
  }
  const meal = {
    id: "m1",
    carbs: 111,
    consumed_at: new Date(now - 115 * 60000).toISOString(),
    fat_grams: 30,
    protein_grams: 40,
    classification: "meal",
  };
  const doses = [
    { id: "d1", insulin_type: "NovoLog", units: 8, administered_at: new Date(now - 110 * 60000).toISOString() },
    { id: "d2", insulin_type: "NovoLog", units: 4, administered_at: new Date(now - 40 * 60000).toISOString() },
  ];
  const settings = {
    insulin_sensitivity_mgdl_per_unit: 50,
    meal_insulin_units_per_5g: 1,
    target_range_low: 70,
    target_range_high: 180,
    meal_outcome_window_minutes: 105,
  };
  const calibration = {
    method: "empirical_calibrated",
    version: "1",
    sigmaByHorizon: { 5: 18, 10: 25, 15: 30, 20: 40 },
    calibrated: true,
    sampleCount: 40,
    horizonSampleCounts: {},
    coverageObserved: 0.8,
    coverageSampleCount: 20,
  };

  it("keeps a large meal in play past a short review setting", () => {
    const snap = normalizeInputs(readings, [meal], doses, settings, now);
    expect(snap.activeMeals).toHaveLength(1);
    expect(resolveHorizonMin(snap)).toBe(120);
  });

  it("draws the full horizon with a band that settles below the ceiling", () => {
    const snap = normalizeInputs(readings, [meal], doses, settings, now);
    const result = projectGlucose(snap, { uncertaintyCalibration: calibration });
    expect(result.abstained).toBe(false);
    expect(result.trajectory.length).toBeGreaterThan(20);
    const last = result.trajectory[result.trajectory.length - 1];
    expect(last.min_offset).toBe(120);
    expect(last.upper).toBeGreaterThan(last.lower);
    expect((last.upper - last.lower) / 2).toBeLessThanOrEqual(70);
  });

  it("scales the in-play window with carb size, capped at 4.5 hours", () => {
    expect(mealInPlayWindowMinutes(40, 105)).toBe(120);
    expect(mealInPlayWindowMinutes(111, 105)).toBe(171);
    expect(mealInPlayWindowMinutes(111, 240)).toBe(240);
    expect(mealInPlayWindowMinutes(400, 240)).toBe(270);
  });

  it("speaks the abstain reason in plain language", () => {
    expect(abstainNoteFor("No valid CGM reading within the freshness window. Connect a glucose source or log a reading.")).toMatch(/fresh reading/i);
    expect(abstainNoteFor("Insufficient evidence to project — data is too sparse or stale.")).toMatch(/readings/i);
    expect(abstainNoteFor(null)).toMatch(/Not enough signal/i);
  });
});