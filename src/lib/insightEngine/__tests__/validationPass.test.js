// Validation pass: continuous learning + high/low line geometry + close window
import { describe, test, expect } from "vitest";
import { normalizeInputs, projectGlucose, resolveHorizonMin } from "@/lib/insightEngine/index.js";

const MINUTE = 60 * 1000;

function makeReadings(now, count = 6, startValue = 120) {
  const readings = [];
  for (let i = (count - 1) * 5; i >= 0; i -= 5) {
    readings.push({
      recorded_at: new Date(now - i * MINUTE).toISOString(),
      value: startValue + ((count - 1) * 5 - i),
      source: "dexcom",
    });
  }
  return readings;
}

const settings = {
  insulin_sensitivity_mgdl_per_unit: 50,
  meal_insulin_units_per_5g: 0.5,
  target_range_low: 70,
  target_range_high: 180,
};

describe("VALIDATION PASS", () => {
  const now = Date.now();

  // ── ITEM 3: High/low line geometry — zero-width at anchor, widening ──────
  describe("Item 3: band geometry", () => {
    test("3a: band is zero-width at the anchor (offset 0)", () => {
      const readings = makeReadings(now, 6, 120);
      const snap = normalizeInputs(readings, [], [], settings, now);
      const proj = projectGlucose(snap, {});
      const p0 = proj.trajectory[0];
      expect(p0.min_offset).toBe(0);
      expect(p0.lower).toBe(p0.value);
      expect(p0.upper).toBe(p0.value);
      expect(p0.upper - p0.lower).toBe(0);
    });

    test("3b: band widens monotonically from the anchor", () => {
      const readings = makeReadings(now, 6, 120);
      const snap = normalizeInputs(readings, [], [], settings, now);
      const proj = projectGlucose(snap, {});
      for (let i = 1; i < proj.trajectory.length; i++) {
        const w0 = proj.trajectory[i - 1].upper - proj.trajectory[i - 1].lower;
        const w1 = proj.trajectory[i].upper - proj.trajectory[i].lower;
        expect(w1).toBeGreaterThanOrEqual(w0 - 0.01);
      }
      // The last point should be meaningfully wider than the first
      const firstW = proj.trajectory[0].upper - proj.trajectory[0].lower;
      const lastW = proj.trajectory[proj.trajectory.length - 1].upper - proj.trajectory[proj.trajectory.length - 1].lower;
      expect(lastW).toBeGreaterThan(firstW + 5);
    });

    test("3c: band is zero-width at anchor even with meals active", () => {
      const readings = makeReadings(now, 6, 120);
      const meal = { food_name: "Rice", carbs: 45, consumed_at: new Date(now - 10 * MINUTE).toISOString(), absorption_profile: "fast", fat_grams: 0, protein_grams: 0 };
      const snap = normalizeInputs(readings, [meal], [], settings, now);
      const proj = projectGlucose(snap, {});
      const p0 = proj.trajectory[0];
      expect(p0.lower).toBe(p0.value);
      expect(p0.upper).toBe(p0.value);
    });
  });

  // ── ITEM 4: Close window when no meals ────────────────────────────────────
  describe("Item 4: close-window horizons", () => {
    test("4a: meals active → 60 min horizon (unchanged)", () => {
      const readings = makeReadings(now, 6, 120);
      const meal = { food_name: "Rice", carbs: 45, consumed_at: new Date(now - 10 * MINUTE).toISOString(), absorption_profile: "fast", fat_grams: 0, protein_grams: 0 };
      const snap = normalizeInputs(readings, [meal], [], settings, now);
      expect(resolveHorizonMin(snap)).toBe(60);
      const proj = projectGlucose(snap, {});
      expect(proj.horizonMinutes).toBe(60);
    });

    test("4b: no meals, dose active → 30 min close window", () => {
      const readings = makeReadings(now, 6, 120);
      const dose = { insulin_type: "NovoLog", units: 5, administered_at: new Date(now - 30 * MINUTE).toISOString() };
      const snap = normalizeInputs(readings, [], [dose], settings, now);
      expect(resolveHorizonMin(snap)).toBe(30);
      const proj = projectGlucose(snap, {});
      expect(proj.horizonMinutes).toBe(30);
    });

    test("4c: no meals, no dose → 20 min very-close window", () => {
      const readings = makeReadings(now, 6, 120);
      const snap = normalizeInputs(readings, [], [], settings, now);
      expect(resolveHorizonMin(snap)).toBe(20);
      const proj = projectGlucose(snap, {});
      expect(proj.horizonMinutes).toBe(20);
    });

    test("4d: explicit horizonMin override still respected (tests/replay)", () => {
      const readings = makeReadings(now, 6, 120);
      const snap = normalizeInputs(readings, [], [], settings, now);
      const proj = projectGlucose(snap, { horizonMin: 90 });
      expect(proj.horizonMinutes).toBe(90);
    });
  });

  // ── ITEM 2: New insulin/meal logs change the trajectory ──────────────────
  describe("Item 2: new logs change the trajectory", () => {
    test("2a: adding a dose changes the projected trajectory", () => {
      const readings = makeReadings(now, 6, 120);
      const meal = { food_name: "Rice", carbs: 45, consumed_at: new Date(now - 10 * MINUTE).toISOString(), absorption_profile: "fast", fat_grams: 0, protein_grams: 0 };
      const dose = { insulin_type: "NovoLog", units: 5, administered_at: new Date(now - 5 * MINUTE).toISOString() };

      const snapBefore = normalizeInputs(readings, [meal], [], settings, now);
      const projBefore = projectGlucose(snapBefore, {});

      const snapAfter = normalizeInputs(readings, [meal], [dose], settings, now);
      const projAfter = projectGlucose(snapAfter, {});

      let maxDiff = 0;
      for (let i = 0; i < Math.min(projBefore.trajectory.length, projAfter.trajectory.length); i++) {
        const d = Math.abs(projBefore.trajectory[i].value - projAfter.trajectory[i].value);
        if (d > maxDiff) maxDiff = d;
      }
      expect(maxDiff).toBeGreaterThan(2);
      expect(projAfter.inputProvenance.doseCount).toBe(1);
      expect(projAfter.activeInputs.doseCount).toBe(1);
    });

    test("2b: adding a meal changes the projected trajectory", () => {
      const readings = makeReadings(now, 6, 120);
      const dose = { insulin_type: "NovoLog", units: 3, administered_at: new Date(now - 5 * MINUTE).toISOString() };

      const snapBefore = normalizeInputs(readings, [], [dose], settings, now);
      const projBefore = projectGlucose(snapBefore, {});

      const meal = { food_name: "Rice", carbs: 45, consumed_at: new Date(now - 5 * MINUTE).toISOString(), absorption_profile: "fast", fat_grams: 0, protein_grams: 0 };
      const snapAfter = normalizeInputs(readings, [meal], [dose], settings, now);
      const projAfter = projectGlucose(snapAfter, {});

      let maxDiff = 0;
      for (let i = 0; i < Math.min(projBefore.trajectory.length, projAfter.trajectory.length); i++) {
        const d = Math.abs(projBefore.trajectory[i].value - projAfter.trajectory[i].value);
        if (d > maxDiff) maxDiff = d;
      }
      expect(maxDiff).toBeGreaterThan(5);
      expect(projAfter.inputProvenance.mealCount).toBe(1);
      expect(projAfter.activeInputs.mealCount).toBe(1);
    });

    test("2c: past-time dose still within DIA is included", () => {
      const readings = makeReadings(now, 6, 120);
      // Dose 1 hour ago, 5 units — DIA is 240 min for 5u, so still active
      const dose = { insulin_type: "NovoLog", units: 5, administered_at: new Date(now - 60 * MINUTE).toISOString() };
      const snap = normalizeInputs(readings, [], [dose], settings, now);
      const proj = projectGlucose(snap, {});
      expect(proj.activeInputs.doseCount).toBe(1);
      expect(proj.activeInputs.totalActiveInsulinUnits).toBeGreaterThan(0);
    });

    test("2d: fully-decayed past dose is NOT included", () => {
      const readings = makeReadings(now, 6, 120);
      // Dose 5 hours ago — beyond DIA, fully decayed
      const dose = { insulin_type: "NovoLog", units: 5, administered_at: new Date(now - 300 * MINUTE).toISOString() };
      const snap = normalizeInputs(readings, [], [dose], settings, now);
      const proj = projectGlucose(snap, {});
      expect(proj.activeInputs.doseCount).toBe(0);
    });
  });
});