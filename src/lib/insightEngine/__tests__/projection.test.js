import { describe, it, expect } from "vitest";
import {
  normalizeInputs,
  projectGlucose,
  carbAppearanceRateGPerMin,
  insulinActivityRateUnitsPerMin,
  PROJECTION_MODEL_VERSION,
} from "../index";

const MINUTE_MS = 60 * 1000;

function reading(value, minutesAgo, source = "dexcom") {
  return {
    recorded_at: new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString(),
    value,
    source,
  };
}

function meal(carbs, minutesAgo, overrides = {}) {
  return {
    consumed_at: new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString(),
    carbs,
    food_name: "Test Meal",
    absorption_profile: "medium",
    ...overrides,
  };
}

function dose(units, minutesAgo, insulinType = "NovoLog") {
  return {
    administered_at: new Date(Date.now() - minutesAgo * MINUTE_MS).toISOString(),
    units,
    insulin_type: insulinType,
  };
}

const settings = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 2.5,
  target_range_low: 70,
  target_range_high: 180,
};

describe("Baseline projection — valid forecasts from eligible inputs", () => {
  it("produces a trajectory from a recent reading with active carbs and insulin", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(120, 5), reading(125, 10), reading(130, 15)],
      [meal(45, 20)],
      [dose(4, 25)],
      settings,
      now
    );
    const result = projectGlucose(snap, { horizonMin: 60 });
    expect(result.abstained).toBe(false);
    expect(result.trajectory.length).toBeGreaterThan(0);
    expect(result.modelVersion).toBe(PROJECTION_MODEL_VERSION);
    expect(result.anchor.value).toBe(120);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  it("starts the trajectory at the anchor value", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(140, 5)], [meal(30, 10)], [], settings, now);
    const result = projectGlucose(snap, { horizonMin: 30 });
    expect(result.trajectory[0].value).toBe(140);
    expect(result.trajectory[0].min_offset).toBe(0);
  });

  it("projects a rise when carbs are absorbing and no insulin is active", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(100, 5), reading(100, 10)], [meal(45, 15)], [], settings, now);
    const result = projectGlucose(snap, { horizonMin: 60 });
    const endValue = result.trajectory[result.trajectory.length - 1].value;
    expect(endValue).toBeGreaterThan(100);
  });

  it("projects a drop when insulin is active and no carbs are absorbing", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(180, 5), reading(180, 10)], [], [dose(5, 20)], settings, now);
    const result = projectGlucose(snap, { horizonMin: 60 });
    const endValue = result.trajectory[result.trajectory.length - 1].value;
    expect(endValue).toBeLessThan(180);
  });

  it("respects the 5-minute step interval", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(120, 5)], [meal(30, 10)], [], settings, now);
    const result = projectGlucose(snap, { horizonMin: 30, stepMin: 5 });
    expect(result.trajectory.length).toBe(7);
    for (let i = 1; i < result.trajectory.length; i++) {
      expect(result.trajectory[i].min_offset - result.trajectory[i - 1].min_offset).toBe(5);
    }
  });
});

