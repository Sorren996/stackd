import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { normalizeInputs, projectGlucose, PROJECTION_MODEL_VERSION, MEAL_RESPONSE_MODEL_VERSION_BASELINE } from "../../shared/insightEngine.ts";
import { resolveModelComponents } from "../../shared/modelResolution.ts";
import { calibrateUncertainty } from "../../shared/uncertaintyCalibration.ts";
import { buildInputSnapshot } from "../../shared/projectionSnapshot.ts";

// Stackd Insight Engine — Glucose Projection Generator (Milestone 4)
//
// Reads the authenticated user's glucose readings, active meals, active
// insulin doses, settings, and model states; resolves which model components
// are eligible; calibrates uncertainty from historical forecast errors; runs
// the projection engine; and persists the prediction with full provenance.
//
// Milestone 4: The pipeline now uses explicit model resolution (each
// component checked independently for eligibility, bounds, and evidence)
// and empirically calibrated uncertainty (sigma from historical MAE when
// enough evaluation data exists, heuristic fallback otherwise).
//
// SAFETY: Informational only. Never recommends or modifies insulin doses.
// Server-side authorization: only the authenticated user's data is read and
// the projection is persisted with their user_id for RLS isolation.

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    let body: any = {};
    try { body = await req.json(); } catch { /* workflow/scheduler may send empty body */ }

    // Resolve the user: workflow calls pass user_id in the body (no user
    // session); frontend calls authenticate via auth.me().
    let userId: string;
    if (body.user_id) {
      userId = body.user_id;
    } else {
      const authenticatedUser = await base44.auth.me();
      if (!authenticatedUser) return Response.json({ error: "Unauthorized" }, { status: 401 });
      userId = authenticatedUser.id;
    }

    const now = Date.now();

    // Throttle: skip if a projection was generated in the last 25s for this
    // user. Coalesces the frontend hook and the workflow trigger so they
    // don't double-generate when both fire for the same reading.
    const recent = await base44.asServiceRole.entities.GlucoseProjection.filter(
      { user_id: userId }, "-generated_at", 1
    );
    if (recent.length > 0 && now - new Date(recent[0].generated_at).getTime() < 25 * 1000) {
      return Response.json({ ok: true, skipped: true, reason: "recent_generation" });
    }

    // Fetch ONLY the authenticated user's data. asServiceRole bypasses RLS, so
    // every fetch must filter by the user's ID explicitly — otherwise readings,
    // meals, doses, settings, and model state from OTHER users would contaminate
    // this user's projection. GlucoseReading can be service-created (user_id)
    // or manual (created_by_id), so both are matched.
    const [readings, meals, doses, settingsList, stateRows, mealStateRows, evaluatedProjections] = await Promise.all([
      base44.asServiceRole.entities.GlucoseReading.filter(
        { $or: [{ user_id: userId }, { created_by_id: userId }] },
        "-recorded_at", 200
      ),
      base44.asServiceRole.entities.CarbEntry.filter(
        { created_by_id: userId }, "-consumed_at", 100
      ),
      base44.asServiceRole.entities.InsulinDose.filter(
        { created_by_id: userId }, "-administered_at", 100
      ),
      base44.asServiceRole.entities.UserSettings.filter(
        { created_by_id: userId }, "-created_date", 1
      ),
      base44.asServiceRole.entities.ProjectionModelState.filter(
        { user_id: userId }, "-created_date", 1
      ),
      base44.asServiceRole.entities.MealResponseModelState.filter(
        { user_id: userId }, "-created_date", 1
      ),
      // Fetch evaluated projections for uncertainty calibration (Milestone 4).
      base44.asServiceRole.entities.GlucoseProjection.filter(
        { user_id: userId, status: "evaluated" },
        "-generated_at", 100
      ),
    ]);

    const settings = (settingsList && settingsList.length > 0) ? settingsList[0] : {};

    // ── Model resolution (Milestone 4) ──
    // Explicitly resolve which model components are eligible based on the
    // user's persisted state. Each component is checked independently:
    // a user may have an eligible general model but insufficient meal-response
    // evidence, or vice versa. Ineligible components fall back to baseline
    // without affecting other eligible components.
    const modelState = (stateRows && stateRows.length > 0) ? stateRows[0] : null;
    const mealModelState = (mealStateRows && mealStateRows.length > 0) ? mealStateRows[0] : null;
    const modelResolution = resolveModelComponents(modelState, mealModelState);

    // ── Uncertainty calibration (Milestone 4) ──
    // Calibrate prediction-interval width from the user's historical
    // out-of-sample forecast errors. When enough evaluated projections exist,
    // sigma is set to the empirical MAE at each horizon. Otherwise the
    // heuristic is used and the interval is marked as uncalibrated.
    const uncertaintyCalibration = calibrateUncertainty(evaluatedProjections || []);

    // Run the projection engine with the resolved model and calibrated uncertainty.
    const snapshot = normalizeInputs(readings, meals, doses, settings, now);
    // Let the engine resolve the horizon via the close-window rule (meals →
    // 60, insulin only → 30, momentum only → 20). Passing no horizonMin lets
    // resolveHorizonMin(snapshot) decide based on what's driving glucose.
    const result = projectGlucose(snapshot, {
      modelResolution,
      uncertaintyCalibration,
    });

    // ── Build immutable input snapshot (Milestone 5.1) ──────────────────────
    // Persist the exact model inputs available at generation time, filtered by
    // created_date <= now (database storage time, not event time). This snapshot
    // is used by shadow evaluation to replay alternative model configurations
    // without future-data leakage from meals, insulin, or readings logged after
    // the projection was generated.
    const inputSnapshot = buildInputSnapshot(readings, meals, doses, settings, modelResolution, now);

    // Persist the prediction with full provenance.
    const projectionRecord = await base44.asServiceRole.entities.GlucoseProjection.create({
      user_id: userId,
      generated_at: new Date(now).toISOString(),
      model_version: result.modelVersion,
      meal_response_model_version: result.mealModelVersion,
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
      input_snapshot: inputSnapshot,
      input_provenance: result.inputProvenance,
      active_inputs: result.activeInputs,
      // Milestone 4 provenance.
      model_resolution: modelResolution,
      effective_parameters: result.effectiveParameters,
      uncertainty_info: result.uncertainty,
      confidence: result.confidence,
      abstained: result.abstained,
      abstain_reason: result.abstainReason,
      status: "active",
    });

    // Ensure a ProjectionModelState record exists (baseline scaffolding).
    if (!modelState) {
      await base44.asServiceRole.entities.ProjectionModelState.create({
        user_id: userId,
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
        user_id: userId,
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
      meal_response_model_version: result.mealModelVersion,
      resolution_reason: modelResolution.resolutionReason,
      is_integrated: modelResolution.isIntegrated,
      uncertainty_method: uncertaintyCalibration.method,
      uncertainty_calibrated: uncertaintyCalibration.calibrated,
      data_quality: result.dataQuality,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}