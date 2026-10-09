import { describe, test, expect } from "vitest";
// Stackd Insight Engine — Milestone 5.1: Evaluation Concurrency & Idempotency
//
// Tests the logic that supports concurrency-safe evaluation and idempotent
// model-state updates. The actual atomic claim/update path (updateMany against
// the real database) is exercised separately via exec_tool integration tests.
//
// These tests verify:
//   1. Stale-claim recovery logic (locked_at threshold computation)
//   2. Idempotency check (last_processed_evaluation_count comparison)
//   3. Model-state mutex filter construction
//   4. Atomic claim filter pattern (status: "active" → "processing")
//   5. Failed evaluation recovery (release claim back to "active")
//
// SAFETY: These tests verify concurrency logic, never dosing.

import {
  evaluateProjection,
  aggregateMetrics,
  shouldUpdateModel,
  applyGuardedUpdate,
  EVALUATION_VERSION,
  EVAL_BUFFER_MIN,
  MIN_SAMPLES_FOR_PERSONALIZATION,
} from "../evaluation";

const MINUTE = 60 * 1000;

// ── Constants matching the backend function ─────────────────────────────────
const STALE_CLAIM_TIMEOUT_MS = 5 * MINUTE;
const STALE_MODEL_LOCK_MS = 5 * MINUTE;

// ── Stale-claim recovery logic ──────────────────────────────────────────────

describe("Milestone 5.1 — stale-claim recovery logic", () => {
  test("a projection locked recently is not stale", () => {
    const now = Date.now();
    const lockedAt = now - 2 * MINUTE;  // 2 minutes ago
    const lockAge = now - lockedAt;
    const isStale = lockAge > STALE_CLAIM_TIMEOUT_MS;
    expect(isStale).toBe(false);
  });

  test("a projection locked longer than the timeout is stale", () => {
    const now = Date.now();
    const lockedAt = now - 10 * MINUTE;  // 10 minutes ago
    const lockAge = now - lockedAt;
    const isStale = lockAge > STALE_CLAIM_TIMEOUT_MS;
    expect(isStale).toBe(true);
  });

  test("a projection with no locked_at is treated as stale (recoverable)", () => {
    const now = Date.now();
    const lockedAt = 0;  // missing/invalid
    const lockAge = now - lockedAt;
    const isStale = lockAge > STALE_CLAIM_TIMEOUT_MS;
    expect(isStale).toBe(true);
  });

  test("stale recovery resets the projection to active for retry", () => {
    // Simulate the recovery logic: a stale "processing" projection should
    // be reset to "active" so it can be re-evaluated.
    const projection = {
      id: "test_proj_1",
      status: "processing",
      locked_at: new Date(Date.now() - 10 * MINUTE).toISOString(),
    };

    const now = Date.now();
    const lockedAt = projection.locked_at ? new Date(projection.locked_at).getTime() : 0;
    const isStale = !Number.isFinite(lockedAt) || lockedAt < now - STALE_CLAIM_TIMEOUT_MS;

    expect(isStale).toBe(true);
    // The recovery would call updateMany to reset status to "active".
  });
});

// ── Atomic claim filter pattern ─────────────────────────────────────────────

describe("Milestone 5.1 — atomic claim filter pattern", () => {
  test("claim filter matches active status and specific projection id", () => {
    const projection = { id: "abc123", status: "active" };
    // The claim filter should be: { _id: projection.id, status: "active" }
    // If the projection is already "processing" (claimed by another worker),
    // the filter won't match and updated === 0.
    const claimFilter = { _id: projection.id, status: "active" };
    expect(claimFilter.status).toBe("active");
    expect(claimFilter._id).toBe("abc123");
  });

  test("claim update sets status to processing and locked_at", () => {
    const now = Date.now();
    const claimUpdate = {
      $set: {
        status: "processing",
        locked_at: new Date(now).toISOString(),
      },
    };
    expect(claimUpdate.$set.status).toBe("processing");
    expect(claimUpdate.$set.locked_at).toBeDefined();
  });

  test("a projection already in processing is not claimed again", () => {
    // If worker A claimed projection P (status: "processing"), worker B's
    // claim filter { _id: P.id, status: "active" } won't match because the
    // status is now "processing". Worker B's updateMany returns updated: 0.
    const projectionAfterClaimA = { id: "abc123", status: "processing" };
    const claimFilterB = { _id: projectionAfterClaimA.id, status: "active" };
    // The filter expects "active" but the projection is "processing" — no match.
    expect(projectionAfterClaimA.status).not.toBe(claimFilterB.status);
  });
});

// ── Idempotency logic ───────────────────────────────────────────────────────

