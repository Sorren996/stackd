// Stackd Insight Engine — Immutable Input Snapshot (Milestone 5.1)
//
// Frontend/testable version of the snapshot module. Mirrors
// base44/shared/projectionSnapshot.ts but imports from the frontend
// insight engine index so it runs in the vitest environment.
//
// See base44/shared/projectionSnapshot.ts for full documentation.

import { normalizeInputs, projectGlucose } from "./index";

export const SNAPSHOT_VERSION = 1;

export function buildInputSnapshot(
  rawReadings,
  rawMeals,
  rawDoses,
  settings,
  modelResolution,
  generatedAt
) {
  const generatedAtMs = new Date(generatedAt).getTime();

  const availableReadings = (Array.isArray(rawReadings) ? rawReadings : [])
    .filter((r) => {
      if (!r) return false;
      const createdDate = r.created_date
        ? new Date(r.created_date).getTime()
        : new Date(r.recorded_at).getTime();
      return Number.isFinite(createdDate) && createdDate <= generatedAtMs;
    })
    .map((r) => ({
      recorded_at: r.recorded_at,
      value: Number(r.value),
      source: String(r.source || "manual"),
    }));

  const availableMeals = (Array.isArray(rawMeals) ? rawMeals : [])
    .filter((m) => {
      if (!m) return false;
      const createdDate = m.created_date
        ? new Date(m.created_date).getTime()
        : new Date(m.consumed_at).getTime();
      return Number.isFinite(createdDate) && createdDate <= generatedAtMs;
    })
    .map((m) => ({
      consumed_at: m.consumed_at,
      carbs: Number(m.carbs) || 0,
      fat_grams: Number(m.fat_grams) || 0,
      protein_grams: Number(m.protein_grams) || 0,
      glycemic_index: Number(m.glycemic_index) || 0,
      absorption_profile: String(m.absorption_profile || "medium"),
      speed_class: m.speed_class || null,
      dual_wave: Boolean(m.dual_wave),
    }));

  const availableDoses = (Array.isArray(rawDoses) ? rawDoses : [])
    .filter((d) => {
      if (!d) return false;
      const createdDate = d.created_date
        ? new Date(d.created_date).getTime()
        : new Date(d.administered_at).getTime();
      return Number.isFinite(createdDate) && createdDate <= generatedAtMs;
    })
    .map((d) => ({
      administered_at: d.administered_at,
      insulin_type: String(d.insulin_type || ""),
      units: Number(d.units) || 0,
    }));

  return {
    version: SNAPSHOT_VERSION,
    generated_at: new Date(generatedAtMs).toISOString(),
    readings: availableReadings,
    meals: availableMeals,
    doses: availableDoses,
    settings: {
      insulin_sensitivity_mgdl_per_unit: Number(settings?.insulin_sensitivity_mgdl_per_unit) || null,
      meal_insulin_units_per_5g: Number(settings?.meal_insulin_units_per_5g) || null,
      target_range_low: Number(settings?.target_range_low) || null,
      target_range_high: Number(settings?.target_range_high) || null,
    },
    model_resolution: modelResolution,
  };
}

export function isSnapshotValid(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;
  if (Number(snapshot.version) !== SNAPSHOT_VERSION) return false;
  if (!snapshot.generated_at) return false;
  const generatedAt = new Date(snapshot.generated_at).getTime();
  if (!Number.isFinite(generatedAt)) return false;
  if (!Array.isArray(snapshot.readings)) return false;
  if (!Array.isArray(snapshot.meals)) return false;
  if (!Array.isArray(snapshot.doses)) return false;
  if (!snapshot.settings || typeof snapshot.settings !== "object") return false;
  return true;
}

export function replayFromSnapshot(
  snapshot,
  horizonMinutes,
  alternativeResolution,
  uncertaintyCalibration
) {
  if (!isSnapshotValid(snapshot)) {
    return {
      trajectory: [],
      modelVersion: alternativeResolution.modelVersion,
      mealModelVersion: alternativeResolution.mealModelVersion,
      abstained: true,
      confidence: 0,
      ineligibleReason: "invalid_or_missing_snapshot",
    };
  }

  const generatedAt = new Date(snapshot.generated_at).getTime();
  const normalized = normalizeInputs(
    snapshot.readings,
    snapshot.meals,
    snapshot.doses,
    snapshot.settings,
    generatedAt
  );

  const result = projectGlucose(normalized, {
    horizonMin: horizonMinutes,
    modelResolution: alternativeResolution,
    uncertaintyCalibration: uncertaintyCalibration ?? null,
  });

  return {
    trajectory: result.trajectory,
    modelVersion: result.modelVersion,
    mealModelVersion: result.mealModelVersion,
    abstained: result.abstained,
    confidence: result.confidence,
    ineligibleReason: null,
  };
}