describe("Missing and stale data handling", () => {
  it("abstains when there are no readings at all", () => {
    const now = Date.now();
    const snap = normalizeInputs([], [meal(30, 10)], [dose(3, 15)], settings, now);
    const result = projectGlucose(snap);
    expect(result.abstained).toBe(true);
    expect(result.trajectory).toEqual([]);
    expect(result.anchor).toBeNull();
  });

  it("abstains when the latest reading is older than the freshness window", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(120, 20)], [meal(30, 10)], [], settings, now);
    const result = projectGlucose(snap);
    expect(result.abstained).toBe(true);
    expect(result.abstainReason).toMatch(/freshness|stale|valid/i);
  });

  it("deduplicates identical readings", () => {
    const now = Date.now();
    const dup = reading(120, 5);
    const snap = normalizeInputs([dup, dup, dup], [], [], settings, now);
    expect(snap.readings.length).toBe(1);
  });

  it("filters out non-finite readings", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [
        { recorded_at: new Date(now - 10 * MINUTE_MS).toISOString(), value: NaN },
        { recorded_at: new Date(now - 5 * MINUTE_MS).toISOString(), value: 120 },
      ],
      [], [], settings, now
    );
    expect(snap.readings.length).toBe(1);
    expect(snap.readings[0].value).toBe(120);
  });

  it("handles missing user settings by using uncalibrated fallback", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(120, 5)], [meal(30, 10)], [dose(3, 15)], {}, now);
    expect(snap.dataQuality.calibrated).toBe(false);
    expect(snap.dataQuality.confounders).toContain("uncalibrated_settings");
    const result = projectGlucose(snap, { horizonMin: 30 });
    expect(result.abstained).toBe(false);
    expect(result.confidence).toBeLessThan(0.7);
  });
});

describe("Insufficient evidence — abstention", () => {
  it("abstains or produces very low confidence with no active inputs and poor data", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(120, 14), reading(121, 50)],
      [], [], {}, now
    );
    const result = projectGlucose(snap, { horizonMin: 30 });
    if (result.abstained) {
      expect(result.trajectory).toEqual([]);
      expect(result.abstainReason).toBeTruthy();
    } else {
      expect(result.confidence).toBeLessThan(0.3);
    }
  });

  it("does not abstain when there are active inputs even with moderate data issues", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(120, 5), reading(122, 10)],
      [meal(30, 10)], [dose(2, 15)], settings, now
    );
    const result = projectGlucose(snap, { horizonMin: 30 });
    expect(result.abstained).toBe(false);
    expect(result.trajectory.length).toBeGreaterThan(0);
  });
});

describe("Uncertainty layer", () => {
  it("widens the band with increasing horizon", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(120, 5), reading(121, 10)], [meal(30, 10)], [], settings, now);
    const result = projectGlucose(snap, { horizonMin: 60 });
    const first = result.trajectory[0];
    const last = result.trajectory[result.trajectory.length - 1];
    expect(last.upper - last.lower).toBeGreaterThan(first.upper - first.lower);
  });

  it("produces wider bands when data quality is poor", () => {
    const now = Date.now();
    // Same active inputs (1 meal, 1 dose, calibrated), but the poor case has
    // a sensor gap + fewer readings + overlapping meal, isolating data quality
    // from rate influence.
    const goodSnap = normalizeInputs(
      [reading(120, 5), reading(121, 10), reading(122, 15)],
      [meal(30, 10)], [dose(2, 15)], settings, now
    );
    const poorSnap = normalizeInputs(
      [reading(120, 5), reading(121, 10), reading(122, 90)], // gap between 10m and 90m
      [meal(30, 10), meal(20, 5)], [dose(2, 15)], settings, now
    );
    const goodResult = projectGlucose(goodSnap, { horizonMin: 30 });
    const poorResult = projectGlucose(poorSnap, { horizonMin: 30 });
    const goodBand = goodResult.trajectory[goodResult.trajectory.length - 1].upper - goodResult.trajectory[goodResult.trajectory.length - 1].lower;
    const poorBand = poorResult.trajectory[poorResult.trajectory.length - 1].upper - poorResult.trajectory[poorResult.trajectory.length - 1].lower;
    expect(poorBand).toBeGreaterThan(goodBand);
  });

  it("never lets the band exceed the maximum sigma", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(120, 5)], [meal(30, 10)], [dose(2, 15)], settings, now);
    const result = projectGlucose(snap, { horizonMin: 180 });
    for (const p of result.trajectory) {
      expect(p.upper - p.lower).toBeLessThanOrEqual(120);
    }
  });
});

