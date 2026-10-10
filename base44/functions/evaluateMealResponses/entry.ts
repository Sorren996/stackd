// Stackd Insight Engine — Meal-Response Evaluation Pipeline (Milestone 3)
//
// Evaluates completed MealResponseAnalysis records to learn per-speed-class
// meal-response parameters (speedFactor and magnitudeFactor) from the user's
// observed CGM responses. Updates the user's MealResponseModelState when
// sufficient evidence supports it, with baseline fallback.
//
// Scheduled by the "Evaluate Meal Responses" workflow (every 2 hours). Does
// not block the dashboard or run on every meal log.
//
// Idempotency: MealResponseAnalysis records are re-evaluated each run, but
// the learning is deterministic — the same observations always produce the
// same parameters. The state update_history records every accepted change.
//
// User isolation: each user's analyses are evaluated independently. Model
// state updates are per-user.
//
// SAFETY: Never recommends, prescribes, or calculates insulin doses. Only
// adjusts multiplicative factors that shape the meal-response component of
// future glucose projections.
//
// SCOPE: speedFactor and magnitudeFactor are EMPIRICAL meal-response
// parameters derived from the user's observed CGM responses — NOT direct
// measurements of carbohydrate absorption physiology. They describe what the
// baseline model tended to get wrong for this user's meals of a given class;
// they never prescribe or recommend any clinical action.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { requireBatchCaller } from "../../shared/batchAuth.ts";
import {
  buildMealTrainingObservation,
  aggregateMealClassObservations,
  shouldUpdateMealClass,
  applyMealClassUpdate,
  validateMealPersonalization,
  revertMealClassToBaseline,
  MEAL_EVALUATION_VERSION,
} from "../../shared/mealResponseLearning.ts";
import {
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
  MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED,
} from "../../shared/insightEngine.ts";

