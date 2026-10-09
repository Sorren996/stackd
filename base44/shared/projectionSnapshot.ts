// Stackd Insight Engine — Immutable Input Snapshot (Milestone 5.1)
//
// Builds and validates immutable, user-scoped snapshots of the exact model
// inputs available at a projection's generation time. These snapshots are
// persisted on the GlucoseProjection record and used by shadow evaluation to
// replay alternative model configurations WITHOUT future-data leakage.
//
// KEY INVARIANT: A snapshot contains only records whose created_date (the
// moment they were stored in the database) is <= the projection's generated_at
// timestamp. This prevents meals, insulin, or CGM readings that were logged
// or synchronized AFTER the projection was generated from contaminating the
// replay — even if their event time (consumed_at, administered_at, recorded_at)
// is earlier.
//
// SAFETY: Snapshots are user-scoped. A snapshot never contains another user's
// data. The replay function uses only the snapshot's data, never fetching
// current records.
//
// Self-contained (no base44:runtime, no npm: imports) so it runs in both the
// backend function runtime and the vitest test environment.

import { normalizeInputs, projectGlucose } from "./insightEngine.ts";
import type { ModelResolution } from "./modelResolution.ts";
import type { UncertaintyCalibration } from "./uncertaintyCalibration.ts";

// ── Snapshot version ────────────────────────────────────────────────────────
export const SNAPSHOT_VERSION = 1;

// ── Types ────────────────────────────────────────────────────────────────────

export interface InputSnapshot {
  version: number;
  generated_at: string;  // ISO 8601
  readings: Array<{
    recorded_at: string;
    value: number;
    source: string;
  }>;
  meals: Array<{
    consumed_at: string;
    carbs: number;
    fat_grams: number;
    protein_grams: number;
    glycemic_index: number;
    absorption_profile: string;
    speed_class: string | null;
    dual_wave: boolean;
  }>;
  doses: Array<{
    administered_at: string;
    insulin_type: string;
    units: number;
  }>;
  settings: {
    insulin_sensitivity_mgdl_per_unit: number | null;
    meal_insulin_units_per_5g: number | null;
    target_range_low: number | null;
    target_range_high: number | null;
  };
  model_resolution: ModelResolution | null;
}

export interface SnapshotReplayResult {
  trajectory: Array<{ time: number; min_offset: number; value: number; lower: number; upper: number }>;
  modelVersion: string;
  mealModelVersion: string;
  abstained: boolean;
  confidence: number;
  ineligibleReason: string | null;
}

// ── Snapshot building ───────────────────────────────────────────────────────
//
// Builds an immutable snapshot of the model inputs available at generatedAt.
// Each record is filtered by created_date <= generatedAt — the moment it was
// stored in the database, not its event time. This is the authoritative
// availability check: a meal backdated to noon but logged at 3pm is NOT
// available for a projection generated at 1pm.

export function buildInputSnapshot(
  rawReadings: any[],
  rawMeals: any[],
  rawDoses: any[],
  settings: any,
  modelResolution: ModelResolution | null,
  generatedAt: number | string
): InputSnapshot {
  const generatedAtMs = new Date(generatedAt).getTime();

  // Filter readings by created_date (availability), not recorded_at (event time).
  // Fallback to recorded_at only if created_date is missing (test fixtures).
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

  // Filter meals by created_date (when the user logged the meal).
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

  // Filter doses by created_date (when the user logged the dose).
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

// ── Snapshot validation ──────────────────────────────────────────────────────
//
// A snapshot is valid for shadow replay when it has the correct version, a
// parseable generated_at, and all required arrays. Legacy projections without
// a snapshot are invalid.

export function isSnapshotValid(snapshot: any): snapshot is InputSnapshot {
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

// ── Replay from snapshot ────────────────────────────────────────────────────
//
// Replays a projection with an alternative model resolution using ONLY the
// data in the immutable snapshot. Never fetches current records. This ensures
// the replay uses exactly the same inputs that were available at the original
// generation time, with no future-data leakage.

export function replayFromSnapshot(
  snapshot: any,
  horizonMinutes: number,
  alternativeResolution: ModelResolution,
  uncertaintyCalibration?: UncertaintyCalibration | null
): SnapshotReplayResult {
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

  // Reconstruct the normalized snapshot from the immutable input data.
  const normalized = normalizeInputs(
    snapshot.readings,
    snapshot.meals,
    snapshot.doses,
    snapshot.settings,
    generatedAt
  );

  // Run the projection with the alternative resolution.
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