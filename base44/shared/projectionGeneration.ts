import {
  normalizeInputs,
  projectGlucose,
  PROJECTION_MODEL_VERSION,
  MEAL_RESPONSE_MODEL_VERSION_BASELINE,
} from "./insightEngine.ts";
import { resolveModelComponents } from "./modelResolution.ts";
import { calibrateUncertainty } from "./uncertaintyCalibration.ts";
import { buildInputSnapshot } from "./projectionSnapshot.ts";
import { residualBandForUser } from "./projectionBandService.ts";
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

const inFlightByUser = new Map<string, Promise<any>>();
const completedAnchors = new Map<string, number>();
const COMPLETED_ANCHOR_TTL_MS = 15 * 60 * 1000;

function normalizeIsoTimestamp(ts?: string | number | null): string | null {
  if (ts == null || ts === "") return null;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function activeInputScore(row: any): number {
  const dq = row?.data_quality || {};
  return (
    (Number(dq.activeDoseCount) || 0) +
    (Number(dq.activeMealCount) || 0) +
    (Number(dq.activeRescueCarbCount) || 0)
  );
}

function compareProjectionWinners(a: any, b: any, forceRefresh = false): number {
  if (!forceRefresh) {
    const aValid = !a?.abstained && Array.isArray(a?.trajectory) && a.trajectory.length > 0 ? 1 : 0;
    const bValid = !b?.abstained && Array.isArray(b?.trajectory) && b.trajectory.length > 0 ? 1 : 0;
    if (bValid !== aValid) return bValid - aValid;

    const scoreDiff = activeInputScore(b) - activeInputScore(a);
    if (scoreDiff !== 0) return scoreDiff;

    const horizonDiff = (Number(b?.horizon_minutes) || 0) - (Number(a?.horizon_minutes) || 0);
    if (horizonDiff !== 0) return horizonDiff;
  }
  const dt = new Date(b?.generated_at || 0).getTime() - new Date(a?.generated_at || 0).getTime();
  if (dt !== 0) return dt;
  return String(b?.id || "").localeCompare(String(a?.id || ""));
}

async function runGenerateProjectionForUser({
  sr,
  userId,
  anchorTimestamp = null,
  forceRefresh = false,
  now = Date.now(),
}: {
  sr: any;
  userId: string;
  anchorTimestamp?: string | number | null;
  forceRefresh?: boolean;
  now?: number;
}): Promise<any> {
  const normalizedUserId = typeof userId === "string" ? userId.trim() : "";
  if (!normalizedUserId || normalizedUserId === "null" || normalizedUserId === "undefined") {
    console.error(JSON.stringify({ diagStage: "PROJECTION_INVALID_USER", userId }));
    return { ok: false, skipped: true, reason: "invalid_user_id" };
  }

  // Verify the reading owner is an existing active user account. Orphaned
  // DexcomConnection rows left behind by deleted accounts must never write
  // zero-dose projections. If the user lookup fails for another reason, log an
  // error and write nothing rather than guessing inputs.
  try {
    const ownerAccount = await sr.entities.User.get(normalizedUserId);
    if (!ownerAccount || ownerAccount.account_status === "disabled") {
      return { ok: true, skipped: true, reason: "user_not_found" };
    }
  } catch (err: any) {
    if (Number(err?.status) === 404) {
      return { ok: true, skipped: true, reason: "user_not_found" };
    }
    console.error(
      JSON.stringify({
        diagStage: "PROJECTION_USER_LOAD_FAILED",
        userHash: normalizedUserId.slice(0, 8),
        error: String(err?.message || err).slice(0, 200),
      })
    );
    return { ok: false, skipped: true, reason: "user_load_failed" };
  }

  const callerAnchorIso = normalizeIsoTimestamp(anchorTimestamp);
  if (!forceRefresh && callerAnchorIso) {
    const cacheKey = `${normalizedUserId}|${callerAnchorIso}`;
    const cachedAt = completedAnchors.get(cacheKey);
    if (cachedAt && now - cachedAt < COMPLETED_ANCHOR_TTL_MS) {
      return { ok: true, skipped: true, reason: "duplicate_anchor", anchor_time: callerAnchorIso };
    }
    const existingForCallerAnchor = await sr.entities.GlucoseProjection.filter(
      { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }], anchor_time: callerAnchorIso },
      "-generated_at",
      1
    );
    if (Array.isArray(existingForCallerAnchor) && existingForCallerAnchor.length > 0) {
      completedAnchors.set(cacheKey, now);
      return {
        ok: true,
        skipped: true,
        reason: "duplicate_anchor",
        anchor_time: callerAnchorIso,
        projection_id: existingForCallerAnchor[0].id,
      };
    }
  }

  // Fast-path anchor guard when inputs did not change: if a projection already
  // exists for this user's newest reading timestamp, skip before loading the
  // full history window. Duplicate readings with the same recorded_at therefore
  // produce at most one GlucoseProjection record.
  if (!forceRefresh) {
    try {
      const [latestReadings, latestProjections] = await Promise.all([
        sr.entities.GlucoseReading.filter(
          { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }] },
          "-recorded_at",
          1
        ),
        sr.entities.GlucoseProjection.filter(
          { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }] },
          "-generated_at",
          1
        ),
      ]);
      const newestReading = Array.isArray(latestReadings) ? latestReadings[0] : null;
      const newestTime = newestReading?.recorded_at ? new Date(newestReading.recorded_at).getTime() : NaN;
      if (Number.isFinite(newestTime) && Number.isFinite(Number(newestReading?.value))) {
        const candidateAnchorIso = new Date(newestTime).toISOString();
        const existingForCandidate = await sr.entities.GlucoseProjection.filter(
          { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }], anchor_time: candidateAnchorIso },
          "-generated_at",
          1
        );
        if (Array.isArray(existingForCandidate) && existingForCandidate.length > 0) {
          completedAnchors.set(`${normalizedUserId}|${candidateAnchorIso}`, now);
          return {
            ok: true,
            skipped: true,
            reason: "duplicate_anchor",
            anchor_time: candidateAnchorIso,
            projection_id: existingForCandidate[0].id,
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
    } catch (guardErr: any) {
      console.error(
        JSON.stringify({
          diagStage: "PROJECTION_ANCHOR_GUARD_FAILED",
          userHash: normalizedUserId.slice(0, 8),
          error: String(guardErr?.message || guardErr).slice(0, 200),
        })
      );
      return { ok: false, skipped: true, reason: "input_load_failed" };
    }
  }

  // Fetch ONLY this user's data by explicit user id. asServiceRole bypasses RLS,
  // so every query is explicitly scoped to normalizedUserId. If ANY input query
  // fails, log an error and write nothing — never fall back to empty doses/meals.
  let readings: any[];
  let meals: any[];
  let doses: any[];
  let settingsList: any[];
  let stateRows: any[];
  let mealStateRows: any[];
  let rescueStateRows: any[];
  let evaluatedProjections: any[];

  try {
    [
      readings,
      meals,
      doses,
      settingsList,
      stateRows,
      mealStateRows,
      rescueStateRows,
      evaluatedProjections,
    ] = await Promise.all([
      sr.entities.GlucoseReading.filter(
        { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }] },
        "-recorded_at",
        200
      ),
      sr.entities.CarbEntry.filter(
        { created_by_id: normalizedUserId },
        "-consumed_at",
        100
      ),
      sr.entities.InsulinDose.filter(
        { created_by_id: normalizedUserId },
        "-administered_at",
        100
      ),
      sr.entities.UserSettings.filter(
        { created_by_id: normalizedUserId },
        "-updated_date",
        5
      ),
      sr.entities.ProjectionModelState.filter(
        { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }] },
        "-created_date",
        1
      ),
      sr.entities.MealResponseModelState.filter(
        { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }] },
        "-created_date",
        1
      ),
      sr.entities.RescueCarbModelState.filter(
        { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }] },
        "-created_date",
        1
      ),
      sr.entities.GlucoseProjection.filter(
        { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }], status: "evaluated" },
        "-generated_at",
        100
      ),
    ]);
    if (
      !Array.isArray(readings) ||
      !Array.isArray(meals) ||
      !Array.isArray(doses) ||
      !Array.isArray(settingsList)
    ) {
      throw new Error("Non-array response while loading projection inputs");
    }
  } catch (loadErr: any) {
    console.error(
      JSON.stringify({
        diagStage: "PROJECTION_INPUT_LOAD_FAILED",
        userHash: normalizedUserId.slice(0, 8),
        error: String(loadErr?.message || loadErr).slice(0, 240),
      })
    );
    return { ok: false, skipped: true, reason: "input_load_failed" };
  }

  const settings =
    settingsList.find((row: any) => row?.settings_confirmed === true) ||
    settingsList[0] ||
    {};

  // ── Model resolution (Milestone 4) ──
  const modelState = Array.isArray(stateRows) && stateRows.length > 0 ? stateRows[0] : null;
  const mealModelState = Array.isArray(mealStateRows) && mealStateRows.length > 0 ? mealStateRows[0] : null;
  const modelResolution = resolveModelComponents(modelState, mealModelState);

  // ── Rescue-carb learning ────────────────────────────────────────────────
  const isf = Number(settings.insulin_sensitivity_mgdl_per_unit);
  const unitsPer5g = Number(settings.meal_insulin_units_per_5g);
  const mgPerGram = isf > 0 && unitsPer5g > 0 ? isf * (unitsPer5g / 5) : 3.0;

  const clamp = (value: unknown, lo: number, hi: number) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : 1;
  };

  const rescueState = Array.isArray(rescueStateRows) && rescueStateRows.length > 0 ? rescueStateRows[0] : null;

  let rescueParams = {
    magnitudeFactor: clamp(rescueState?.magnitude_factor, 0.7, 1.3),
    speedFactor: clamp(rescueState?.speed_factor, 0.75, 1.35),
  };

  const lastLearnedMs = rescueState?.last_learned_at ? Date.parse(rescueState.last_learned_at) : NaN;
  const LEARNING_INTERVAL_MS = 6 * 60 * 60 * 1000;
  const learningDue = !Number.isFinite(lastLearnedMs) || now - lastLearnedMs > LEARNING_INTERVAL_MS;

  if (learningDue) {
    try {
      const sinceIso = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
      const [learningReadings, learningMeals, learningDoses] = await Promise.all([
        sr.entities.GlucoseReading.filter(
          { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }], recorded_at: { $gte: sinceIso } },
          "-recorded_at",
          2000
        ),
        sr.entities.CarbEntry.filter(
          { created_by_id: normalizedUserId, consumed_at: { $gte: sinceIso } },
          "-consumed_at",
          300
        ),
        sr.entities.InsulinDose.filter(
          { created_by_id: normalizedUserId, administered_at: { $gte: sinceIso } },
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
      if (rescueState) {
        await sr.entities.RescueCarbModelState.update(rescueState.id, patch);
      } else {
        await sr.entities.RescueCarbModelState.create({ user_id: normalizedUserId, ...patch });
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

  // The median trajectory is untouched. Only its interval and useful drawn horizon
  // are replaced, using this user's clean, signed, per-horizon residuals.
  if (!result.abstained && result.trajectory.length) {
    const band = await residualBandForUser(sr, normalizedUserId, result.trajectory,
      Number(snapshot.dataQuality?.volatilitySd), now);
    result.trajectory = band.trajectory;
    result.horizonMinutes = band.summary.trajectoryEndsAtMinutes;
    result.uncertaintySummary = {
      ...band.summary,
      defaultSource: { ...result.uncertaintySummary, method: uncertaintyCalibration.method,
        bandSource: uncertaintyCalibration.bandSource, usedOnlyBelow30Samples: true },
    };
    result.uncertainty = { ...result.uncertainty, method: band.summary.method,
      version: band.summary.version, calibrated: !band.summary.defaultBlend,
      sampleCount: band.summary.sampleCount, coverageObserved: band.summary.coverage,
      bandSource: 'user_residual_quantiles', residualCount: band.summary.sampleCount };
  }

  const inputSnapshot = buildInputSnapshot(readings, meals, doses, settings, modelResolution, now);
  const anchorIso = result.anchor ? new Date(result.anchor.time).toISOString() : null;

  const recordPayload = {
    user_id: normalizedUserId,
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
  };

  // ── Race-safe single row per (user_id, anchor_time) ───────────────────
  let projectionRecord: any = null;
  if (anchorIso) {
    const existingForAnchor = await sr.entities.GlucoseProjection.filter(
      { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }], anchor_time: anchorIso },
      "-generated_at",
      10
    );
    const orderedExisting = [...(Array.isArray(existingForAnchor) ? existingForAnchor : [])].sort((a, b) =>
      compareProjectionWinners(a, b, forceRefresh)
    );
    const existingWinner = orderedExisting[0] || null;

    if (existingWinner && !forceRefresh) {
      // Clean up any concurrent duplicate rows while keeping the single winner.
      const extraRows = orderedExisting
        .slice(1)
        .filter((row: any) => row?.id && row.status !== "evaluated" && row.status !== "processing");
      if (extraRows.length > 0) {
        await Promise.all(extraRows.map((row: any) => sr.entities.GlucoseProjection.delete(row.id))).catch(() => {});
      }
      completedAnchors.set(`${normalizedUserId}|${anchorIso}`, now);
      return {
        ok: true,
        skipped: true,
        reason: "duplicate_anchor",
        anchor_time: anchorIso,
        projection_id: existingWinner.id,
      };
    }

    if (existingWinner && forceRefresh && existingWinner.status !== "evaluated" && existingWinner.status !== "processing") {
      // Update in place rather than inserting a second row for the same anchor.
      projectionRecord = await sr.entities.GlucoseProjection.update(existingWinner.id, recordPayload);
      const extraRows = orderedExisting
        .slice(1)
        .filter((row: any) => row?.id && row.id !== existingWinner.id && row.status !== "evaluated" && row.status !== "processing");
      if (extraRows.length > 0) {
        await Promise.all(extraRows.map((row: any) => sr.entities.GlucoseProjection.delete(row.id))).catch(() => {});
      }
    }
  }

  if (!projectionRecord) {
    projectionRecord = await sr.entities.GlucoseProjection.create(recordPayload);
  }

  if (anchorIso) {
    completedAnchors.set(`${normalizedUserId}|${anchorIso}`, now);
    if (completedAnchors.size > 300) {
      const oldestKey = completedAnchors.keys().next().value;
      if (oldestKey) completedAnchors.delete(oldestKey);
    }

    // Post-write race reconciliation: if two workers crossed the pre-write check
    // simultaneously, keep one deterministic winner and remove the duplicate(s).
    try {
      const sameAnchor = await sr.entities.GlucoseProjection.filter(
        { $or: [{ user_id: normalizedUserId }, { created_by_id: normalizedUserId }], anchor_time: anchorIso },
        "-generated_at",
        10
      );
      const ordered = [...(Array.isArray(sameAnchor) ? sameAnchor : [])].sort((a, b) =>
        compareProjectionWinners(a, b, forceRefresh)
      );
      const winner = ordered[0];
      if (winner?.id) projectionRecord = winner;
      const duplicates = ordered
        .slice(1)
        .filter((row: any) => row?.id && row.id !== winner?.id && row.status !== "evaluated" && row.status !== "processing");
      if (duplicates.length > 0) {
        await Promise.all(duplicates.map((row: any) => sr.entities.GlucoseProjection.delete(row.id)));
      }
    } catch {
      /* reconciliation is best-effort */
    }
  }

  // Silent-failure guard: log persistent abstention when no non-abstained
  // projection exists in the last 15 min.
  if (result.abstained) {
    try {
      const lastOk = await sr.entities.GlucoseProjection.filter(
        { user_id: normalizedUserId, abstained: false },
        "-generated_at",
        1
      );
      const lastOkTime = lastOk[0] ? new Date(lastOk[0].generated_at).getTime() : 0;
      if (now - lastOkTime > 15 * 60 * 1000) {
        await sr.entities.DiagnosticReport.create({
          topic: `Projection abstained — ${new Date(now).toISOString()}`,
          report_text: `User: ${normalizedUserId.slice(0, 8)}…\nReason: ${result.abstainReason || "insufficient evidence"}\nData quality: ${JSON.stringify(result.dataQuality)}\nLast successful projection: ${lastOk[0] ? new Date(lastOkTime).toISOString() : "never"}`,
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
    try {
      await sr.entities.ProjectionModelState.create({
        user_id: normalizedUserId,
        model_version: PROJECTION_MODEL_VERSION,
        parameters: {},
        sample_count: 0,
        evaluation_summary: {},
        last_updated_at: new Date(now).toISOString(),
        baseline_locked: true,
      });
    } catch {
      /* non-fatal */
    }
  }

  if (!mealModelState) {
    try {
      await sr.entities.MealResponseModelState.create({
        user_id: normalizedUserId,
        model_version: MEAL_RESPONSE_MODEL_VERSION_BASELINE,
        speed_class_parameters: {},
        sample_counts_by_class: {},
        evaluation_summary: {},
        last_updated_at: new Date(now).toISOString(),
        baseline_locked: true,
      });
    } catch {
      /* non-fatal */
    }
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
    uncertainty_method: result.uncertainty?.method ?? uncertaintyCalibration.method,
    uncertainty_calibrated: result.uncertainty?.calibrated ?? false,
    uncertainty_band_source: result.uncertainty?.bandSource ?? uncertaintyCalibration.bandSource,
    uncertainty_residual_count: result.uncertainty?.residualCount ?? 0,
    data_quality: result.dataQuality,
  };
}

export async function generateProjectionForUser(params: {
  sr: any;
  userId: string;
  anchorTimestamp?: string | number | null;
  forceRefresh?: boolean;
  now?: number;
}): Promise<any> {
  const key = typeof params.userId === "string" ? params.userId.trim() : "";
  if (!key || params.forceRefresh) {
    if (key && params.forceRefresh) {
      for (const cacheKey of completedAnchors.keys()) {
        if (cacheKey.startsWith(`${key}|`)) completedAnchors.delete(cacheKey);
      }
    }
    return runGenerateProjectionForUser(params);
  }
  const existing = inFlightByUser.get(key);
  if (existing) return existing;
  const promise = runGenerateProjectionForUser(params).finally(() => {
    if (inFlightByUser.get(key) === promise) inFlightByUser.delete(key);
  });
  inFlightByUser.set(key, promise);
  return promise;
}

/**
 * Isolated in-process hand-off called after ingestion persists new readings.
 * Never throws: a projection failure must never block or fail reading ingestion
 * or notification delivery.
 */
export async function projectAfterPersist({
  sr,
  userId,
  anchorTimestamp = null,
  forceRefresh = false,
  nowMs = Date.now(),
}: {
  sr: any;
  userId?: string | null;
  anchorTimestamp?: string | number | null;
  forceRefresh?: boolean;
  nowMs?: number;
}): Promise<{ generated: boolean; skipped?: boolean; reason?: string; projectionId?: string }> {
  if (!userId) return { generated: false, skipped: true, reason: "no_owner" };
  try {
    const out = await generateProjectionForUser({
      sr,
      userId,
      anchorTimestamp,
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