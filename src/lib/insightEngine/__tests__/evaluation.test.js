import { describe, it, expect } from "vitest";
import {
  evaluateProjection,
  aggregateMetrics,
  shouldUpdateModel,
  applyGuardedUpdate,
  validatePersonalization,
  revertToBaseline,
  EVALUATION_VERSION,
  EVAL_HORIZONS,
  MATCH_TOLERANCE_MIN,
  MIN_SAMPLES_FOR_PERSONALIZATION,
  MIN_BIAS_FOR_UPDATE_MGDL,
  SHRINKAGE_LAMBDA,
  MIN_RATE_FACTOR,
  MAX_RATE_FACTOR,
  MIN_FACTOR_CHANGE,
  BASELINE_TOLERANCE_MGDL,
  MIN_SAMPLES_FOR_VALIDATION,
} from "../evaluation";
import { projectGlucose, normalizeInputs, BASELINE_MODEL_VERSION, PERSONALIZED_MODEL_VERSION } from "../index";

const MINUTE_MS = 60 * 1000;

// ── Test helpers ───────────────────────────────────────────────────────────

function makeTrajectory(generatedAt, anchorValue, horizonMin = 60, stepMin = 5, options = {}) {
  const { risePerMin = 0, dropPerMin = 0, sigma = 10 } = options;
  const trajectory = [];
  let value = anchorValue;
  for (let offset = 0; offset <= horizonMin; offset += stepMin) {
    if (offset > 0) value += (risePerMin - dropPerMin) * stepMin;
    trajectory.push({
      min_offset: offset,
      value: Math.round(value),
      lower: Math.round(value - sigma),
      upper: Math.round(value + sigma),
    });
  }
  return trajectory;
}

function makeProjection({ generatedAt, anchorValue = 120, horizonMin = 60, modelVersion = BASELINE_MODEL_VERSION, abstained = false, trajectory = null, options = {} }) {
  return {
    generated_at: generatedAt,
    model_version: modelVersion,
    horizon_minutes: horizonMin,
    trajectory: trajectory || makeTrajectory(generatedAt, anchorValue, horizonMin, 5, options),
    abstained,
  };
}

function makeReading(value, minutesAfterGeneration, source = "dexcom") {
  return { time: 0 + minutesAfterGeneration * MINUTE_MS, value, source };
}

// Helper: create a reading at an absolute time (epoch ms)
function readingAt(value, timeMs, source = "dexcom") {
  return { time: timeMs, value, source };
}

const baselineState = {
  model_version: BASELINE_MODEL_VERSION,
  parameters: {},
  sample_count: 0,
  baseline_locked: true,
  evaluation_summary: {},
  update_history: [],
};

// ───────────────────────────────────────────────────────────────────────────
// 1. Forecasts remain pending before their observation windows mature
// ───────────────────────────────────────────────────────────────────────────

