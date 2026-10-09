// Stackd Insight Engine — Forecast Evaluation Pipeline (Milestone 5.1)
//
// Evaluates saved GlucoseProjection records against actual CGM observations
// after their forecast windows have elapsed, then runs guarded adaptive
// learning to update the user's ProjectionModelState when sufficient evidence
// supports it.
//
// Milestone 5.1 changes:
//   - Atomic claim: projections transition "active" → "processing" →
//     "evaluated"/"unscorable" via updateMany, so concurrent workers cannot
//     evaluate the same projection twice.
//   - Stale-claim recovery: projections stuck in "processing" with an old
//     locked_at are reset to "active" for retry.
//   - Snapshot-based shadow replay: shadow evaluation uses the immutable
//     input_snapshot persisted at generation time, not current records.
//     Legacy projections without a valid snapshot are marked ineligible.
//   - Model-state mutex: only one worker can update a user's model state at
//     a time, and idempotency tracking prevents duplicate learning updates.
//
// SAFETY: Never recommends, prescribes, or calculates insulin doses.
//
// SCOPE: rateAdjustmentFactor is a single learned correction for systematic
// prediction bias — not a model of the individual's glucose physiology.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import {
  evaluateProjection,
  aggregateMetrics,
  shouldUpdateModel,
  applyGuardedUpdate,
  validatePersonalization,
  revertToBaseline,
  EVALUATION_VERSION,
  EVAL_BUFFER_MIN,
} from "../../shared/forecastEvaluation.ts";
import {
  BASELINE_MODEL_VERSION,
  PERSONALIZED_MODEL_VERSION,
} from "../../shared/insightEngine.ts";
import {
  createBaselineResolution,
  createGeneralOnlyResolution,
  createMealOnlyResolution,
  resolveModelComponents,
} from "../../shared/modelResolution.ts";
import { isSnapshotValid, replayFromSnapshot } from "../../shared/projectionSnapshot.ts";

const MINUTE_MS = 60 * 1000;
const BATCH_LIMIT = 20;

// A projection stuck in "processing" longer than this is considered crashed
// and reset to "active" for retry. 5 minutes is generous for a single
// evaluation (typically < 1 second) while being short enough to not delay
// recovery significantly.
const STALE_CLAIM_TIMEOUT_MS = 5 * MINUTE_MS;