describe("Prediction provenance", () => {
  it("records the model version, generation timestamp, and anchor", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(120, 5)], [meal(30, 10)], [], settings, now);
    const result = projectGlucose(snap, { horizonMin: 30 });
    expect(result.modelVersion).toBe(PROJECTION_MODEL_VERSION);
    expect(result.generatedAt).toBe(now);
    expect(result.anchor).toEqual({ time: snap.anchor.time, value: 120 });
  });

  it("records input provenance without storing full raw data", () => {
    const now = Date.now();
    const snap = normalizeInputs(
      [reading(120, 5), reading(121, 10)],
      [meal(30, 10), meal(15, 5)], [dose(2, 15)], settings, now
    );
    const result = projectGlucose(snap, { horizonMin: 30 });
    expect(result.inputProvenance).toBeTruthy();
    expect(result.inputProvenance.readingCount).toBe(2);
    expect(result.inputProvenance.mealCount).toBe(2);
    expect(result.inputProvenance.doseCount).toBe(1);
    expect(result.inputProvenance.settingsCalibrated).toBe(true);
    expect(JSON.stringify(result.inputProvenance)).not.toContain("recorded_at");
  });

  it("records active inputs summary", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(120, 5)], [meal(45, 10)], [dose(3, 15)], settings, now);
    const result = projectGlucose(snap, { horizonMin: 30 });
    expect(result.activeInputs.mealCount).toBe(1);
    expect(result.activeInputs.doseCount).toBe(1);
    expect(result.activeInputs.totalActiveCarbGrams).toBeGreaterThan(0);
    expect(result.activeInputs.totalActiveInsulinUnits).toBeGreaterThan(0);
  });
});

describe("Clinical safety — no dosing recommendations", () => {
  it("never returns a dose recommendation or insulin calculation", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(250, 5)], [meal(60, 10)], [dose(2, 15)], settings, now);
    const result = projectGlucose(snap, { horizonMin: 60 });
    expect(JSON.stringify(result)).not.toMatch(/recommend.*dose|prescribe|bolus.*units|take.*units/i);
  });

  it("does not modify the user's settings", () => {
    const originalSettings = { ...settings };
    const now = Date.now();
    const snap = normalizeInputs([reading(120, 5)], [meal(30, 10)], [], settings, now);
    projectGlucose(snap, { horizonMin: 30 });
    expect(settings).toEqual(originalSettings);
  });

  it("clamps projected values to a physiologically plausible range", () => {
    const now = Date.now();
    const snap = normalizeInputs([reading(400, 5)], [meal(100, 5)], [], settings, now);
    const result = projectGlucose(snap, { horizonMin: 60 });
    for (const p of result.trajectory) {
      expect(p.value).toBeLessThanOrEqual(500);
      expect(p.value).toBeGreaterThanOrEqual(20);
    }
  });
});

describe("Carb appearance rate", () => {
  it("returns 0 before meal time", () => {
    expect(carbAppearanceRateGPerMin(meal(30, -10), Date.now())).toBe(0);
  });
  it("returns 0 after the absorption window", () => {
    expect(carbAppearanceRateGPerMin(meal(30, 400), Date.now())).toBe(0);
  });
  it("returns a positive rate during absorption", () => {
    expect(carbAppearanceRateGPerMin(meal(45, 20), Date.now())).toBeGreaterThan(0);
  });
});

describe("Insulin activity rate", () => {
  it("returns 0 for basal insulin", () => {
    expect(insulinActivityRateUnitsPerMin(dose(10, 30, "Lantus"), Date.now())).toBe(0);
  });
  it("returns 0 before dose time", () => {
    expect(insulinActivityRateUnitsPerMin(dose(5, -10), Date.now())).toBe(0);
  });
  it("returns 0 after the DIA", () => {
    expect(insulinActivityRateUnitsPerMin(dose(5, 400), Date.now())).toBe(0);
  });
  it("returns a positive rate during active insulin", () => {
    expect(insulinActivityRateUnitsPerMin(dose(5, 30), Date.now())).toBeGreaterThan(0);
  });
});