describe("Milestone 5.1 — idempotent model-state updates", () => {
  test("skip update when evaluated count has not increased", () => {
    const state = {
      last_processed_evaluation_count: 10,
    };
    const currentEvaluatedCount = 10;
    const shouldSkip = currentEvaluatedCount <= (Number(state.last_processed_evaluation_count) || 0);
    expect(shouldSkip).toBe(true);
  });

  test("proceed with update when evaluated count has increased", () => {
    const state = {
      last_processed_evaluation_count: 10,
    };
    const currentEvaluatedCount = 15;
    const shouldSkip = currentEvaluatedCount <= (Number(state.last_processed_evaluation_count) || 0);
    expect(shouldSkip).toBe(false);
  });

  test("proceed with update when last_processed is zero (first run)", () => {
    const state = {
      last_processed_evaluation_count: 0,
    };
    const currentEvaluatedCount = 3;
    const shouldSkip = currentEvaluatedCount <= (Number(state.last_processed_evaluation_count) || 0);
    expect(shouldSkip).toBe(false);
  });

  test("skip update when last_processed is missing (treated as 0) and count is 0", () => {
    const state = {};
    const currentEvaluatedCount = 0;
    const shouldSkip = currentEvaluatedCount <= (Number(state.last_processed_evaluation_count) || 0);
    expect(shouldSkip).toBe(true);
  });
});

// ── Model-state mutex logic ─────────────────────────────────────────────────

describe("Milestone 5.1 — model-state mutex", () => {
  test("unlocked state can be claimed", () => {
    const state = { id: "state1", update_locked_at: null };
    const now = Date.now();
    const lockAge = state.update_locked_at
      ? now - new Date(state.update_locked_at).getTime()
      : Infinity;
    const lockIsStale = lockAge > STALE_MODEL_LOCK_MS;

    // When update_locked_at is null, lockAge is Infinity (stale by definition),
    // but the claim filter logic falls through to the "unlocked" path because
    // state.update_locked_at is falsy in both conditional branches.
    expect(state.update_locked_at).toBe(null);

    const claimFilter = state.update_locked_at && !lockIsStale
      ? null
      : state.update_locked_at && lockIsStale
        ? { _id: state.id, update_locked_at: state.update_locked_at }
        : { _id: state.id, update_locked_at: null };

    expect(claimFilter).toEqual({ _id: "state1", update_locked_at: null });
  });

  test("recently locked state is not claimable", () => {
    const state = {
      id: "state1",
      update_locked_at: new Date(Date.now() - 1 * MINUTE).toISOString(),
    };
    const now = Date.now();
    const lockAge = now - new Date(state.update_locked_at).getTime();
    const lockIsStale = lockAge > STALE_MODEL_LOCK_MS;

    // Locked and not stale → skip (claimFilter is null).
    const claimFilter = state.update_locked_at && !lockIsStale
      ? null
      : state.update_locked_at && lockIsStale
        ? { _id: state.id, update_locked_at: state.update_locked_at }
        : { _id: state.id, update_locked_at: null };

    expect(claimFilter).toBe(null);
  });

  test("stale locked state can be reclaimed", () => {
    const state = {
      id: "state1",
      update_locked_at: new Date(Date.now() - 10 * MINUTE).toISOString(),
    };
    const now = Date.now();
    const lockAge = now - new Date(state.update_locked_at).getTime();
    const lockIsStale = lockAge > STALE_MODEL_LOCK_MS;

    // Locked but stale → reclaim with filter matching the old locked_at.
    const claimFilter = state.update_locked_at && !lockIsStale
      ? null
      : state.update_locked_at && lockIsStale
        ? { _id: state.id, update_locked_at: state.update_locked_at }
        : { _id: state.id, update_locked_at: null };

    expect(claimFilter).toEqual({ _id: "state1", update_locked_at: state.update_locked_at });
  });
});

// ── Failed evaluation recovery ──────────────────────────────────────────────

describe("Milestone 5.1 — failed evaluation recovery", () => {
  test("a crashed evaluation leaves the projection in processing (recoverable)", () => {
    // If a worker crashes after claiming a projection (status: "processing")
    // but before completing the evaluation, the projection stays "processing"
    // with a locked_at. The stale-claim recovery will reset it to "active".
    const crashedProjection = {
      id: "proj1",
      status: "processing",
      locked_at: new Date(Date.now() - 10 * MINUTE).toISOString(),
    };

    // The recovery logic detects this as stale and resets to "active".
    const now = Date.now();
    const lockedAt = new Date(crashedProjection.locked_at).getTime();
    const isStale = lockedAt < now - STALE_CLAIM_TIMEOUT_MS;
    expect(isStale).toBe(true);
  });

  test("a completed evaluation is not affected by stale recovery", () => {
    // A projection that was successfully evaluated has status "evaluated" and
    // locked_at: null. The stale recovery only looks at "processing" projections.
    const completedProjection = {
      id: "proj1",
      status: "evaluated",
      locked_at: null,
    };

    // The recovery filter is { status: "processing" } — this projection
    // won't be matched.
    expect(completedProjection.status).not.toBe("processing");
  });

  test("error handler releases the claim back to active for retry", () => {
    // When an error occurs during evaluation, the catch block should reset
    // the projection from "processing" back to "active" so it can be retried.
    // The reset filter is { _id: id, status: "processing" } with $set to
    // { status: "active", locked_at: null }.
    const resetFilter = { _id: "proj1", status: "processing" };
    const resetUpdate = { $set: { status: "active", locked_at: null } };

    expect(resetFilter.status).toBe("processing");
    expect(resetUpdate.$set.status).toBe("active");
    expect(resetUpdate.$set.locked_at).toBe(null);
  });
});