// Model-state mutex stale timeout. A model-state lock held longer than this
// is considered crashed and can be reclaimed.
const STALE_MODEL_LOCK_MS = 5 * MINUTE_MS;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let body: any = {};
    try { body = await req.json(); } catch { /* scheduler may send empty body */ }
    const limit = Math.min(Number(body.limit) || BATCH_LIMIT, BATCH_LIMIT);
    const sr = base44.asServiceRole;
    const now = Date.now();
    const bufferMs = EVAL_BUFFER_MIN * MINUTE_MS;

    // ── Stale-claim recovery ────────────────────────────────────────────────
    // Find projections stuck in "processing" and reset those with stale locks
    // back to "active" so they can be retried. This handles crashed workers.
    let staleRecovered = 0;
    try {
      const processingProjections = await sr.entities.GlucoseProjection.filter(
        { status: "processing" }, "locked_at", 100
      );
      for (const p of processingProjections) {
        const lockedAt = p.locked_at ? new Date(p.locked_at).getTime() : 0;
        if (!Number.isFinite(lockedAt) || lockedAt < now - STALE_CLAIM_TIMEOUT_MS) {
          // Atomically reset to "active" only if still "processing" (not
          // already completed by another worker).
          const resetResult = await sr.entities.GlucoseProjection.updateMany(
            { _id: p.id, status: "processing" },
            { $set: { status: "active", locked_at: null } }
          );
          if (resetResult.updated > 0) staleRecovered++;
        }
      }
    } catch (err: any) {
      console.error(`[evaluateProjections] stale recovery error: ${err.message}`);
    }

    // ── Find eligible projections ──────────────────────────────────────────
    const activeProjections = await sr.entities.GlucoseProjection.filter(
      { status: "active" }, "-generated_at", limit
    );

    const eligible = activeProjections.filter((p: any) => {
      const generatedAt = new Date(p.generated_at).getTime();
      if (!Number.isFinite(generatedAt)) return false;
      const horizonMs = (Number(p.horizon_minutes) || 60) * MINUTE_MS;
      return generatedAt + horizonMs + bufferMs <= now;
    });

    let evaluated = 0;
    let unscorable = 0;
    let claimFailed = 0;
    const userEvaluationMap: Map<string, any[]> = new Map();

    for (const projection of eligible) {
      const userId = projection.user_id || projection.created_by_id;
      if (!userId) continue;

      // ── Atomic claim ──────────────────────────────────────────────────────
      // Transition from "active" to "processing" atomically. If another
      // worker already claimed it (or it's no longer active), updated === 0
      // and we skip this projection.
      const claimResult = await sr.entities.GlucoseProjection.updateMany(
        { _id: projection.id, status: "active" },
        { $set: { status: "processing", locked_at: new Date(now).toISOString() } }
      );
      if (claimResult.updated === 0) {
        claimFailed++;
        continue;
      }

      try {
        // Fetch actual readings for this user from generation time to now.
        // Match both user_id (Dexcom-synced) and created_by_id (manual).
        const readings = await sr.entities.GlucoseReading.filter(
          { recorded_at: { $gte: projection.generated_at }, $or: [{ user_id: userId }, { created_by_id: userId }] },
          "recorded_at", 2000
        );

        const normalizedReadings = readings
          .filter((r: any) => r && Number.isFinite(Number(r.value)))
          .map((r: any) => ({
            time: new Date(r.recorded_at).getTime(),
            value: Number(r.value),
            source: String(r.source || "manual"),
          }));

        const normalizedProjection = {
          id: projection.id,
          user_id: userId,
          generated_at: new Date(projection.generated_at).getTime(),
          model_version: projection.model_version,
          horizon_minutes: Number(projection.horizon_minutes) || 60,
          trajectory: (projection.trajectory || []).map((p: any) => ({
            min_offset: p.min_offset,
            value: p.value,
            lower: p.lower,
            upper: p.upper,
          })),
          abstained: Boolean(projection.abstained),
        };

        const result = evaluateProjection(normalizedProjection, normalizedReadings, now);

        // Persist the evaluation and clear the lock atomically.
        await sr.entities.GlucoseProjection.update(projection.id, {
          status: result.status,
          evaluation: {
            status: result.status,
            reason: result.reason,
            horizons: result.horizons,
            mae: result.mae,
            bias: result.bias,
            coverage: result.coverage,
            valid_count: result.valid_count,
            excluded_count: result.excluded_count,
            exclusions: result.exclusions,
            evaluation_version: result.evaluation_version,
            evaluated_at: new Date(result.evaluated_at).toISOString(),
          },
          locked_at: null,
        });

        if (result.status === "evaluated") {
          evaluated++;
          if (!userEvaluationMap.has(userId)) userEvaluationMap.set(userId, []);
          userEvaluationMap.get(userId)!.push({
            model_version: projection.model_version,
            evaluation: result,
          });
        } else {
          unscorable++;
        }
      } catch (err: any) {
        // On error, release the claim back to "active" for retry.
        await sr.entities.GlucoseProjection.updateMany(
          { _id: projection.id, status: "processing" },
          { $set: { status: "active", locked_at: null } }
        ).catch(() => {});
        console.error(`[evaluateProjections] error evaluating ${projection.id}: ${err.message}`);
      }
    }

    // ── Model state updates (with mutex) ───────────────────────────────────
    let stateUpdates = 0;
    let reverts = 0;

    for (const [userId, _newEvals] of userEvaluationMap) {
      try {
        // Fetch ALL evaluated projections for this user.
        const allEvaluated = await sr.entities.GlucoseProjection.filter(
          { user_id: userId, status: "evaluated" },
          "-generated_at", 500
        );

        const evaluatedProjections = allEvaluated.map((p: any) => ({
          model_version: p.model_version,
          evaluation: p.evaluation,
        }));

        const metrics = aggregateMetrics(evaluatedProjections);

        // Fetch the user's model state.
        const stateRows = await sr.entities.ProjectionModelState.filter(
          { user_id: userId }, "-created_date", 1
        );
        const state = stateRows[0];
        if (!state) continue;

        // ── Idempotency check ───────────────────────────────────────────────
        // If the evaluated count hasn't increased since the last update, skip.
        const currentEvaluatedCount = allEvaluated.length;
        const lastProcessedCount = Number(state.last_processed_evaluation_count) || 0;
        if (currentEvaluatedCount <= lastProcessedCount) {
          continue; // no new evaluations since last update
        }

        // ── Model-state mutex ───────────────────────────────────────────────
        // Claim the model state atomically. Only one worker can update it.
        const lockAge = state.update_locked_at
          ? now - new Date(state.update_locked_at).getTime()
          : Infinity;
        const lockIsStale = lockAge > STALE_MODEL_LOCK_MS;

        // Build the claim filter: either unlocked, or stale lock with the
        // same locked_at value (to avoid racing with a fresh claim).
        const claimFilter = state.update_locked_at && !lockIsStale
          ? null  // locked and not stale — skip
          : state.update_locked_at && lockIsStale
            ? { _id: state.id, update_locked_at: state.update_locked_at }
            : { _id: state.id, update_locked_at: null };

        if (!claimFilter) continue; // locked by another worker

        const lockResult = await sr.entities.ProjectionModelState.updateMany(
          claimFilter,
          { $set: { update_locked_at: new Date(now).toISOString() } }
        );
        if (lockResult.updated === 0) continue; // another worker claimed it

        try {
          // Check if we should revert to baseline.
          const validation = validatePersonalization(metrics);
          if (validation.shouldRevert) {
            const { updatedState, provenance } = revertToBaseline(state, metrics, validation);
            if (provenance) {
              await sr.entities.ProjectionModelState.update(state.id, {
                model_version: updatedState.model_version,
                parameters: updatedState.parameters,
                sample_count: updatedState.sample_count,
                baseline_locked: true,
                evaluation_summary: updatedState.evaluation_summary,
                last_updated_at: updatedState.last_updated_at,
                update_history: updatedState.update_history,
                update_locked_at: null,
                last_processed_evaluation_count: currentEvaluatedCount,
              });
              reverts++;
            } else {
              // No update needed — release the lock.
              await sr.entities.ProjectionModelState.update(state.id, {
                update_locked_at: null,
                last_processed_evaluation_count: currentEvaluatedCount,
              });
            }
            continue;
          }

          // Check if we should update the model with a learned parameter.
          const decision = shouldUpdateModel(state, metrics);
          if (decision.shouldUpdate) {
            const { updatedState, provenance } = applyGuardedUpdate(state, metrics, decision);
            if (provenance) {
              await sr.entities.ProjectionModelState.update(state.id, {
                model_version: updatedState.model_version,
                parameters: updatedState.parameters,
                sample_count: updatedState.sample_count,
                baseline_locked: false,
                evaluation_summary: updatedState.evaluation_summary,
                last_updated_at: updatedState.last_updated_at,
                update_history: updatedState.update_history,
                update_locked_at: null,
                last_processed_evaluation_count: currentEvaluatedCount,
              });
              stateUpdates++;
            } else {
              await sr.entities.ProjectionModelState.update(state.id, {
                update_locked_at: null,
                last_processed_evaluation_count: currentEvaluatedCount,
              });
            }
          } else {
            // No update needed — release the lock.
            await sr.entities.ProjectionModelState.update(state.id, {
              update_locked_at: null,
              last_processed_evaluation_count: currentEvaluatedCount,
            });
          }
        } catch (updateErr: any) {
          // Release the lock on failure.
          await sr.entities.ProjectionModelState.update(state.id, {
            update_locked_at: null,
          }).catch(() => {});
          throw updateErr;
        }
      } catch (err: any) {
        console.error(`[evaluateProjections] error updating state for ${userId}: ${err.message}`);
      }
    }

    // ── Shadow evaluation (snapshot-based, Milestone 5.1) ──────────────────
    // For each user with newly evaluated projections, replay the projection
    // with alternative model configurations using the IMMUTABLE INPUT SNAPSHOT
    // persisted at generation time. This eliminates future-data leakage from
    // meals, insulin, or readings logged after the projection was generated.
    let shadowEvaluated = 0;
    let shadowIneligible = 0;

    for (const [userId, _newEvals] of userEvaluationMap) {
      try {
        // Fetch the user's model states for constructing alternative resolutions.
        const [userSettingsList, userProjState, userMealState, userEvaluatedProjs] = await Promise.all([
          sr.entities.UserSettings.filter({ created_by_id: userId }, "-created_date", 1),
          sr.entities.ProjectionModelState.filter({ user_id: userId }, "-created_date", 1),
          sr.entities.MealResponseModelState.filter({ user_id: userId }, "-created_date", 1),
          sr.entities.GlucoseProjection.filter(
            { user_id: userId, status: "evaluated" },
            "-generated_at", 50
          ),
        ]);

        const userSettings = userSettingsList?.[0] || {};
        const projState = userProjState?.[0] || null;
        const mealState = userMealState?.[0] || null;

        // Construct the 4 alternative model resolutions for shadow evaluation.
        const userResolution = resolveModelComponents(projState, mealState);
        const rateAdj = userResolution.general.eligible ? userResolution.general.effectiveValue : 1.0;
        const mealParams: Record<string, { speedFactor: number; magnitudeFactor: number }> = {};
        if (mealState?.speed_class_parameters) {
          for (const cls of ["fast", "mixed", "high_fat"]) {
            const cp = mealState.speed_class_parameters[cls];
            if (cp && (Math.abs(Number(cp.speed_factor) - 1.0) > 0.001 || Math.abs(Number(cp.magnitude_factor) - 1.0) > 0.001)) {
              mealParams[cls] = { speedFactor: Number(cp.speed_factor), magnitudeFactor: Number(cp.magnitude_factor) };
            }
          }
        }

        const shadowConfigs = [
          { name: "baseline", resolution: createBaselineResolution() },
          { name: "general_personalized", resolution: createGeneralOnlyResolution(rateAdj) },
          { name: "meal_personalized", resolution: createMealOnlyResolution(mealParams) },
          { name: "integrated", resolution: userResolution },
        ];

        for (const proj of userEvaluatedProjs) {
          try {
            // ── Snapshot eligibility check ──────────────────────────────────
            // Legacy projections without a valid input_snapshot are ineligible
            // for trustworthy shadow comparison. They are marked but not
            // silently reconstructed from current data.
            const snapshot = proj.input_snapshot;
            if (!isSnapshotValid(snapshot)) {
              // Mark as ineligible (only if not already marked).
              if (!proj.shadow_eligibility || !proj.shadow_eligibility.eligible === false) {
                await sr.entities.GlucoseProjection.update(proj.id, {
                  shadow_eligibility: {
                    eligible: false,
                    reason: snapshot ? "invalid_snapshot" : "missing_snapshot",
                  },
                });
              }
              shadowIneligible++;
              continue;
            }

            // Fetch actual readings for scoring (outcomes only — these are
            // readings that arrived AFTER generation, used for evaluation).
            const readings = await sr.entities.GlucoseReading.filter(
              { recorded_at: { $gte: proj.generated_at }, $or: [{ user_id: userId }, { created_by_id: userId }] },
              "recorded_at", 2000
            );
            const normalizedReadings = readings
              .filter((r: any) => r && Number.isFinite(Number(r.value)))
              .map((r: any) => ({
                time: new Date(r.recorded_at).getTime(),
                value: Number(r.value),
                source: String(r.source || "manual"),
              }));

            const shadowResults: Record<string, any> = {};
            for (const config of shadowConfigs) {
              // Replay using the immutable snapshot — NOT current records.
              const replayed = replayFromSnapshot(
                snapshot,
                Number(proj.horizon_minutes) || 60,
                config.resolution
              );

              if (replayed.abstained || replayed.trajectory.length === 0) {
                shadowResults[config.name] = { mae: null, bias: null, coverage: null, valid_count: 0, abstained: true };
                continue;
              }

              const replayedProjection = {
                generated_at: new Date(proj.generated_at).getTime(),
                model_version: replayed.modelVersion,
                horizon_minutes: Number(proj.horizon_minutes) || 60,
                trajectory: replayed.trajectory,
                abstained: false,
              };
              const replayEval = evaluateProjection(replayedProjection, normalizedReadings, now);
              shadowResults[config.name] = {
                mae: replayEval.mae,
                bias: replayEval.bias,
                coverage: replayEval.coverage,
                valid_count: replayEval.valid_count,
                abstained: false,
              };
            }

            // Persist shadow evaluation results and eligibility.
            await sr.entities.GlucoseProjection.update(proj.id, {
              shadow_evaluation: shadowResults,
              shadow_eligibility: { eligible: true, reason: "valid_snapshot" },
            });
            shadowEvaluated++;
          } catch (err: any) {
            console.error(`[evaluateProjections] shadow eval error for ${proj.id}: ${err.message}`);
          }
        }
      } catch (err: any) {
        console.error(`[evaluateProjections] shadow eval error for user ${userId}: ${err.message}`);
      }
    }

    console.log(`[evaluateProjections] staleRecovered=${staleRecovered} processed=${eligible.length} evaluated=${evaluated} unscorable=${unscorable} claimFailed=${claimFailed} stateUpdates=${stateUpdates} reverts=${reverts} shadowEvaluated=${shadowEvaluated} shadowIneligible=${shadowIneligible}`);

    return Response.json({
      ok: true,
      staleRecovered,
      processed: eligible.length,
      evaluated,
      unscorable,
      claimFailed,
      stateUpdates,
      reverts,
      shadowEvaluated,
      shadowIneligible,
    });
  } catch (error: any) {
    console.error('[evaluateProjections] fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}