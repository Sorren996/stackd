// Stackd Insight Engine — Forecast Evaluation Pipeline (Milestone 2)
//
// Evaluates saved GlucoseProjection records against actual CGM observations
// after their forecast windows have elapsed, then runs guarded adaptive
// learning to update the user's ProjectionModelState when sufficient evidence
// supports it.
//
// Scheduled by the "Evaluate Projections" workflow (every 15 minutes). Does
// not block the dashboard or run on every CGM reading.
//
// Idempotency: projections transition from "active" → "evaluated" or
// "unscorable" once scored. Re-runs skip already-scored projections because
// the query filters for status "active" only. Evaluation is deterministic:
// the same projection + readings always produce the same scores.
//
// No future-data leakage: only readings with recorded_at >= generated_at are
// used. The original forecast and its inputs are never rewritten — only the
// evaluation field and status are updated.
//
// User isolation: each projection is evaluated only against its owning user's
// readings (filtered by created_by_id). Model state updates are per-user.
//
// SAFETY: Never recommends, prescribes, or calculates insulin doses. Only
// adjusts a multiplicative rate factor that shapes future glucose projections.
//
// SCOPE: rateAdjustmentFactor is a single learned correction for systematic
// prediction bias — not a model of the individual's glucose physiology. It
// cannot distinguish absorption timing, magnitude, insulin action, or
// activity/stress causes. It describes what the baseline tended to get wrong
// on average; it never prescribes.

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
import { BASELINE_MODEL_VERSION, PERSONALIZED_MODEL_VERSION } from "../../shared/insightEngine.ts";

const MINUTE_MS = 60 * 1000;
const BATCH_LIMIT = 20;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let body: any = {};
    try { body = await req.json(); } catch { /* scheduler may send empty body */ }
    const limit = Math.min(Number(body.limit) || BATCH_LIMIT, BATCH_LIMIT);
    const sr = base44.asServiceRole;
    const now = Date.now();

    // Find active projections that are due for evaluation.
    // A projection is due when: generated_at + horizon_minutes + buffer <= now.
    const bufferMs = EVAL_BUFFER_MIN * MINUTE_MS;

    const activeProjections = await sr.entities.GlucoseProjection.filter(
      { status: "active" },
      "-generated_at", limit
    );

    // Filter to those whose forecast window has actually elapsed.
    const eligible = activeProjections.filter((p: any) => {
      const generatedAt = new Date(p.generated_at).getTime();
      if (!Number.isFinite(generatedAt)) return false;
      const horizonMs = (Number(p.horizon_minutes) || 60) * MINUTE_MS;
      return generatedAt + horizonMs + bufferMs <= now;
    });

    let evaluated = 0;
    let unscorable = 0;
    const userEvaluationMap: Map<string, any[]> = new Map();

    for (const projection of eligible) {
      const userId = projection.user_id || projection.created_by_id;
      if (!userId) continue;

      try {
        // Fetch actual readings for this user from generation time to now.
        // Only this user's readings — never another user's.
        const readings = await sr.entities.GlucoseReading.filter(
          { recorded_at: { $gte: projection.generated_at }, created_by_id: userId },
          "recorded_at", 2000
        );

        // Normalize readings for evaluation.
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

        // Persist the evaluation. Idempotent: status changes from "active" to
        // "evaluated" or "unscorable", so re-runs skip already-scored projections.
        // The original forecast (trajectory, inputs, provenance) is never rewritten.
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
        console.error(`[evaluateProjections] error evaluating ${projection.id}: ${err.message}`);
      }
    }

    // For each user with new evaluations, check for model state updates.
    let stateUpdates = 0;
    let reverts = 0;

    for (const [userId, newEvals] of userEvaluationMap) {
      try {
        // Fetch ALL evaluated projections for this user (not just this batch)
        // so the aggregate metrics reflect the full evaluation history.
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

        // Check if we should revert to baseline (personalized model performing worse).
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
            });
            reverts++;
            continue;
          }
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
            });
            stateUpdates++;
          }
        }
      } catch (err: any) {
        console.error(`[evaluateProjections] error updating state for ${userId}: ${err.message}`);
      }
    }

    console.log(`[evaluateProjections] processed=${eligible.length} evaluated=${evaluated} unscorable=${unscorable} stateUpdates=${stateUpdates} reverts=${reverts}`);

    return Response.json({
      ok: true,
      processed: eligible.length,
      evaluated,
      unscorable,
      stateUpdates,
      reverts,
    });
  } catch (error: any) {
    console.error('[evaluateProjections] fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}