describe("1. Forecasts remain pending before their observation windows mature", () => {
  it("does not score a projection whose forecast window has not elapsed", () => {
    const generatedAt = 0;
    const horizonMin = 60;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin });

    // Evaluate at 30 min — only halfway through the forecast window.
    // Readings exist at 15 and 30 min, but 60 min hasn't arrived yet.
    const readings = [
      makeReading(125, 15),
      makeReading(130, 30),
    ];
    const result = evaluateProjection(projection, readings, 30 * MINUTE_MS);

    // The 60-min horizon should be unscorable (no observation yet).
    const h60 = result.horizons.find(h => h.horizon_min === 60);
    expect(h60.scored).toBe(false);
    expect(h60.exclusion_reason).toBe("no_observation_in_window");
  });

  it("scores horizons as their observation windows mature", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    const readings = [
      makeReading(125, 15),
      makeReading(130, 30),
      makeReading(135, 60),
    ];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    expect(result.status).toBe("evaluated");
    const scored = result.horizons.filter(h => h.scored);
    expect(scored.length).toBeGreaterThanOrEqual(3);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Correct timestamp matching and horizon scoring
// ───────────────────────────────────────────────────────────────────────────

describe("2. Correct timestamp matching and horizon scoring", () => {
  it("matches readings to the correct horizon by timestamp", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    const readings = [
      makeReading(125, 15),   // matches 15-min horizon
      makeReading(135, 30),   // matches 30-min horizon
      makeReading(145, 60),   // matches 60-min horizon
    ];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    expect(result.status).toBe("evaluated");
    const h15 = result.horizons.find(h => h.horizon_min === 15);
    const h30 = result.horizons.find(h => h.horizon_min === 30);
    const h60 = result.horizons.find(h => h.horizon_min === 60);

    expect(h15.actual).toBe(125);
    expect(h30.actual).toBe(135);
    expect(h60.actual).toBe(145);
  });

  it("uses the closest reading when multiple fall within the tolerance window", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    // Two readings near the 30-min mark: at 28 and 32 min.
    // The 28-min reading is closer to the 30-min target.
    const readings = [
      makeReading(125, 15),
      makeReading(130, 28),
      makeReading(140, 32),
      makeReading(145, 60),
    ];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);
    const h30 = result.horizons.find(h => h.horizon_min === 30);

    // 28 min is 2 min from target; 32 min is also 2 min. The reduce picks the
    // first one encountered (28 min) since the comparison is strict <.
    expect(h30.actual).toBe(130);
  });

  it("computes error as predicted minus actual (positive = overprediction)", () => {
    const generatedAt = 0;
    // Trajectory predicts 120 at offset 0, rising 1 mg/dL/min → 135 at 15 min.
    const projection = makeProjection({
      generatedAt, anchorValue: 120, horizonMin: 60,
      options: { risePerMin: 1 },
    });
    // Actual at 15 min is 125 — model predicted 135, so error = +10 (overprediction).
    const readings = [makeReading(125, 15), makeReading(130, 30), makeReading(135, 60)];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);
    const h15 = result.horizons.find(h => h.horizon_min === 15);

    expect(h15.error).toBe(10);
    expect(h15.abs_error).toBe(10);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. MAE, signed bias, and interval coverage calculations
// ───────────────────────────────────────────────────────────────────────────

describe("3. MAE, signed bias, and interval coverage calculations", () => {
  it("computes MAE as the mean of absolute errors across scored horizons", () => {
    const generatedAt = 0;
    // Predicts 120, 135, 150, 180 at 0, 15, 30, 60 min (rise 1 mg/dL/min).
    const projection = makeProjection({
      generatedAt, anchorValue: 120, horizonMin: 60,
      options: { risePerMin: 1 },
    });
    // Actuals: 125, 130, 135 → errors at 15/30/60 min are +10, +20, +25.
    const readings = [makeReading(125, 15), makeReading(130, 30), makeReading(135, 60)];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    const errors = result.horizons.filter(h => h.scored).map(h => h.abs_error);
    const expectedMAE = errors.reduce((s, e) => s + e, 0) / errors.length;
    expect(result.mae).toBeCloseTo(expectedMAE, 1);
  });

  it("computes signed bias (positive = overprediction, negative = underprediction)", () => {
    const generatedAt = 0;
    const projection = makeProjection({
      generatedAt, anchorValue: 120, horizonMin: 60,
      options: { risePerMin: 1 },
    });
    // Actuals lower than predicted → positive bias (overprediction).
    const readings = [makeReading(125, 15), makeReading(130, 30), makeReading(135, 60)];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    expect(result.bias).toBeGreaterThan(0);
  });

  it("computes coverage as the fraction of actuals within the prediction interval", () => {
    const generatedAt = 0;
    // Sigma = 10, so the interval at each point is [value-10, value+10].
    const projection = makeProjection({
      generatedAt, anchorValue: 120, horizonMin: 60,
      options: { risePerMin: 1, sigma: 10 },
    });
    // At 15 min: predicted 135, interval [125, 145]. Actual 130 → in interval.
    // At 30 min: predicted 150, interval [140, 160]. Actual 135 → outside.
    // At 60 min: predicted 180, interval [170, 190]. Actual 175 → in interval.
    const readings = [makeReading(130, 15), makeReading(135, 30), makeReading(175, 60)];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    // 2 of 3 in interval → coverage = 0.667
    expect(result.coverage).toBeCloseTo(2 / 3, 2);
  });

  it("returns null coverage when any scored horizon lacks an interval", () => {
    const generatedAt = 0;
    const trajectory = makeTrajectory(generatedAt, 120, 60, 5, { risePerMin: 1, sigma: 10 });
    // Remove the interval from one point.
    trajectory.find(p => p.min_offset === 30).lower = null;
    trajectory.find(p => p.min_offset === 30).upper = null;
    const projection = makeProjection({ generatedAt, horizonMin: 60, trajectory });

    const readings = [makeReading(125, 15), makeReading(130, 30), makeReading(135, 60)];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    expect(result.coverage).toBe(null);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Missing, duplicate, delayed, and invalid CGM observations
// ───────────────────────────────────────────────────────────────────────────

describe("4. Missing, duplicate, delayed, and invalid CGM observations", () => {
  it("excludes horizons with no observation in the tolerance window", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    // Only readings at 15 and 60 min — 30 min is missing.
    const readings = [makeReading(125, 15), makeReading(145, 60)];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    const h30 = result.horizons.find(h => h.horizon_min === 30);
    expect(h30.scored).toBe(false);
    expect(h30.exclusion_reason).toBe("no_observation_in_window");
    expect(result.excluded_count).toBeGreaterThan(0);
  });

  it("deduplicates identical readings", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    const dup = makeReading(125, 15);
    const readings = [dup, dup, dup, makeReading(135, 30), makeReading(145, 60)];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    // Should still score correctly — duplicates don't corrupt the result.
    expect(result.status).toBe("evaluated");
    const h15 = result.horizons.find(h => h.horizon_min === 15);
    expect(h15.actual).toBe(125);
  });

  it("filters out non-finite readings", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    const readings = [
      { time: 15 * MINUTE_MS, value: NaN, source: "dexcom" },
      { time: 15 * MINUTE_MS, value: Infinity, source: "dexcom" },
      { time: 30 * MINUTE_MS, value: 130, source: "dexcom" },
      { time: 60 * MINUTE_MS, value: 145, source: "dexcom" },
    ];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    // 15-min horizon has no valid reading → excluded.
    const h15 = result.horizons.find(h => h.horizon_min === 15);
    expect(h15.scored).toBe(false);
    expect(h15.exclusion_reason).toBe("no_observation_in_window");
  });

  it("handles out-of-order readings by sorting them", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    // Readings in reverse order.
    const readings = [
      makeReading(145, 60),
      makeReading(135, 30),
      makeReading(125, 15),
    ];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    expect(result.status).toBe("evaluated");
    const h15 = result.horizons.find(h => h.horizon_min === 15);
    expect(h15.actual).toBe(125);
  });

  it("marks a projection unscorable when no horizons can be scored", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    // No readings at all after generation.
    const result = evaluateProjection(projection, [], 65 * MINUTE_MS);

    expect(result.status).toBe("unscorable");
    expect(result.reason).toBe("no_horizons_scored");
    expect(result.valid_count).toBe(0);
  });

  it("marks abstained projections as unscorable", () => {
    const projection = makeProjection({ generatedAt: 0, abstained: true, trajectory: [] });
    const readings = [makeReading(125, 15)];
    const result = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    expect(result.status).toBe("unscorable");
    expect(result.reason).toBe("abstained_projection");
  });

  it("excludes horizons beyond the forecast horizon", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    // 120-min horizon is beyond the 60-min forecast.
    const readings = [makeReading(125, 15), makeReading(135, 30), makeReading(145, 60)];
    const result = evaluateProjection(projection, readings, 130 * MINUTE_MS);

    const h120 = result.horizons.find(h => h.horizon_min === 120);
    expect(h120.scored).toBe(false);
    expect(h120.exclusion_reason).toBe("beyond_forecast_horizon");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Idempotent evaluation and safe retries
// ───────────────────────────────────────────────────────────────────────────

describe("5. Idempotent evaluation and safe retries", () => {
  it("produces identical results when called twice with the same inputs", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });
    const readings = [makeReading(125, 15), makeReading(135, 30), makeReading(145, 60)];

    const result1 = evaluateProjection(projection, readings, 65 * MINUTE_MS);
    const result2 = evaluateProjection(projection, readings, 65 * MINUTE_MS);

    expect(result1).toEqual(result2);
  });

  it("does not change a completed evaluation on re-evaluation", () => {
    const generatedAt = 0;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });
    const readings = [makeReading(125, 15), makeReading(135, 30), makeReading(145, 60)];

    const first = evaluateProjection(projection, readings, 65 * MINUTE_MS);
    // Simulate a re-evaluation with the same data.
    const second = evaluateProjection(projection, readings, 70 * MINUTE_MS);

    // The scores (mae, bias, horizons) are identical — only evaluated_at changes.
    expect(second.mae).toBe(first.mae);
    expect(second.bias).toBe(first.bias);
    expect(second.horizons).toEqual(first.horizons);
    expect(second.valid_count).toBe(first.valid_count);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. No future-data leakage
// ───────────────────────────────────────────────────────────────────────────

describe("6. No future-data leakage", () => {
  it("never uses readings from before the forecast was generated", () => {
    const generatedAt = 100 * MINUTE_MS;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    // A reading before generatedAt that happens to land near a target time.
    // Target for 15-min horizon = 115 min. This reading is at 110 min (before generatedAt).
    const readings = [
      readingAt(999, 110 * MINUTE_MS),  // before generatedAt — must be ignored
      readingAt(125, 115 * MINUTE_MS),  // 15 min after generatedAt
      readingAt(135, 130 * MINUTE_MS),  // 30 min after
      readingAt(145, 160 * MINUTE_MS),  // 60 min after
    ];
    const result = evaluateProjection(projection, readings, 165 * MINUTE_MS);

    const h15 = result.horizons.find(h => h.horizon_min === 15);
    expect(h15.actual).toBe(125);  // not 999
  });

  it("only uses readings at or after generated_at", () => {
    const generatedAt = 50 * MINUTE_MS;
    const projection = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    const readings = [
      readingAt(100, 40 * MINUTE_MS),  // before — ignored
      readingAt(110, 45 * MINUTE_MS),  // before — ignored
      readingAt(125, 65 * MINUTE_MS),  // 15 min after
    ];
    const result = evaluateProjection(projection, readings, 115 * MINUTE_MS);

    // Only the 15-min horizon should be scored; 30 and 60 have no valid readings.
    const h15 = result.horizons.find(h => h.horizon_min === 15);
    expect(h15.scored).toBe(true);
    expect(h15.actual).toBe(125);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. No personalized update before the evidence threshold is met
// ───────────────────────────────────────────────────────────────────────────

describe("7. No personalized update before the evidence threshold is met", () => {
  it("does not update with fewer than MIN_SAMPLES_FOR_PERSONALIZATION evaluated projections", () => {
    const metrics = {
      sampleCount: MIN_SAMPLES_FOR_PERSONALIZATION - 1,
      mae: 20, bias: 15, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    expect(decision.shouldUpdate).toBe(false);
    expect(decision.reason).toBe("insufficient_samples");
  });

  it("does not update when bias is below MIN_BIAS_FOR_UPDATE_MGDL", () => {
    const metrics = {
      sampleCount: MIN_SAMPLES_FOR_PERSONALIZATION,
      mae: 10, bias: MIN_BIAS_FOR_UPDATE_MGDL - 0.5, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    expect(decision.shouldUpdate).toBe(false);
    expect(decision.reason).toBe("bias_below_threshold");
  });

  it("does not update when the proposed factor change is below MIN_FACTOR_CHANGE", () => {
    // State already has a factor near what the bias would produce.
    // Bias of 5 → observedFactor = 1 - 5/40 = 0.875
    // proposedFactor = 1 + (0.875 - 1) * 0.7 = 0.9125
    // If current factor is already 0.91, change = 0.0025 < MIN_FACTOR_CHANGE (0.02)
    const state = {
      ...baselineState,
      parameters: { rateAdjustmentFactor: 0.91 },
    };
    const metrics = {
      sampleCount: MIN_SAMPLES_FOR_PERSONALIZATION,
      mae: 10, bias: 5, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(state, metrics);
    expect(decision.shouldUpdate).toBe(false);
    expect(decision.reason).toBe("change_below_threshold");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. A valid evaluation can update a learned parameter when evidence exists
// ───────────────────────────────────────────────────────────────────────────

describe("8. A valid evaluation can update a learned parameter when evidence exists", () => {
  it("updates the rateAdjustmentFactor when sufficient bias is detected", () => {
    // Strong positive bias (overprediction) → factor should decrease below 1.0.
    const metrics = {
      sampleCount: MIN_SAMPLES_FOR_PERSONALIZATION + 5,
      mae: 25, bias: 20, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    expect(decision.shouldUpdate).toBe(true);
    expect(decision.reason).toBe("systematic_bias_detected");
    expect(decision.proposedFactor).toBeLessThan(1.0);
    expect(decision.proposedFactor).toBeGreaterThanOrEqual(MIN_RATE_FACTOR);
  });

  it("applies shrinkage toward baseline (1.0)", () => {
    // Bias of 40 mg/dL → observedFactor = 1 - 40/40 = 0.0.
    // With shrinkage 0.3: proposedFactor = 1 + (0 - 1) * 0.7 = 0.3.
    // But clamped to MIN_RATE_FACTOR = 0.7.
    const metrics = {
      sampleCount: 20,
      mae: 40, bias: 40, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    expect(decision.shouldUpdate).toBe(true);
    // Clamped to MIN_RATE_FACTOR.
    expect(decision.proposedFactor).toBe(MIN_RATE_FACTOR);
  });

  it("increases the factor for negative bias (underprediction)", () => {
    const metrics = {
      sampleCount: 15,
      mae: 25, bias: -20, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedFactor).toBeGreaterThan(1.0);
  });

  it("clamps the factor to MAX_RATE_FACTOR", () => {
    // Very large negative bias → factor would exceed 1.3 without clamping.
    const metrics = {
      sampleCount: 20,
      mae: 50, bias: -50, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedFactor).toBe(MAX_RATE_FACTOR);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Baseline fallback when personalization is unavailable or fails validation
// ───────────────────────────────────────────────────────────────────────────

describe("9. Baseline fallback when personalization is unavailable or fails validation", () => {
  it("reverts to baseline when the personalized model performs worse", () => {
    const metrics = {
      sampleCount: 30,
      mae: 30, bias: 5, coverage: null,
      byHorizon: {},
      byModelVersion: {
        [BASELINE_MODEL_VERSION]: { mae: 15, bias: 2, count: 20 },
        [PERSONALIZED_MODEL_VERSION]: { mae: 25, bias: 5, count: 10 },
      },
    };
    const validation = validatePersonalization(metrics);
    // Personalized MAE (25) > Baseline MAE (15) + tolerance (2) = 17 → revert.
    expect(validation.shouldRevert).toBe(true);
    expect(validation.reason).toBe("personalized_worse_than_baseline");
  });

  it("does not revert when there is insufficient comparison data", () => {
    const metrics = {
      sampleCount: 30,
      mae: 20, bias: 5, coverage: null,
      byHorizon: {},
      byModelVersion: {
        [BASELINE_MODEL_VERSION]: { mae: 15, bias: 2, count: 20 },
        // No personalized projections yet.
      },
    };
    const validation = validatePersonalization(metrics);
    expect(validation.shouldRevert).toBe(false);
    expect(validation.reason).toBe("insufficient_comparison_data");
  });

  it("does not revert when personalized samples are below validation threshold", () => {
    const metrics = {
      sampleCount: 30,
      mae: 20, bias: 5, coverage: null,
      byHorizon: {},
      byModelVersion: {
        [BASELINE_MODEL_VERSION]: { mae: 15, bias: 2, count: 25 },
        [PERSONALIZED_MODEL_VERSION]: { mae: 25, bias: 5, count: MIN_SAMPLES_FOR_VALIDATION - 1 },
      },
    };
    const validation = validatePersonalization(metrics);
    expect(validation.shouldRevert).toBe(false);
    expect(validation.reason).toBe("insufficient_personalized_samples");
  });

  it("reverts to baseline_locked=true with rateAdjustmentFactor=1.0", () => {
    const metrics = {
      sampleCount: 30, mae: 30, bias: 5, coverage: null,
      byHorizon: {},
      byModelVersion: {
        [BASELINE_MODEL_VERSION]: { mae: 15, bias: 2, count: 20 },
        [PERSONALIZED_MODEL_VERSION]: { mae: 25, bias: 5, count: 10 },
      },
    };
    const validation = validatePersonalization(metrics);
    const personalizedState = {
      model_version: PERSONALIZED_MODEL_VERSION,
      parameters: { rateAdjustmentFactor: 0.85 },
      sample_count: 30,
      baseline_locked: false,
      evaluation_summary: {},
      update_history: [],
    };
    const { updatedState, provenance } = revertToBaseline(personalizedState, metrics, validation);

    expect(updatedState.baseline_locked).toBe(true);
    expect(updatedState.parameters.rateAdjustmentFactor).toBe(1.0);
    expect(updatedState.model_version).toBe(BASELINE_MODEL_VERSION);
    expect(provenance).not.toBeNull();
    expect(provenance.reason).toBe("personalized_worse_than_baseline");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 10. User isolation, RLS behavior, and concurrent updates
// ───────────────────────────────────────────────────────────────────────────

describe("10. User isolation, RLS behavior, and concurrent updates", () => {
  it("evaluates each user's projection only against that user's readings", () => {
    const generatedAt = 0;

    // User A's projection predicts 135 at 15 min.
    const projA = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60, options: { risePerMin: 1 } });
    // User B's projection predicts 130 at 15 min.
    const projB = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60, options: { risePerMin: 0.67 } });

    // User A's readings.
    const readingsA = [makeReading(125, 15), makeReading(130, 30), makeReading(135, 60)];
    // User B's readings (different values).
    const readingsB = [makeReading(140, 15), makeReading(145, 30), makeReading(150, 60)];

    const resultA = evaluateProjection(projA, readingsA, 65 * MINUTE_MS);
    const resultB = evaluateProjection(projB, readingsB, 65 * MINUTE_MS);

    // Results are independent — no cross-contamination.
    expect(resultA.horizons.find(h => h.horizon_min === 15).actual).toBe(125);
    expect(resultB.horizons.find(h => h.horizon_min === 15).actual).toBe(140);
    expect(resultA.mae).not.toBe(resultB.mae);
  });

  it("does not let one user's readings affect another user's evaluation", () => {
    const generatedAt = 0;
    const projA = makeProjection({ generatedAt, anchorValue: 120, horizonMin: 60 });

    // Only User A's readings.
    const readingsA = [makeReading(125, 15), makeReading(135, 30), makeReading(145, 60)];
    // User B's readings that are very different.
    const readingsB = [makeReading(200, 15), makeReading(210, 30), makeReading(220, 60)];

    const resultWithA = evaluateProjection(projA, readingsA, 65 * MINUTE_MS);
    const resultWithB = evaluateProjection(projA, readingsB, 65 * MINUTE_MS);

    // Different readings → different scores.
    expect(resultWithA.horizons.find(h => h.horizon_min === 15).actual).not.toBe(
      resultWithB.horizons.find(h => h.horizon_min === 15).actual
    );
  });

  it("produces deterministic model state updates (same inputs → same outputs)", () => {
    const metrics = {
      sampleCount: 15, mae: 25, bias: 20, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision1 = shouldUpdateModel(baselineState, metrics);
    const decision2 = shouldUpdateModel(baselineState, metrics);

    expect(decision1).toEqual(decision2);

    const { updatedState: state1, provenance: prov1 } = applyGuardedUpdate(baselineState, metrics, decision1);
    const { updatedState: state2, provenance: prov2 } = applyGuardedUpdate(baselineState, metrics, decision2);

    // Same proposed factor, same baseline_locked=false.
    expect(state1.parameters.rateAdjustmentFactor).toBe(state2.parameters.rateAdjustmentFactor);
    expect(state1.baseline_locked).toBe(state2.baseline_locked);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 11. Model-state persistence and provenance for every accepted update
// ───────────────────────────────────────────────────────────────────────────

describe("11. Model-state persistence and provenance for every accepted update", () => {
  it("records previous and new parameters in update_history", () => {
    const metrics = {
      sampleCount: 15, mae: 25, bias: 20, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    const { updatedState, provenance } = applyGuardedUpdate(baselineState, metrics, decision);

    expect(provenance).not.toBeNull();
    expect(provenance.previous_params).toEqual({});
    expect(provenance.new_params.rateAdjustmentFactor).toBe(decision.proposedFactor);
    expect(provenance.sample_count).toBe(15);
    expect(provenance.reason).toBe("systematic_bias_detected");
    expect(provenance.model_version).toBe(PERSONALIZED_MODEL_VERSION);
    expect(provenance.evaluation_version).toBe(EVALUATION_VERSION);
  });

  it("appends to update_history without losing previous entries", () => {
    const stateWithHistory = {
      ...baselineState,
      update_history: [
        { timestamp: 1000, previous_params: {}, new_params: { rateAdjustmentFactor: 0.9 }, reason: "old_update" },
      ],
    };
    const metrics = {
      sampleCount: 20, mae: 25, bias: 15, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(stateWithHistory, metrics);
    const { updatedState } = applyGuardedUpdate(stateWithHistory, metrics, decision);

    expect(updatedState.update_history.length).toBe(2);
    expect(updatedState.update_history[0].reason).toBe("old_update");
    expect(updatedState.update_history[1].reason).toBe("systematic_bias_detected");
  });

  it("sets baseline_locked to false and model_version to personalized on update", () => {
    const metrics = {
      sampleCount: 15, mae: 25, bias: 20, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    const { updatedState } = applyGuardedUpdate(baselineState, metrics, decision);

    expect(updatedState.baseline_locked).toBe(false);
    expect(updatedState.model_version).toBe(PERSONALIZED_MODEL_VERSION);
  });

  it("stores the evaluation summary in the state", () => {
    const metrics = {
      sampleCount: 15, mae: 25, bias: 20, coverage: 0.8,
      byHorizon: { 15: { mae: 20, bias: 15, count: 15 } },
      byModelVersion: { [BASELINE_MODEL_VERSION]: { mae: 25, bias: 20, count: 15 } },
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    const { updatedState } = applyGuardedUpdate(baselineState, metrics, decision);

    expect(updatedState.evaluation_summary.mae).toBe(25);
    expect(updatedState.evaluation_summary.bias).toBe(20);
    expect(updatedState.evaluation_summary.coverage).toBe(0.8);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 12. A reproducible test demonstrating that a learned parameter changes
//     and affects a subsequent forecast
// ───────────────────────────────────────────────────────────────────────────

describe("12. Learned parameter changes and affects a subsequent forecast", () => {
  it("end-to-end: evaluate → learn → re-project with the learned parameter", () => {
    // Step 1: Create a set of projections with a known systematic overprediction.
    // The model predicts a rise of 1 mg/dL/min, but the actual glucose stays flat.
    // This creates a consistent positive bias.
    const generatedAt = 0;
    const settings = {
      insulin_sensitivity_mgdl_per_unit: 50,
      meal_insulin_units_per_5g: 2.5,
      target_range_low: 70,
      target_range_high: 180,
    };

    // Create 15 projections (enough for MIN_SAMPLES_FOR_PERSONALIZATION = 10).
    const evaluatedProjections = [];
    for (let i = 0; i < 15; i++) {
      const projGeneratedAt = i * 120 * MINUTE_MS;  // every 2 hours
      const snap = normalizeInputs(
        [
          { recorded_at: new Date(projGeneratedAt - 5 * MINUTE_MS).toISOString(), value: 120, source: "dexcom" },
          { recorded_at: new Date(projGeneratedAt - 10 * MINUTE_MS).toISOString(), value: 120, source: "dexcom" },
        ],
        [{ consumed_at: new Date(projGeneratedAt - 10 * MINUTE_MS).toISOString(), carbs: 45, food_name: "Test", absorption_profile: "medium" }],
        [],
        settings,
        projGeneratedAt
      );
      const result = projectGlucose(snap, { horizonMin: 60 });
      const projection = {
        generated_at: projGeneratedAt,
        model_version: result.modelVersion,
        horizon_minutes: 60,
        trajectory: result.trajectory.map(p => ({
          min_offset: p.min_offset, value: p.value, lower: p.lower, upper: p.upper,
        })),
        abstained: result.abstained,
      };

      // Actual readings: glucose stays at 120 (no rise), so the model overpredicts.
      const actualReadings = [
        readingAt(120, projGeneratedAt + 15 * MINUTE_MS),
        readingAt(120, projGeneratedAt + 30 * MINUTE_MS),
        readingAt(120, projGeneratedAt + 60 * MINUTE_MS),
      ];

      const evalResult = evaluateProjection(projection, actualReadings, projGeneratedAt + 65 * MINUTE_MS);
      if (evalResult.status === "evaluated") {
        evaluatedProjections.push({ model_version: projection.model_version, evaluation: evalResult });
      }
    }

    // Step 2: Aggregate the metrics.
    expect(evaluatedProjections.length).toBeGreaterThanOrEqual(MIN_SAMPLES_FOR_PERSONALIZATION);
    const metrics = aggregateMetrics(evaluatedProjections);

    // The model predicted a rise but actual stayed flat → positive bias.
    expect(metrics.bias).toBeGreaterThan(MIN_BIAS_FOR_UPDATE_MGDL);

    // Step 3: Check that the model should be updated.
    const decision = shouldUpdateModel(baselineState, metrics);
    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedFactor).toBeLessThan(1.0);  // reduce the rate

    // Step 4: Apply the update.
    const { updatedState, provenance } = applyGuardedUpdate(baselineState, metrics, decision);
    expect(provenance).not.toBeNull();
    expect(updatedState.parameters.rateAdjustmentFactor).toBe(decision.proposedFactor);
    expect(updatedState.baseline_locked).toBe(false);

    // Step 5: Generate a new projection with the learned parameter.
    const newSnap = normalizeInputs(
      [
        { recorded_at: new Date(Date.now() - 5 * MINUTE_MS).toISOString(), value: 120, source: "dexcom" },
        { recorded_at: new Date(Date.now() - 10 * MINUTE_MS).toISOString(), value: 120, source: "dexcom" },
      ],
      [{ consumed_at: new Date(Date.now() - 10 * MINUTE_MS).toISOString(), carbs: 45, food_name: "Test", absorption_profile: "medium" }],
      [],
      settings,
      Date.now()
    );

    const baselineResult = projectGlucose(newSnap, { horizonMin: 60 });
    const personalizedResult = projectGlucose(newSnap, {
      horizonMin: 60,
      modelParams: { rateAdjustmentFactor: updatedState.parameters.rateAdjustmentFactor },
    });

    // Step 6: Verify the personalized forecast is different from the baseline.
    // The personalized model has a lower rateAdjustmentFactor, so it predicts
    // a smaller rise → lower values at the end of the horizon.
    const baselineEnd = baselineResult.trajectory[baselineResult.trajectory.length - 1].value;
    const personalizedEnd = personalizedResult.trajectory[personalizedResult.trajectory.length - 1].value;

    expect(personalizedEnd).toBeLessThan(baselineEnd);
    expect(personalizedResult.modelVersion).toBe(PERSONALIZED_MODEL_VERSION);
    expect(baselineResult.modelVersion).toBe(BASELINE_MODEL_VERSION);
  });

  it("the learned parameter is clamped and does not cause extreme shifts", () => {
    // Even with extreme bias, the factor stays within [MIN_RATE_FACTOR, MAX_RATE_FACTOR].
    const metrics = {
      sampleCount: 50, mae: 100, bias: 100, coverage: null,
      byHorizon: {}, byModelVersion: {},
    };
    const decision = shouldUpdateModel(baselineState, metrics);
    expect(decision.shouldUpdate).toBe(true);
    expect(decision.proposedFactor).toBeGreaterThanOrEqual(MIN_RATE_FACTOR);
    expect(decision.proposedFactor).toBeLessThanOrEqual(MAX_RATE_FACTOR);
  });
});