const SPEED_CLASSES = ["fast", "mixed", "high_fat"] as const;

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const denied = await requireBatchCaller(base44);
    if (denied) return denied;
    let body: any = {};
    try { body = await req.json(); } catch { /* scheduler may send empty body */ }
    const limit = Math.min(Number(body.limit) || 200, 500);
    const sr = base44.asServiceRole;

    // Find completed MealResponseAnalysis records.
    const analyses = await sr.entities.MealResponseAnalysis.filter(
      { analysis_status: "complete" },
      "-meal_time", limit
    );

    if (!analyses || analyses.length === 0) {
      return Response.json({ ok: true, processed: 0, updates: 0, reverts: 0, reason: "no_completed_analyses" });
    }

    // Group analyses by user.
    const userAnalyses: Map<string, any[]> = new Map();
    for (const a of analyses) {
      const userId = a.user_id || a.created_by_id;
      if (!userId) continue;
      if (!userAnalyses.has(userId)) userAnalyses.set(userId, []);
      userAnalyses.get(userId)!.push(a);
    }

    let totalUpdates = 0;
    let totalReverts = 0;
    let totalProcessed = 0;

    for (const [userId, userAnalysisList] of userAnalyses) {
      try {
        // Fetch the user's settings for calibration.
        const settingsRows = await sr.entities.UserSettings.filter(
          { created_by_id: userId }, "-created_date", 1
        );
        const settings = settingsRows?.[0] || {};

        // Fetch the user's meal entries (for macro/speed-class data).
        const mealIds = userAnalysisList.map((a) => a.meal_log_id).filter(Boolean);
        const mealEntries = mealIds.length > 0
          ? await sr.entities.CarbEntry.filter({ id: { $in: mealIds } }, "-consumed_at", 500)
          : [];

        const mealMap = new Map<string, any>();
        for (const m of mealEntries) mealMap.set(m.id, m);

        // Build training observations.
        const observations = userAnalysisList.map((a) => {
          const mealEntry = mealMap.get(a.meal_log_id) || null;
          return buildMealTrainingObservation(a, mealEntry, settings);
        });

        totalProcessed += observations.length;

        // Fetch or create the user's MealResponseModelState.
        const stateRows = await sr.entities.MealResponseModelState.filter(
          { user_id: userId }, "-created_date", 1
        );
        let state = stateRows?.[0] || null;

        if (!state) {
          state = await sr.entities.MealResponseModelState.create({
            user_id: userId,
            model_version: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
            speed_class_parameters: {},
            sample_counts_by_class: {},
            evaluation_summary: {},
            last_updated_at: new Date().toISOString(),
            baseline_locked: true,
          });
        }

        // Process each speed class independently.
        for (const speedClass of SPEED_CLASSES) {
          const aggregate = aggregateMealClassObservations(observations, speedClass);

          // ── Validation: compare baseline vs personalized for this class ──
          // Only when we already have personalized params for this class.
          const currentParams = state.speed_class_parameters?.[speedClass];
          const hasPersonalization = currentParams &&
            (Math.abs(Number(currentParams.speed_factor) - 1.0) > 0.001 ||
             Math.abs(Number(currentParams.magnitude_factor) - 1.0) > 0.001);

          if (hasPersonalization && aggregate.sampleCount >= 3) {
            // Compute baseline and personalized MAE for meal-containing projections.
            const baselineMetrics = await computeClassForecastMetrics(sr, userId, speedClass, MEAL_RESPONSE_MODEL_VERSION_BASELINE);
            const personalizedMetrics = await computeClassForecastMetrics(sr, userId, speedClass, MEAL_RESPONSE_MODEL_VERSION_PERSONALIZED);

            const validation = validateMealPersonalization(baselineMetrics, personalizedMetrics);
            if (validation.shouldRevert) {
              const { updatedState, provenance } = revertMealClassToBaseline(state, speedClass, validation);
              if (provenance) {
                state = updatedState;
                await sr.entities.MealResponseModelState.update(state.id, {
                  speed_class_parameters: state.speed_class_parameters,
                  sample_counts_by_class: state.sample_counts_by_class,
                  baseline_locked: state.baseline_locked,
                  evaluation_summary: state.evaluation_summary,
                  last_updated_at: state.last_updated_at,
                  update_history: state.update_history,
                });
                totalReverts++;
                continue;
              }
            }
          }

          // ── Learning: check for parameter update ──
          const decision = shouldUpdateMealClass(state, speedClass, aggregate);
          if (decision.shouldUpdate) {
            const { updatedState, provenance } = applyMealClassUpdate(state, speedClass, aggregate, decision);
            if (provenance) {
              state = updatedState;
              await sr.entities.MealResponseModelState.update(state.id, {
                model_version: state.model_version,
                speed_class_parameters: state.speed_class_parameters,
                sample_counts_by_class: state.sample_counts_by_class,
                baseline_locked: state.baseline_locked,
                evaluation_summary: state.evaluation_summary,
                last_updated_at: state.last_updated_at,
                update_history: state.update_history,
              });
              totalUpdates++;
            }
          }
        }
      } catch (err: any) {
        console.error(`[evaluateMealResponses] error for user ${userId}: ${err.message}`);
      }
    }

    console.log(`[evaluateMealResponses] processed=${totalProcessed} users=${userAnalyses.size} updates=${totalUpdates} reverts=${totalReverts}`);

    return Response.json({
      ok: true,
      processed: totalProcessed,
      users: userAnalyses.size,
      updates: totalUpdates,
      reverts: totalReverts,
    });
  } catch (error: any) {
    console.error('[evaluateMealResponses] fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// ── Forecast metrics for validation ──────────────────────────────────────────
// Computes the mean absolute error of meal-containing projections for a
// given meal-response model version and speed class. Used to compare baseline
// vs personalized meal-response performance.
//
// LIMITATION: The total glucose forecast error CANNOT isolate the
// meal-response component: the forecast includes carb + insulin + momentum
// contributions. A difference in MAE may reflect changes in the user's
// overall glucose management between eras, not just the meal-response
// parameter change. This is documented honestly and the tolerance is
// conservative.

async function computeClassForecastMetrics(
  sr: any,
  userId: string,
  speedClass: string,
  mealModelVersion: string
): Promise<{ mae: number; count: number } | null> {
  try {
    // Fetch evaluated projections with this meal-response model version that
    // had active meals of this speed class.
    const projections = await sr.entities.GlucoseProjection.filter(
      {
        user_id: userId,
        status: "evaluated",
        meal_response_model_version: mealModelVersion,
      },
      "-generated_at", 200
    );

    if (!projections || projections.length === 0) return null;

    // Filter to projections that had this speed class active.
    const classProjections = projections.filter((p: any) => {
      const activeClasses = p.active_inputs?.active_speed_classes;
      return Array.isArray(activeClasses) && activeClasses.includes(speedClass);
    });

    if (classProjections.length === 0) return null;

    // Compute MAE from the evaluation field.
    let totalError = 0;
    let count = 0;
    for (const p of classProjections) {
      const mae = Number(p.evaluation?.mae);
      if (Number.isFinite(mae) && mae > 0) {
        totalError += mae;
        count++;
      }
    }

    if (count === 0) return null;
    return { mae: totalError / count, count };
  } catch {
    return null;
  }
}