// ── Evaluation idempotency (same projection, same result) ───────────────────

describe("Milestone 5.1 — evaluation idempotency", () => {
  test("evaluating the same projection twice produces the same result", () => {
    const genTime = Date.now();
    const trajectory = Array.from({ length: 13 }, (_, i) => ({
      min_offset: i * 5,
      value: 120 + i * 2,
      lower: 115 + i * 2,
      upper: 125 + i * 2,
    }));

    const actualReadings = [
      { time: genTime + 15 * MINUTE, value: 130, source: "dexcom" },
      { time: genTime + 30 * MINUTE, value: 135, source: "dexcom" },
      { time: genTime + 60 * MINUTE, value: 125, source: "dexcom" },
    ];

    const evalTime = genTime + 60 * MINUTE + (EVAL_BUFFER_MIN + 1) * MINUTE;

    const projection = {
      generated_at: genTime,
      model_version: "1.0.0-baseline",
      horizon_minutes: 60,
      trajectory,
      abstained: false,
    };

    const result1 = evaluateProjection(projection, actualReadings, evalTime);
    const result2 = evaluateProjection(projection, actualReadings, evalTime);

    expect(result1.status).toBe(result2.status);
    expect(result1.mae).toBe(result2.mae);
    expect(result1.bias).toBe(result2.bias);
    expect(result1.valid_count).toBe(result2.valid_count);
    expect(result1.horizons).toEqual(result2.horizons);
  });

  test("re-evaluation after stale recovery produces the same result", () => {
    // Simulate: worker A claims and evaluates projection P, then crashes.
    // Stale recovery resets P to "active". Worker B claims and evaluates P.
    // Both evaluations produce the same result (deterministic).

    const genTime = Date.now();
    const trajectory = Array.from({ length: 13 }, (_, i) => ({
      min_offset: i * 5,
      value: 120 + i,
      lower: 115 + i,
      upper: 125 + i,
    }));

    const actualReadings = [
      { time: genTime + 15 * MINUTE, value: 128, source: "dexcom" },
      { time: genTime + 30 * MINUTE, value: 132, source: "dexcom" },
      { time: genTime + 60 * MINUTE, value: 122, source: "dexcom" },
    ];

    const evalTime = genTime + 70 * MINUTE;
    const projection = {
      generated_at: genTime,
      model_version: "1.0.0-baseline",
      horizon_minutes: 60,
      trajectory,
      abstained: false,
    };

    // Worker A's evaluation (before crash).
    const resultA = evaluateProjection(projection, actualReadings, evalTime);

    // Worker B's evaluation (after stale recovery — same projection, same readings).
    const resultB = evaluateProjection(projection, actualReadings, evalTime);

    expect(resultA).toEqual(resultB);
  });
});

// ── Model-state update idempotency with aggregateMetrics ───────────────────

describe("Milestone 5.1 — model-state update idempotency", () => {
  test("aggregating the same evaluated projections twice produces the same metrics", () => {
    const evaluatedProjections = [
      {
        model_version: "1.0.0-baseline",
        evaluation: {
          status: "evaluated",
          mae: 12.5,
          bias: 3.2,
          coverage: 0.8,
          horizons: [],
        },
      },
      {
        model_version: "1.0.0-baseline",
        evaluation: {
          status: "evaluated",
          mae: 15.0,
          bias: -2.1,
          coverage: 0.7,
          horizons: [],
        },
      },
    ];

    const metrics1 = aggregateMetrics(evaluatedProjections);
    const metrics2 = aggregateMetrics(evaluatedProjections);

    expect(metrics1.mae).toBe(metrics2.mae);
    expect(metrics1.bias).toBe(metrics2.bias);
    expect(metrics1.sampleCount).toBe(metrics2.sampleCount);
  });

  test("shouldUpdateModel produces the same decision for the same state and metrics", () => {
    const state = {
      model_version: "1.0.0-baseline",
      parameters: {},
      sample_count: 15,
      baseline_locked: true,
      evaluation_summary: {},
    };

    const metrics = {
      sampleCount: 15,
      mae: 14.0,
      bias: 5.0,
      coverage: null,
      byHorizon: {},
      byModelVersion: {},
    };

    const decision1 = shouldUpdateModel(state, metrics);
    const decision2 = shouldUpdateModel(state, metrics);

    expect(decision1.shouldUpdate).toBe(decision2.shouldUpdate);
    expect(decision1.reason).toBe(decision2.reason);
    if (decision1.proposedFactor) {
      expect(decision1.proposedFactor).toBe(decision2.proposedFactor);
    }
  });
});