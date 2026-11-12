import { createClientFromRequest } from "npm:@base44/sdk@0.8.52";
import { normalizeInputs, projectGlucose, PROJECTION_MODEL_VERSION, MEAL_RESPONSE_MODEL_VERSION_BASELINE } from "../../shared/insightEngine.ts";
import { resolveModelComponents } from "../../shared/modelResolution.ts";
import { calibrateUncertainty } from "../../shared/uncertaintyCalibration.ts";
import { buildInputSnapshot } from "../../shared/projectionSnapshot.ts";
import { learnRescueCarbModel, observeRescueEpisodes, MIN_EPISODES } from "../../shared/rescueCarbLearning.ts";

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
    // Security: when user_id is passed in the body, the caller MUST be an
    // admin — this prevents a crafted request from generating projections
    // for another user's data.
    let userId: string;
    if (body.user_id) {
      const caller = await base44.auth.me().catch(() => null);
      if (!caller || caller.role !== "admin") {
      // Silent-failure guard: log auth failures so an 8-day outage is never
      // invisible. The workflow runs as admin; if auth.me() returns null or
      // non-admin, the re-anchor pipeline is broken and must be surfaced.
      try {
        await base44.asServiceRole.entities.DiagnosticReport.create({
          topic: `Projection auth failed — ${new Date().toISOString()}`,
          report_text: `Workflow/frontend call passed user_id but caller is not admin (role: ${caller?.role || "none"}). The re-anchor workflow may be invoking generateProjection without proper admin context. This is the silent-failure pattern that caused the Oct 10-17 outage.`,
          report_date: new Date().toISOString(),
          item_count: 1,
        });
      } catch { /* logging must never crash the function */ }
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
      userId = body.user_id;
    } else {
      const authenticatedUser = await base44.auth.me();
      if (!authenticatedUser) return Response.json({ error: "Unauthorized" }, { status: 401 });
      userId = authenticatedUser.id;
    }

    // A forced rebuild is asked for when the model's INPUTS changed but the
    // anchor reading did not — editing a meal's carbs, flipping it to a rescue
    // carb, or deleting a meal or dose. Without it the row for that anchor is
    // treated as complete and the forecast stays stale.
    const forceRefresh = body.force === true;

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

    // ── Rescue-carb learning ────────────────────────────────────────────────
    // Rescue carbs are projected on their own fast absorption term. How much
    // and how quickly this person's glucose actually rises after one is learned
    // from their own logged rescues, so the next rescue is drawn from their
    // history rather than a generic curve. With fewer than MIN_EPISODES clean
    // episodes nothing is changed and the generic profile stands.
    const isf = Number(settings.insulin_sensitivity_mgdl_per_unit);
    const unitsPer5g = Number(settings.meal_insulin_units_per_5g);
    const mgPerGram = isf > 0 && unitsPer5g > 0 ? isf * (unitsPer5g / 5) : 3.0;

    const clamp = (value: unknown, lo: number, hi: number) => {
      const n = Number(value);
      return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 1;
    };

    const rescueStateRows = await base44.asServiceRole.entities.RescueCarbModelState.filter(
      { user_id: userId }, "-created_date", 1
    );
    const rescueState = (rescueStateRows && rescueStateRows.length > 0) ? rescueStateRows[0] : null;

    // The stored factors are what every forecast uses; they are re-learned at
    // most every six hours rather than on each generation, so the longer history
    // this needs is read rarely instead of on every request.
    let rescueParams = {
      magnitudeFactor: clamp(rescueState?.magnitude_factor, 0.7, 1.3),
      speedFactor: clamp(rescueState?.speed_factor, 0.75, 1.35),
    };

    const lastLearnedMs = rescueState?.last_learned_at ? Date.parse(rescueState.last_learned_at) : NaN;
    const LEARNING_INTERVAL_MS = 6 * 60 * 60 * 1000;
    const learningDue = !Number.isFinite(lastLearnedMs) || now - lastLearnedMs > LEARNING_INTERVAL_MS;

    if (learningDue) {
      // A rescue's full rise takes about an hour, so learning needs days of
      // history — far more than the forecast itself reads. Fetched only here.
      const sinceIso = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
      const [learningReadings, learningMeals, learningDoses] = await Promise.all([
        base44.asServiceRole.entities.GlucoseReading.filter(
          { $or: [{ user_id: userId }, { created_by_id: userId }], recorded_at: { $gte: sinceIso } },
          "-recorded_at", 2000
        ),
        base44.asServiceRole.entities.CarbEntry.filter(
          { created_by_id: userId, consumed_at: { $gte: sinceIso } }, "-consumed_at", 300
        ),
        base44.asServiceRole.entities.InsulinDose.filter(
          { created_by_id: userId, administered_at: { $gte: sinceIso } }, "-administered_at", 300
        ),
      ]);

      const rescueEpisodes = observeRescueEpisodes({
        meals: learningMeals || [],
        doses: learningDoses || [],
        readings: learningReadings || [],
        nowMs: now,
      });
      const rescueLearning = learnRescueCarbModel({
        episodes: rescueEpisodes,
        previous: rescueState,
        mgPerGram,
      });
      rescueParams = {
        magnitudeFactor: rescueLearning.magnitudeFactor,
        speedFactor: rescueLearning.speedFactor,
      };

      const patch = {
        magnitude_factor: rescueLearning.magnitudeFactor,
        speed_factor: rescueLearning.speedFactor,
        sample_count: rescueLearning.sampleCount,
        observed_ratio: rescueLearning.observedRatio,
        last_learned_at: new Date(now).toISOString(),
        ...(rescueLearning.changed && rescueLearning.sampleCount >= MIN_EPISODES
          ? { update_history: [
              ...(Array.isArray(rescueState?.update_history) ? rescueState.update_history : []).slice(-19),
              {
                at: new Date(now).toISOString(),
                previous: {
                  magnitude_factor: clamp(rescueState?.magnitude_factor, 0.7, 1.3),
                  speed_factor: clamp(rescueState?.speed_factor, 0.75, 1.35),
                },
                next: {
                  magnitude_factor: rescueLearning.magnitudeFactor,
                  speed_factor: rescueLearning.speedFactor,
                },
                sample_count: rescueLearning.sampleCount,
              },
            ] }
          : {}),
      };
      try {
        if (rescueState) {
          await base44.asServiceRole.entities.RescueCarbModelState.update(rescueState.id, patch);
        } else {
          await base44.asServiceRole.entities.RescueCarbModelState.create({ user_id: userId, ...patch });
        }
      } catch { /* learning is auxiliary: a failed write never blocks the forecast */ }
    }

    // Run the projection engine with the resolved model and calibrated uncertainty.
    const snapshot = normalizeInputs(readings, meals, doses, settings, now);
    // Let the engine resolve the horizon via the close-window rule (meals →
    // 60, insulin only → 30, momentum only → 20). Passing no horizonMin lets
    // resolveHorizonMin(snapshot) decide based on what's driving glucose.
    const result = projectGlucose(snapshot, {
      modelResolution,
      uncertaintyCalibration,
      rescueParams,
    });

    // ── Build immutable input snapshot (Milestone 5.1) ──────────────────────
    // Persist the exact model inputs available at generation time, filtered by
    // created_date <= now (database storage time, not event time). This snapshot
    // is used by shadow evaluation to replay alternative model configurations
    // without future-data leakage from meals, insulin, or readings logged after
    // the projection was generated.
    const inputSnapshot = buildInputSnapshot(readings, meals, doses, settings, modelResolution, now);

    // ── One row per anchor ────────────────────────────────────────────────
    // Two tabs (or the hook and the workflow) can reach this point with the
    // same anchor. A second identical row is never useful, and it made the
    // newest row flip between duplicates seconds apart, so the existing row
    // for this anchor wins and nothing new is written.
    const anchorIso = result.anchor ? new Date(result.anchor.time).toISOString() : null;
    if (anchorIso) {
      const existingForAnchor = await base44.asServiceRole.entities.GlucoseProjection.filter(
        { user_id: userId, anchor_time: anchorIso }, "-generated_at", 1
      );
      if (existingForAnchor.length > 0 && !forceRefresh) {
        return Response.json({ ok: true, skipped: true, reason: "duplicate_anchor", anchor_time: anchorIso });
      }
      // A forced rebuild supersedes the earlier drawing for this same anchor so
      // exactly one row stays current, instead of two rows disagreeing.
      if (existingForAnchor.length > 0 && forceRefresh) {
        try {
          await base44.asServiceRole.entities.GlucoseProjection.updateMany(
            { user_id: userId, anchor_time: anchorIso, status: "active" },
            { $set: { status: "superseded" } }
          );
        } catch { /* the newest row still wins by generated_at */ }
      }
    }

    // Persist the prediction with full provenance.
    const projectionRecord = await base44.asServiceRole.entities.GlucoseProjection.create({
      user_id: userId,
      generated_at: new Date(now).toISOString(),
      model_version: result.modelVersion,
      meal_response_model_version: result.mealModelVersion,
      anchor_time: anchorIso,
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

    // Silent-failure guard: log persistent abstention so an 8-day outage is
    // never invisible. Only log when no successful projection exists in the
    // last 15 min — transient abstention (one reading with insufficient
    // evidence) is normal and shouldn't flood the diagnostic log.
    if (result.abstained) {
      try {
        const lastOk = await base44.asServiceRole.entities.GlucoseProjection.filter(
          { user_id: userId, abstained: false }, "-generated_at", 1
        );
        const lastOkTime = lastOk[0] ? new Date(lastOk[0].generated_at).getTime() : 0;
        if (now - lastOkTime > 15 * 60 * 1000) {
          await base44.asServiceRole.entities.DiagnosticReport.create({
            topic: `Projection abstained — ${new Date(now).toISOString()}`,
            report_text: `User: ${userId.slice(0, 8)}…\nReason: ${result.abstainReason || "insufficient evidence"}\nData quality: ${JSON.stringify(result.dataQuality)}\nLast successful projection: ${lastOk[0] ? new Date(lastOkTime).toISOString() : "never"}`,
            report_date: new Date(now).toISOString(),
            item_count: 1,
          });
        }
      } catch { /* logging must never crash the function */ }
    }

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
    // Silent-failure guard: log every unhandled exception to DiagnosticReport
    // so an 8-day silent outage is impossible. Without this, the catch
    // swallows the error and returns a 500 that nobody checks.
    try {
      await base44.asServiceRole.entities.DiagnosticReport.create({
        topic: `Projection generation failed — ${new Date().toISOString()}`,
        report_text: `User: ${userId || "unknown"}\nError: ${error.message}\nStack: ${(error.stack || "").slice(0, 500)}`,
        report_date: new Date().toISOString(),
        item_count: 1,
      });
    } catch { /* logging must never crash the function */ }
    return Response.json({ error: error.message }, { status: 500 });
  }
}