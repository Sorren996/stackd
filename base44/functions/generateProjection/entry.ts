import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { normalizeInputs, projectGlucose, PROJECTION_MODEL_VERSION, MEAL_RESPONSE_MODEL_VERSION_BASELINE } from "../../shared/insightEngine.ts";
import { resolveMealModelParams, getMealModelVersion } from "../../shared/mealResponseLearning.ts";

// Stackd Insight Engine — Glucose Projection Generator (Milestone 1 + 3)
//
// Reads the authenticated user's glucose readings, active meals, active
// insulin doses, and settings; runs the projection engine; and persists the
// prediction with full provenance so Milestone 2 can evaluate it against
// actual outcomes without data leakage.
//
// Milestone 3: Also reads the user's MealResponseModelState to apply learned
// per-class speed and magnitude factors to the meal-response component of
// the projection. The meal-response model version is recorded separately
// from the general forecast model version so meal-response personalization
// can be evaluated independently.
//
// Also ensures ProjectionModelState and MealResponseModelState records exist
// for the user (baseline-locked scaffolding for personalization).
//
// SAFETY: Informational only. Never recommends or modifies insulin doses.
// Server-side authorization: only the authenticated user's data is read and
// the projection is persisted with their user_id for RLS isolation.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const now = Date.now();

    // Fetch the user's data in parallel. Use the service role so we can set
    // user_id on the persisted projection record (RLS lets the owning user
    // read it back).
    const [readings, meals, doses, settingsList, stateRows, mealStateRows] = await Promise.all([
      base44.asServiceRole.entities.GlucoseReading.list("-recorded_at", 200),
      base44.asServiceRole.entities.CarbEntry.list("-consumed_at", 100),
      base44.asServiceRole.entities.InsulinDose.list("-administered_at", 100),
      base44.asServiceRole.entities.UserSettings.list("-created_date", 1),
      base44.asServiceRole.entities.ProjectionModelState.list("-created_date", 1),
      base44.asServiceRole.entities.MealResponseModelState.list("-created_date", 1),
    ]);

    const settings = (settingsList && settingsList.length > 0) ? settingsList[0] : {};

    // ── General forecast model state (Milestone 2) ──
    // rateAdjustmentFactor is a single learned correction for systematic
    // prediction bias — not a model of the individual's glucose physiology.
    const modelState = (stateRows && stateRows.length > 0) ? stateRows[0] : null;
    const rateAdjustmentFactor = Number(modelState?.parameters?.rateAdjustmentFactor) || 1.0;
    const modelParams = Math.abs(rateAdjustmentFactor - 1.0) > 0.001
      ? { rateAdjustmentFactor }
      : null;

    // ── Meal-response model state (Milestone 3) ──
    // Per-class speedFactor and magnitudeFactor are EMPIRICAL corrections
    // derived from the user's observed meal responses — NOT measurements of
    // carbohydrate absorption physiology. They shape the meal-response
    // component of the projection; they never prescribe clinical action.
    const mealModelState = (mealStateRows && mealStateRows.length > 0) ? mealStateRows[0] : null;
    const mealModelParams = resolveMealModelParams(mealModelState);
    const mealModelVersion = getMealModelVersion(mealModelState);

    // Run the projection engine.
    const snapshot = normalizeInputs(readings, meals, doses, settings, now);
    const result = projectGlucose(snapshot, { horizonMin: 60, modelParams, mealModelParams });

    // Persist the prediction with provenance.
    const projectionRecord = await base44.asServiceRole.entities.GlucoseProjection.create({
      user_id: user.id,
      generated_at: new Date(now).toISOString(),
      model_version: result.modelVersion,
      meal_response_model_version: mealModelVersion,
      anchor_time: result.anchor ? new Date(result.anchor.time).toISOString() : null,
      anchor_value: result.anchor ? result.anchor.value : null,
      horizon_minutes: result.horizonMinutes,
      trajectory: result.trajectory.map((p) => ({
        time: new Date(p.time).toISOString(),
        min_offset: p.min_offset,
        value: p.value,
        lower: p.lower,
        upper: p.upper,
      })),
      uncertainty_summary: result.uncertaintySummary,
      data_quality: result.dataQuality,
      input_provenance: result.inputProvenance,
      active_inputs: result.activeInputs,
      confidence: result.confidence,
      abstained: result.abstained,
      abstain_reason: result.abstainReason,
      status: "active",
    });

    // Ensure a ProjectionModelState record exists (baseline scaffolding).
    if (!modelState) {
      await base44.asServiceRole.entities.ProjectionModelState.create({
        user_id: user.id,
        model_version: PROJECTION_MODEL_VERSION,
        parameters: {},
        sample_count: 0,
        evaluation_summary: {},
        last_updated_at: new Date(now).toISOString(),
        baseline_locked: true,
      });
    }

    // Ensure a MealResponseModelState record exists (baseline scaffolding).
    if (!mealModelState) {
      await base44.asServiceRole.entities.MealResponseModelState.create({
        user_id: user.id,
        model_version: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
        speed_class_parameters: {},
        sample_counts_by_class: {},
        evaluation_summary: {},
        last_updated_at: new Date(now).toISOString(),
        baseline_locked: true,
      });
    }

    return Response.json({
      ok: true,
      projection_id: projectionRecord.id,
      abstained: result.abstained,
      abstain_reason: result.abstainReason,
      confidence: result.confidence,
      anchor: result.anchor,
      trajectory_length: result.trajectory.length,
      model_version: result.modelVersion,
      meal_response_model_version: mealModelVersion,
      data_quality: result.dataQuality,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}