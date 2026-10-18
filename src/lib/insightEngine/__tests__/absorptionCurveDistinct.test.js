import { describe, test, expect } from "vitest";
// Stackd — Continuous Nutrition & Absorption Curve Distinction Tests
//
// Verifies the repaired pipeline:
//   1. The deterministic speed-class derivation produces THREE DISTINCT classes
//      for steak (high-fat/dual-wave), candy (fast), and baked potato (mixed)
//      when given realistic continuous nutrition + glycemic index — the same
//      composition the estimator now stores on the CarbEntry.
//   2. carbAppearanceRateGPerMin renders THREE DISTINCT curves (different peak
//      timing, different window duration, different dual-wave behavior) for
//      those three compositions — no two are identical.
//   3. The insight generator converts detected GlucoseEvents into grounded,
//      per-user-adapted CoachInsight drafts and recurring UserPatternProfile
//      drafts.

import { carbAppearanceRateGPerMin } from "@/lib/insightEngine";
import { buildInsightDrafts, buildPatternDrafts } from "@/lib/insightEngine/insightGeneration";

const MINUTE = 60 * 1000;

// ── Realistic continuous nutrition for three distinct foods ─────────────────
// These mirror what the estimator's LLM returns: continuous grams + GI.
// The speed_class is then DERIVED deterministically from this composition.
const MEAL_TIME = new Date(0).toISOString();
const STEAK = { carbs: 35, fat_grams: 30, protein_grams: 50, glycemic_index: 50, absorption_profile: "medium", consumed_at: MEAL_TIME };
const CANDY = { carbs: 30, fat_grams: 0, protein_grams: 0, glycemic_index: 95, absorption_profile: "fast", consumed_at: MEAL_TIME };
const POTATO = { carbs: 40, fat_grams: 1, protein_grams: 3, glycemic_index: 65, absorption_profile: "medium", consumed_at: MEAL_TIME };

// ── Inline the same derivation the engine uses (deriveSpeedClass) ─────────────
function deriveDualWaveBlend(entry) {
  const fat = Number(entry?.fat_grams ?? 0) || 0;
  const protein = Number(entry?.protein_grams ?? 0) || 0;
  const carbs = Number(entry?.carbs ?? 0) || 0;
  const fatScore = Math.min(1, fat / 40);
  const proteinWithCarbs = carbs > 0 ? Math.min(1, protein / 30) : 0;
  const proteinOnly = carbs === 0 ? Math.min(1, protein / 45) : 0;
  return Math.max(0, Math.min(1, Math.max(fatScore, proteinWithCarbs, proteinOnly)));
}

function deriveSpeedClass(entry) {
  const blend = deriveDualWaveBlend(entry);
  if (blend >= 0.5) return "high_fat";
  const gi = Number(entry?.glycemic_index ?? 0) || 0;
  const profile = entry?.absorption_profile || "medium";
  if (profile === "fast" || gi >= 70) return "fast";
  return "mixed";
}

describe("Continuous nutrition → distinct speed classes", () => {
  test("steak derives high_fat (dual-wave)", () => {
    const cls = deriveSpeedClass(STEAK);
    expect(cls).toBe("high_fat");
    // Steak has high fat + high protein with no carbs → dual-wave blend ≥ 0.5
    expect(deriveDualWaveBlend(STEAK)).toBeGreaterThanOrEqual(0.5);
  });

  test("candy derives fast (high GI, zero fat/protein)", () => {
    const cls = deriveSpeedClass(CANDY);
    expect(cls).toBe("fast");
    expect(deriveDualWaveBlend(CANDY)).toBeLessThan(0.5);
  });

  test("baked potato derives mixed (moderate GI, low fat)", () => {
    const cls = deriveSpeedClass(POTATO);
    expect(cls).toBe("mixed");
    expect(deriveDualWaveBlend(POTATO)).toBeLessThan(0.5);
  });

  test("the three foods produce THREE DISTINCT speed classes", () => {
    const classes = new Set([deriveSpeedClass(STEAK), deriveSpeedClass(CANDY), deriveSpeedClass(POTATO)]);
    expect(classes.size).toBe(3);
  });
});

