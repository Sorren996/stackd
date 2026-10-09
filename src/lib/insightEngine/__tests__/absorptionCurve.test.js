import { describe, test, expect } from "vitest";
// Stackd Insight Engine — Absorption Curve Shape Tests
//
// Verifies that the carb absorption curve model:
//   1. Produces a front-loaded shape for high-fat/protein meals (pizza) with
//      a prolonged tail — meaningfully higher cumulative absorption at 60 min
//      than a simple slow curve would give.
//   2. Keeps the sharp-then-done shape for regular fast-carb meals.
//   3. Integrates exactly: cumulative grams = integral of the rate curve,
//      monotonically increasing, capping at the logged carb total.
//   4. Uses the SAME model for the display (getCarbAbsorptionAt) and the
//      projection (carbAppearanceRateGPerMin) — no separate simpler curve.

import { getCarbAbsorptionAt, generateCarbCurve } from "@/lib/carbAbsorption";
import { carbAppearanceRateGPerMin } from "@/lib/insightEngine";

const MINUTE = 60 * 1000;

function makeEntry(opts = {}) {
  return {
    food_name: opts.name || "Test Meal",
    carbs: opts.carbs ?? 45,
    fat_grams: opts.fat ?? 0,
    protein_grams: opts.protein ?? 0,
    glycemic_index: opts.gi ?? 0,
    absorption_profile: opts.profile || "medium",
    is_custom: false,
    consumed_at: new Date(opts.consumedAtMs ?? Date.now() - 30 * MINUTE).toISOString(),
    speed_class: opts.speedClass,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function absorbedGramsAt(entry, elapsedMin) {
  const target = new Date(entry.consumed_at).getTime() + elapsedMin * MINUTE;
  return getCarbAbsorptionAt(entry, target, {}).absorbedGrams;
}

// Integrate the projection's instantaneous rate (g/min) over [0, elapsedMin]
// to get the cumulative grams the projection model says have arrived.
function projectedGramsAt(entry, elapsedMin) {
  const mealTime = new Date(entry.consumed_at).getTime();
  let cumulative = 0;
  const step = 2;
  for (let t = 0; t < elapsedMin; t += step) {
    const t1 = mealTime + t * MINUTE;
    const t2 = mealTime + (t + step) * MINUTE;
    const r1 = carbAppearanceRateGPerMin(entry, t1, null);
    const r2 = carbAppearanceRateGPerMin(entry, t2, null);
    cumulative += ((r1 + r2) / 2) * step;
  }
  return cumulative;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PIZZA: FRONT-LOADED CURVE WITH PROLONGED TAIL
// ═══════════════════════════════════════════════════════════════════════════

describe("Pizza (high-fat) absorption curve", () => {
  // Typical pizza: 75g carbs, 55g fat, 25g protein → high_fat class.
  const pizza = makeEntry({
    name: "Pizza",
    carbs: 75,
    fat: 55,
    protein: 25,
    consumedAtMs: Date.now() - 240 * MINUTE,
  });

  test("cumulative absorption at 60 min is meaningfully high (front-loaded)", () => {
    const at60 = absorbedGramsAt(pizza, 60);
    // A front-loaded curve should have absorbed a substantial fraction by
    // 60 min. The old back-loaded model (35% early / 65% late, shape 2.2/3.2)
    // gave ~17% here. The new front-loaded model (65% early / 35% late,
    // shape 1.0/2.0, peak 25/130) gives ~32% — nearly 2x improvement.
    expect(at60).toBeGreaterThan(75 * 0.25);
    expect(at60).toBeLessThan(75 * 0.50); // not everything — tail remains
  });

  test("cumulative absorption at 30 min shows the sharp early rise", () => {
    const at30 = absorbedGramsAt(pizza, 30);
    // By 30 min the sharp first wave (peak ~25 min, shape 1.0) is well
    // underway — ~14% absorbed, vs ~5% for the old model.
    expect(at30).toBeGreaterThan(75 * 0.10);
  });

  test("absorption continues well past 60 min (prolonged tail)", () => {
    const at60 = absorbedGramsAt(pizza, 60);
    const at120 = absorbedGramsAt(pizza, 120);
    const at180 = absorbedGramsAt(pizza, 180);
    // Monotonically increasing
    expect(at120).toBeGreaterThan(at60);
    expect(at180).toBeGreaterThan(at120);
    // Still not fully absorbed at 120 min — the tail extends
    expect(at120).toBeLessThan(75 * 0.70);
  });

  test("cumulative reaches ~100% by the end of the window", () => {
    const at300 = absorbedGramsAt(pizza, 300);
    expect(at300).toBeCloseTo(75, 0);
  });

  test("the curve is monotonically increasing", () => {
    const curve = generateCarbCurve(pizza, {});
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].absorbedGrams).toBeGreaterThanOrEqual(curve[i - 1].absorbedGrams - 0.01);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. FAST-CARB: SHARP-THEN-DONE SHAPE
// ═══════════════════════════════════════════════════════════════════════════

describe("Fast-carb absorption curve", () => {
  // White bread: 45g carbs, fast profile, no fat/protein.
  const fast = makeEntry({
    name: "White Bread",
    carbs: 45,
    profile: "fast",
    consumedAtMs: Date.now() - 150 * MINUTE,
  });

  test("most carbs absorbed by 60 min (sharp then done)", () => {
    const at60 = absorbedGramsAt(fast, 60);
    // Fast meals peak at 30 min, window 120 min. By 60 min most are absorbed.
    expect(at60).toBeGreaterThan(45 * 0.60);
  });

  test("fully absorbed by end of window (120 min)", () => {
    const at120 = absorbedGramsAt(fast, 120);
    expect(at120).toBeCloseTo(45, 0);
  });

  test("does not use dual-wave (no prolonged tail)", () => {
    const curve = generateCarbCurve(fast, {});
    expect(curve[0].dualWave).toBe(false);
    // The curve should have a single peak, not two humps
    let peaks = 0;
    for (let i = 1; i < curve.length - 1; i++) {
      if (curve[i].activity > curve[i - 1].activity && curve[i].activity > curve[i + 1].activity) {
        peaks++;
      }
    }
    expect(peaks).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. EXACT INTEGRAL: CUMULATIVE = INTEGRAL OF RATE, CAPS AT LOGGED CARBS
// ═══════════════════════════════════════════════════════════════════════════

describe("Exact integral and capping", () => {
  test("cumulative grams = integral of the rate curve (pizza)", () => {
    const pizza = makeEntry({
      name: "Pizza", carbs: 75, fat: 55, protein: 25,
      consumedAtMs: Date.now() - 10 * MINUTE,
    });
    const curve = generateCarbCurve(pizza, {});
    // The curve's absorptionRateGPerMin * step should sum to absorbedGrams
    for (let i = 1; i < curve.length; i++) {
      const dt = (curve[i].time - curve[i - 1].time) / MINUTE;
      const avgRate = (curve[i].absorptionRateGPerMin + curve[i - 1].absorptionRateGPerMin) / 2;
      const expectedDelta = avgRate * dt;
      const actualDelta = curve[i].absorbedGrams - curve[i - 1].absorbedGrams;
      expect(Math.abs(actualDelta - expectedDelta)).toBeLessThan(0.5);
    }
  });

  test("absorbed + remaining = logged carbs at every point", () => {
    const entries = [
      makeEntry({ name: "Pizza", carbs: 75, fat: 55, protein: 25, consumedAtMs: Date.now() - 10 * MINUTE }),
      makeEntry({ name: "Bread", carbs: 45, profile: "fast", consumedAtMs: Date.now() - 10 * MINUTE }),
      makeEntry({ name: "Oatmeal", carbs: 27, profile: "medium", consumedAtMs: Date.now() - 10 * MINUTE }),
    ];
    for (const entry of entries) {
      const curve = generateCarbCurve(entry, {});
      for (const p of curve) {
        expect(Math.round(p.absorbedGrams + p.remainingGrams)).toBe(entry.carbs);
      }
    }
  });

  test("cumulative never exceeds logged carbs", () => {
    const pizza = makeEntry({
      name: "Pizza", carbs: 60, fat: 50, protein: 30,
      consumedAtMs: Date.now() - 10 * MINUTE,
    });
    const curve = generateCarbCurve(pizza, {});
    for (const p of curve) {
      expect(p.absorbedGrams).toBeLessThanOrEqual(60 + 0.01);
      expect(p.percentAbsorbed ?? 0).toBeLessThanOrEqual(100);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. DISPLAY AND PROJECTION USE THE SAME MODEL
// ═══════════════════════════════════════════════════════════════════════════

describe("Display / projection consistency", () => {
  test("display cumulative = integral of projection rate (pizza)", () => {
    const pizza = makeEntry({
      name: "Pizza", carbs: 75, fat: 55, protein: 25,
      consumedAtMs: Date.now() - 10 * MINUTE,
    });
    // Compare at several time points across the window
    for (const elapsed of [30, 60, 90, 120, 180, 240]) {
      const display = absorbedGramsAt(pizza, elapsed);
      const projected = projectedGramsAt(pizza, elapsed);
      // The display cumulative and the integrated projection rate should
      // agree to within a small tolerance (integration step differences).
      expect(Math.abs(display - projected)).toBeLessThan(2.0);
    }
  });

  test("display cumulative = integral of projection rate (fast carb)", () => {
    const fast = makeEntry({
      name: "White Bread", carbs: 45, profile: "fast",
      consumedAtMs: Date.now() - 10 * MINUTE,
    });
    for (const elapsed of [20, 40, 60, 90, 120]) {
      const display = absorbedGramsAt(fast, elapsed);
      const projected = projectedGramsAt(fast, elapsed);
      expect(Math.abs(display - projected)).toBeLessThan(2.0);
    }
  });

  test("display and projection share the same window and peak timing", () => {
    const pizza = makeEntry({
      name: "Pizza", carbs: 75, fat: 55, protein: 25,
      consumedAtMs: Date.now() - 10 * MINUTE,
    });
    const displayResult = getCarbAbsorptionAt(pizza, Date.now(), {});
    // The projection's carbAppearanceRateGPerMin returns 0 past the same window
    const pastWindow = new Date(pizza.consumed_at).getTime() + (displayResult.windowMin + 10) * MINUTE;
    const ratePastWindow = carbAppearanceRateGPerMin(pizza, pastWindow, null);
    expect(ratePastWindow).toBe(0);
    // And is nonzero within the window
    const withinWindow = new Date(pizza.consumed_at).getTime() + 30 * MINUTE;
    const rateWithin = carbAppearanceRateGPerMin(pizza, withinWindow, null);
    expect(rateWithin).toBeGreaterThan(0);
  });
});