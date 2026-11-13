import {
  normalizeInputs,
  projectGlucose,
  PROJECTION_MODEL_VERSION,
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
} from "./insightEngine.ts";
import { resolveModelComponents } from "./modelResolution.ts";
import { calibrateUncertainty } from "./uncertaintyCalibration.ts";
import { buildInputSnapshot } from "./projectionSnapshot.ts";
import { learnRescueCarbModel, observeRescueEpisodes, MIN_EPISODES } from "./rescueCarbLearning.ts";

// Shared server-side GlucoseProjection generator.
//
// Used by BOTH:
//   1. `generateProjection` HTTP function (workflow triggers on manual
//      GlucoseReading creation and InsulinDose / CarbEntry create/update/delete,
//      plus the client fallback hook), and
//   2. `projectAfterPersist` called in-process right after Dexcom ingestion
//      stores a new reading (`bulkCreate` emits no entity triggers).
//
// Keeps a single, un-forked projection pipeline and enforces at most one
// GlucoseProjection row per (user_id, anchor_time).
//
// SAFETY: Informational only. Never recommends or modifies insulin doses.

export async function generateProjectionForUser({
  sr,
  userId,
  forceRefresh = false,
  now = Date.now(),
}: {
  sr: any;
  userId: string;
  forceRefresh?: boolean;
  now?: number;
}): Promise<any> {
  // Fast-path anchor guard when inputs did not change: if a projection already
  // exists for this user's newest reading timestamp, skip before loading the
  // full history window. Duplicate readings with the same recorded_at therefore
  // produce at most one GlucoseProjection record.
  if (!forceRefresh) {
    const [latestReadings, latestProjections] = await Promise.all([
      sr.entities.GlucoseReading.filter(
        { $or: [{ user_id: userId }, { created_by_id: userId }] },
        "-recorded_at",
        1
      ),
      sr.entities.GlucoseProjection.filter(
        { user_id: userId },
        "-generated_at",
        1
      ),
    ]);
    const newestReading = Array.isArray(latestReadings) ? latestReadings[0] : null;
    const newestTime = newestReading?.recorded_at ? new Date(newestReading.recorded_at).getTime() : NaN;
    if (Number.isFinite(newestTime) && Number.isFinite(Number(newestReading?.value))) {
      const candidateAnchorIso = new Date(newestTime).toISOString();
      const existingForCandidate = await sr.entities.GlucoseProjection.filter(
        { user_id: userId, anchor_time: candidateAnchorIso },
        "-generated_at",
        1
      );
      if (Array.isArray(existingForCandidate) && existingForCandidate.length > 0) {
        return {
          ok: true,
          skipped: true,
          reason: "duplicate_anchor",
          anchor_time: candidateAnchorIso,
        };
      }
    }
    const latestProj = Array.isArray(latestProjections) ? latestProjections[0] : null;
    if (
      latestProj &&
      latestProj.anchor_time == null &&
      now - new Date(latestProj.generated_at).getTime() < 5 * 60 * 1000 &&
      (!Number.isFinite(newestTime) || now - newestTime > 20 * 60 * 1000)
    ) {
      return {
        ok: true,
        skipped: true,
        reason: "recent_stale_anchor",
        anchor_time: null,
      };
    }
  }

  // Fetch ONLY this user's data. asServiceRole bypasses RLS, so every fetch
  // filters by userId explicitly. GlucoseReading can be service-created
  // (user_id) or manual (created_by_id), so both are matched.
  const [readings, meals, doses, settingsList, stateRows, mealStateRows, evaluatedProjections] =
    await Promise.all([
      sr.entities.GlucoseReading.filter(
        { $or: [{ user_id: userId }, { created_by_id: userId }] },
        "-recorded_at",
        200
      ),
      sr.entities.CarbEntry.filter(
        { created_by_id: userId },
        "-consumed_at",
        100
      ),
      sr.entities.InsulinDose.filter(
        { created_by_id: userId },
        "-administered_at",
        100
      ),
      sr.entities.UserSettings.filter(
        { created_by_id: userId },
        "-created_date",
        1
      ),
      sr.entities.ProjectionModelState.filter(
        { user_id: userId },
        "-created_date",
        1
      ),
      sr.entities.MealResponseModelState.filter(
        { user_id: userId },
        "-created_date",
        1
      ),
      sr.entities.GlucoseProjection.filter(
        { user_id: userId, status: "evaluated" },
        "-generated_at",
        100
      ),
    ]);

  const settings = settingsList && settingsList.length > 0 ? settingsList[0] : {};

  // ── Model resolution (Milestone 4) ──
  const modelState = stateRows && stateRows.length > 0 ? stateRows[0] : null;
  const mealModelState = mealStateRows && mealStateRows.length > 0 ? mealStateRows[0] : null;
  const modelResolution = resolveModelComponents(modelState, mealModelState);

  // ── Rescue-carb learning ────────────────────────────────────────────────
  const isf = Number(settings.insulin_sensitivity_mgdl_per_unit);
  const unitsPer5g = Number(settings.meal_insulin_units_per_5g);
  const mgPerGram = isf > 0 && unitsPer5g > 0 ? isf * (unitsPer5g / 5) : 3.0;

  const clamp = (value: unknown, lo: number, hi: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 1;
  };

  const rescueStateRows = await sr.entities.RescueCarbModelState.filter(
    { user_id: userId },
    "-created_date",
    1
  );
  const rescueState = rescueStateRows && rescueStateRows.length > 0 ? rescueStateRows[0] : null;

  let rescueParams = {
    magnitudeFactor: clamp(rescueState?.magnitude_factor, 0.7, 1.3),
    speedFactor: clamp(rescueState?.speed_factor, 0.75, 1.35),
  };

  const lastLearnedMs = rescueState?.last_learned_at ? Date.parse(rescueState.last_learned_at) : NaN;
  const LEARNING_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const learningDue = !Number.isFinite(lastLearnedMs) || now - lastLearnedMs > LEARNING_INTERVAL_MS;

  if (learningDue) {
    const sinceIso = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const [learningReadings, learningMeals, learningDoses] = await Promise.all([
      sr.entities.GlucoseReading.filter(
        { $or: [{ user_id: userId }, { created_by_id: userId }], recorded_at: { $gte: sinceIso } },
        "-recorded_at",
        2000
      ),
      sr.entities.CarbEntry.filter(
        { created_by_id: userId, consumed_at: { $gte: sinceIso } },
        "-consumed_at",
        300
      ),
      sr.entities.InsulinDose.filter(
        { created_by_id: userId, administered_at: { $gte: sinceIso } },
        "-administered_at",
        300
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
        ? {
            update_history: [
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
            ],
          }
        : {}),
    };
    try {
      if (rescueState) {
        await sr.entities.RescueCarbModelState.update(rescueState.id, patch);
      } else {
        await sr.entities.RescueCarbModelState.create({ user_id: userId, ...patch });
      }
    } catch {
      /* learning is auxiliary: a failed write never blocks the forecast */
    }
  }

  // Run the projection engine with the resolved model and calibrated uncertainty.
  const snapshot = normalizeInputs(readings, meals, doses, settings, now);

  const uncertaintyCalibration = calibrateUncertainty(evaluatedProjections || [], {
    currentModelVersion: PROJECTION_MODEL_VERSION,
    volatilitySd: Number(snapshot.dataQuality?.volatilitySd),
  });

  const result = projectGlucose(snapshot, {
    modelResolution,
    uncertaintyCalibration,
    rescueParams,
  });

  const inputSnapshot = buildInputSnapshot(readings, meals, doses, settings, modelResolution, now);

  // ── One row per anchor ────────────────────────────────────────────────
  const anchorIso = result.anchor ? new Date(result.anchor.time).toISOString() : null;
  if (anchorIso) {
    const existingForAnchor = await sr.entities.GlucoseProjection.filter(
      { user_id: userId, anchor_time: anchorIso },
      "-generated_at",
      1
    );
    if (existingForAnchor.length > 0 && !forceRefresh) {
      return { ok: true, skipped: true, reason: "duplicate_anchor", anchor_time: anchorIso };
    }
    if (existingForAnchor.length > 0 && forceRefresh) {
      try {
        await sr.entities.GlucoseProjection.updateMany(
          { user_id: userId, anchor_time: anchorIso, status: "active" },
          { $set: { status: "superseded" } }
        );
      } catch {
        /* the newest row still wins by generated_at */
      }
    }
  }

  // Persist the prediction with full provenance.
  const projectionRecord = await sr.entities.GlucoseProjection.create({
    user_id: userId,
    generated_at: new Date(now).toISOString(),
    model_version: result.modelVersion,
    meal_response_model_version: result.mealModelVersion,
    anchor_time: anchorIso,
    anchor_value: result.anchor ? result.anchor.value : null,
    measured_velocity_mgdl_per_min: result.measuredVelocity ?? null,
    applied_momentum: result.momentum ?? null,
    horizon_minutes: result.horizonMinutes,
    trajectory: result.trajectory.map((p: any) => ({
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
    model_resolution: modelResolution,
    effective_parameters: result.effectiveParameters,
    uncertainty_info: result.uncertainty,
    confidence: result.confidence,
    abstained: result.abstained,
    abstain_reason: result.abstainReason,
    status: "active",
  });

  // ── One row per anchor, even under a race ─────────────────────────────
  // Pick one deterministic winner (newest generated_at, tie-broken by id) so
  // two concurrent callers never delete each other's row and never leave
  // duplicate active rows for the same (user_id, anchor_time).
  if (anchorIso) {
    try {
      const sameAnchor = await sr.entities.GlucoseProjection.filter(
        { user_id: userId, anchor_time: anchorIso },
        "-generated_at",
        10
      );
      const ordered = [...(Array.isArray(sameAnchor) ? sameAnchor : [])].sort((a: any, b: any) => {
        const dt = new Date(b.generated_at || 0).getTime() - new Date(a.generated_at || 0).getTime();
        if (dt !== 0) return dt;
        return String(b.id || "").localeCompare(String(a.id || ""));
      });
      const winnerId = ordered[0]?.id;
      const duplicates = ordered
        .slice(1)
        .filter((row: any) => row?.id && row.id !== winnerId && row.status !== "evaluated" && row.status !== "processing");
      if (duplicates.length > 0) {
        await Promise.all(
          duplicates.map((row: any) => sr.entities.GlucoseProjection.delete(row.id))
        );
      }
    } catch {
      /* the newest row still wins by generated_at */
    }
  }

  // Silent-failure guard: log persistent abstention when no non-abstained
  // projection exists in the last 15 min.
  if (result.abstained) {
    try {
      const lastOk = await sr.entities.GlucoseProjection.filter(
        { user_id: userId, abstained: false },
        "-generated_at",
        1
      );
      const lastOkTime = lastOk[0] ? new Date(lastOk[0].generated_at).getTime() : 0;
      if (now - lastOkTime > 15 * 60 * 1000) {
        await sr.entities.DiagnosticReport.create({
          topic: `Projection abstained — ${new Date(now).toISOString()}`,
          report_text: `User: ${userId.slice(0, 8)}…\nReason: ${result.abstainReason || "insufficient evidence"}\nData quality: ${JSON.stringify(result.dataQuality)}\nLast successful projection: ${lastOk[0] ? new Date(lastOkTime).toISOString() : "never"}`,
          report_date: new Date(now).toISOString(),
          item_count: 1,
        });
      }
    } catch {
      /* logging must never crash the function */
    }
  }

  // Ensure baseline scaffolding records exist.
  if (!modelState) {
    await sr.entities.ProjectionModelState.create({
      user_id: userId,
      model_version: PROJECTION_MODEL_VERSION,
      parameters: {},
      sample_count: 0,
      evaluation_summary: {},
      last_updated_at: new Date(now).toISOString(),
      baseline_locked: true,
    });
  }

  if (!mealModelState) {
    await sr.entities.MealResponseModelState.create({
      user_id: userId,
      model_version: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
      speed_class_parameters: {},
      sample_counts_by_class: {},
      evaluation_summary: {},
      last_updated_at: new Date(now).toISOString(),
      baseline_locked: true,
    });
  }

  return {
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
    uncertainty_band_source: uncertaintyCalibration.bandSource,
    uncertainty_residual_count: uncertaintyCalibration.residualCount,
    data_quality: result.dataQuality,
  };
}

/**
 * Isolated in-process hand-off called after ingestion persists new readings.
 * Never throws: a projection failure must never block or fail reading ingestion
 * or notification delivery.
 */
export async function projectAfterPersist({
  sr,
  userId,
  forceRefresh = false,
  nowMs = Date.now(),
}: {
  sr: any;
  userId?: string | null;
  forceRefresh?: boolean;
  nowMs?: number;
}): Promise<{ generated: boolean; skipped?: boolean; reason?: string; projectionId?: string }> {
  if (!userId) return { generated: false, skipped: true, reason: "no_owner" };
  try {
    const out = await generateProjectionForUser({
      sr,
      userId,
      forceRefresh,
      now: nowMs,
    });
    if (out?.skipped) {
      return { generated: false, skipped: true, reason: out.reason || "skipped" };
    }
    return {
      generated: Boolean(out?.ok),
      skipped: false,
      projectionId: out?.projection_id,
    };
  } catch (error: any) {
    console.error(
      JSON.stringify({
        diagStage: "PROJECTION_AFTER_PERSIST_FAILED",
        userHash: String(userId).slice(0, 8),
        error: String(error?.message || error).slice(0, 240),
        stack_head: String(error?.stack || "").split("\n").slice(0, 3).join(" | ").slice(0, 300),
      })
    );
    try {
      await sr.entities.DiagnosticReport.create({
        topic: `Projection ingestion hand-off failed — ${new Date(nowMs).toISOString()}`,
        report_text: `User: ${String(userId).slice(0, 8)}…\nError: ${error?.message ?? "unknown"}\nStack: ${(error?.stack || "").slice(0, 500)}`,
        report_date: new Date(nowMs).toISOString(),
        item_count: 1,
      });
    } catch {
      /* logging must never throw */
    }
    return { generated: false, skipped: false, reason: "projection_error" };
  }
}