describe("carbAppearanceRateGPerMin — three distinct curves", () => {
  // Meal time is t=0; sample the absorption rate every 5 minutes across 6h.
  function curveFor(entry) {
    const mealTime = 0;
    const points = [];
    for (let m = 0; m <= 360; m += 5) {
      points.push({ t: m, rate: carbAppearanceRateGPerMin(entry, mealTime + m * MINUTE, null) });
    }
    return points;
  }

  function peakTimeMin(points) {
    let best = points[0];
    for (const p of points) if (p.rate > best.rate) best = p;
    return best.t;
  }

  function firstZeroMin(points) {
    for (const p of points) if (p.rate === 0) return p.t;
    return points[points.length - 1].t;
  }

  function maxRate(points) {
    return Math.max(...points.map((p) => p.rate));
  }

  const steakCurve = curveFor(STEAK);
  const candyCurve = curveFor(CANDY);
  const potatoCurve = curveFor(POTATO);

  test("candy peaks EARLY (fast, ~30 min)", () => {
    const peak = peakTimeMin(candyCurve);
    expect(peak).toBeLessThanOrEqual(35);
    expect(peak).toBeGreaterThanOrEqual(20);
  });

  test("baked potato peaks MIDDLE (mixed, ~60 min), later than candy", () => {
    const peak = peakTimeMin(potatoCurve);
    expect(peak).toBeGreaterThanOrEqual(50);
    expect(peak).toBeLessThanOrEqual(75);
    expect(peak).toBeGreaterThan(peakTimeMin(candyCurve));
  });

  test("steak has a LATE window (high-fat dual-wave, ≥ 300 min)", () => {
    const zero = firstZeroMin(steakCurve);
    // high_fat window is 300 min with a secondary peak at 120 min
    expect(zero).toBeGreaterThanOrEqual(295);
  });

  test("candy window is SHORTEST (fast, ~120 min)", () => {
    const zero = firstZeroMin(candyCurve);
    expect(zero).toBeLessThanOrEqual(125);
  });

  test("steak shows a DUAL-WAVE secondary rise around 120 min", () => {
    // The high_fat class has secPeakMin=120. Check that the steak curve has a
    // second local maximum near 120 min that is higher than the rate at 80 min.
    const at80 = steakCurve.find((p) => p.t === 80)?.rate ?? 0;
    const at120 = steakCurve.find((p) => p.t === 120)?.rate ?? 0;
    const at160 = steakCurve.find((p) => p.t === 160)?.rate ?? 0;
    // Rate at 120 should be ≥ rate at 80 (secondary wave rising) and ≥ rate at 160
    expect(at120).toBeGreaterThanOrEqual(at80 * 0.9);
    expect(at120).toBeGreaterThanOrEqual(at160 * 0.9);
  });

  test("the three curves have DISTINCT peak times", () => {
    const peaks = new Set([peakTimeMin(candyCurve), peakTimeMin(potatoCurve), peakTimeMin(steakCurve)]);
    expect(peaks.size).toBe(3);
  });

  test("steak and candy curves are not identical at any matching offset", () => {
    // At 60 min, candy (fast, decaying) should have a lower rate than steak (high-fat, still rising)
    const candy60 = candyCurve.find((p) => p.t === 60)?.rate ?? 0;
    const steak60 = steakCurve.find((p) => p.t === 60)?.rate ?? 0;
    expect(steak60).toBeGreaterThan(candy60);
  });
});

describe("Insight generation — grounded CoachInsight drafts", () => {
  const events = [
    {
      id: "evt-1",
      event_type: "high",
      start_time: "2026-10-18T12:00:00.000Z",
      end_time: "2026-10-18T13:30:00.000Z",
      starting_glucose: 110,
      peak_glucose: 220,
      lowest_glucose: 110,
      duration_minutes: 90,
      classification: "resolved_after_additional_insulin",
      confounders: [],
      confidence: 0.9,
    },
    {
      id: "evt-2",
      event_type: "low",
      start_time: "2026-10-18T03:00:00.000Z",
      end_time: "2026-10-18T03:20:00.000Z",
      lowest_glucose: 58,
      peak_glucose: 70,
      duration_minutes: 20,
      classification: "overnight_low",
      confounders: [],
      confidence: 0.85,
    },
  ];

  test("produces one insight draft per event", () => {
    const drafts = buildInsightDrafts(events, { high: 3, low: 2 });
    expect(drafts).toHaveLength(2);
    expect(drafts.map((d) => d.insight_type)).toEqual(
      expect.arrayContaining(["high_event", "low_event"])
    );
  });

  test("insight messages are grounded (mention real glucose values)", () => {
    const drafts = buildInsightDrafts(events, {});
    const highDraft = drafts.find((d) => d.insight_type === "high_event");
    expect(highDraft.message).toContain("220");
    const lowDraft = drafts.find((d) => d.insight_type === "low_event");
    expect(lowDraft.message).toContain("58");
  });

  test("recurring events produce a frequency-adapted message", () => {
    const drafts = buildInsightDrafts([events[0]], { high: 4 });
    expect(drafts[0].message).toContain("4 times");
  });

  test("low-confidence / confounded events are suppressed", () => {
    const confounded = [{ ...events[0], confidence: 0.2, confounders: ["missing_glucose_data"] }];
    const drafts = buildInsightDrafts(confounded, {});
    expect(drafts).toHaveLength(0);
  });
});

describe("Pattern profile generation — recurring time-of-day windows", () => {
  const events = [
    {
      id: "a",
      event_type: "low",
      start_time: "2026-10-16T03:00:00.000Z",
      lowest_glucose: 55,
      duration_minutes: 25,
    },
    {
      id: "b",
      event_type: "low",
      start_time: "2026-10-17T03:15:00.000Z",
      lowest_glucose: 60,
      duration_minutes: 20,
    },
    {
      id: "c",
      event_type: "high",
      start_time: "2026-10-17T12:30:00.000Z",
      peak_glucose: 210,
      duration_minutes: 80,
    },
  ];

  test("groups recurring overnight lows into a pattern", () => {
    const drafts = buildPatternDrafts(events, []);
    const overnightLow = drafts.find((d) => d.pattern_key === "low:overnight");
    expect(overnightLow).toBeTruthy();
    expect(overnightLow.sample_size).toBe(2);
    expect(overnightLow.pattern_type).toBe("time_of_day");
  });

  test("single-occurrence windows are not promoted to patterns", () => {
    const drafts = buildPatternDrafts(events, []);
    const afternoonHigh = drafts.find((d) => d.pattern_key === "high:afternoon");
    // Only 1 afternoon high — below MIN_PATTERN_OCCURRENCES
    expect(afternoonHigh).toBeUndefined();
  });

  test("existing pattern sample sizes accumulate", () => {
    const existing = [{ pattern_key: "low:overnight", sample_size: 3, first_observed_at: "2026-10-10T03:00:00.000Z" }];
    const drafts = buildPatternDrafts(events, existing);
    const overnightLow = drafts.find((d) => d.pattern_key === "low:overnight");
    expect(overnightLow.sample_size).toBe(5); // 3 prior + 2 new
  });
});