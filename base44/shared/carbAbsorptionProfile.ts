// Shared carb absorption profile — continuous curve generation + learning math.
// Imported by BOTH the backend (classifyLogEntry persists curve params on each
// CarbEntry, processMealAnalyses updates per-class learning) and mirrors the
// frontend carbAbsorption model so the stored curve always reconciles with
// what's rendered. The estimated absorption curve is an ESTIMATE derived from
// the logged meal composition — never a measurement, never a dosing
// recommendation.

const MINUTE_MS = 60 * 1000;

// A single meal's macros can span different entries, so classification uses the
// entry's own absorption_profile / glycemic index plus high-fat-protein macro
// thresholds — the same rule that drives extended monitoring.
export type SpeedClass = "fast" | "mixed" | "high_fat";

// Continuous 0-1 blend factor: how much fat/protein-driven delayed absorption
// is estimated for this meal. 0 = pure single-wave (fast/mixed), 1 = full
// dual-wave (high-fat/protein). Values in between produce a graduated blend
// so medium-fat/medium-protein meals get partial dual-wave behavior instead
// of jumping straight to "mixed" with no middle ground.
//
// Fat:       0g→0, 20g→0.5, 40g+→1.0
// Protein w/ carbs: 0g→0, 20g→0.5, 30g+→1.0
// Protein alone:     0g→0, 45g→1.0
export function getDualWaveBlend(entry: any): number {
  const fat = Number(entry?.fat_grams ?? entry?.fat ?? 0) || 0;
  const protein = Number(entry?.protein_grams ?? entry?.protein ?? 0) || 0;
  const carbs = Number(entry?.carbs ?? 0) || 0;

  const fatScore = Math.min(1, fat / 40);
  const proteinWithCarbs = carbs > 0 ? Math.min(1, protein / 30) : 0;
  const proteinOnly = carbs === 0 ? Math.min(1, protein / 45) : 0;

  return Math.max(0, Math.min(1, Math.max(fatScore, proteinWithCarbs, proteinOnly)));
}

// Deterministic speed-class label for display / UI grouping / per-class
// learning. This is a LABEL ONLY — it no longer determines the curve shape.
// The curve comes from the continuous parameters produced by deriveCurveParams.
export function getCarbSpeedClass(entry: any): SpeedClass {
  const blend = getDualWaveBlend(entry);
  if (blend >= 0.5) return "high_fat";

  const gi = Number(entry?.glycemic_index ?? entry?.gi ?? 0) || 0;
  const profile = entry?.absorption_profile || "medium";
  const fastish = profile === "fast" || gi >= 70;
  if (fastish) return "fast";

  return "mixed";
}

export function getCarbDualWave(entry: any): boolean {
  return getDualWaveBlend(entry) >= 0.5;
}

// ── Continuous curve parameter generation ──────────────────────────────────
// The absorption curve is generated from the food's continuous composition,
// not from a 3-bucket preset. peak_minutes and duration_minutes are continuous
// functions of glycemic_index, fat, protein, and fiber. The dual-wave blend
// scales continuously with fat/protein. Two foods with the same speed_class
// label but different compositions get different curves; changing composition
// moves the curve continuously (no bucket jumps).
//
// The curve is a gamma rate function (single-wave) or a dual-wave blend
// (gamma at the first peak + gamma at a delayed second peak). The area under
// the rate curve always integrates exactly to the logged carbs; these
// parameters only shape WHEN the grams hit, never the total.

export interface CurveParams {
  peakMinutes: number;       // first-wave peak (carb-driven) — where the rate is highest
  durationMinutes: number;   // window (total absorption span)
  blend: number;             // dual-wave intensity 0-1
  secondPeakMinutes: number | null; // delayed-wave peak (dual-wave only)
  dualWave: boolean;
  derivedGi: number;
}

export function deriveCurveParams(entry: any, speedFactor?: number | null): CurveParams {
  const carbs = Number(entry?.carbs ?? 0) || 0;
  const fat = Number(entry?.fat_grams ?? entry?.fat ?? 0) || 0;
  const protein = Number(entry?.protein_grams ?? entry?.protein ?? 0) || 0;
  const gi = Math.max(0, Math.min(100, Number(entry?.glycemic_index ?? entry?.gi ?? 0) || 0));
  const fiber = Number(entry?.fiber_grams ?? 0) || 0;
  const processed = entry?.processed_state; // "raw" | "cooked" | "processed"

  // ── Base timing from glycemic index (the primary driver) ──
  // Pure glucose (GI 100) → peak ~22 min, window ~110 min.
  // Moderate starchy (GI 50) → peak ~76 min, window ~175 min.
  // Very low GI / legumes (GI 15) → peak ~114 min, window ~221 min.
  const basePeak = 130 - (gi / 100) * 108;
  const baseWindow = 240 - (gi / 100) * 130;

  // ── Fat delays gastric emptying and extends the window ──
  // Fat is the dominant extender: ~3.5 min of window per gram.
  const fatDelay = fat * 0.9;    // modest delay on the first wave
  const fatExtend = fat * 3.5;  // substantial window extension

  // Protein (with carbs) extends ~1.2 min/g; protein alone ~0.8 min/g.
  const proteinDelay = carbs > 0 ? protein * 0.3 : 0;
  const proteinExtend = carbs > 0 ? protein * 1.2 : protein * 0.8;

  // Fiber slows absorption (soluble fiber delays gastric emptying).
  const fiberDelay = fiber * 1.0;
  const fiberExtend = fiber * 2.0;

  // ── Processing state ──
  // Raw food digests slowest; cooked is the baseline; processed/refined faster.
  let procDelay = 0, procExtend = 0;
  if (processed === "raw") { procDelay = 8; procExtend = 15; }
  else if (processed === "processed") { procDelay = -6; procExtend = -12; }

  // First-wave peak (carb-driven). Fat/fiber add a modest delay, but the
  // first wave stays relatively early — it's the carbs absorbing.
  let firstPeak = basePeak + Math.min(25, fatDelay * 0.35 + fiberDelay * 0.5) + procDelay;
  // Overall window — extended substantially by fat/protein/fiber.
  let windowMin = baseWindow + fatExtend + proteinExtend + fiberExtend + procExtend;
  // Delayed second-wave peak (fat/protein-driven slow digestion + gluconeogenesis).
  let secondPeak = firstPeak + 60 + fatDelay + proteinDelay + fiberDelay;

  // Clamp to physiological ranges.
  firstPeak = Math.max(20, Math.min(120, Math.round(firstPeak)));
  windowMin = Math.max(90, Math.min(360, Math.round(windowMin)));
  secondPeak = Math.max(firstPeak + 50, Math.min(windowMin - 20, Math.round(secondPeak)));

  // Dual-wave blend (continuous, from fat/protein).
  const blend = getDualWaveBlend(entry);
  const dualWave = blend >= 0.5;

  // Apply learned speed factor (per speed class) — scales timing together.
  // speedFactor < 1 = runs fast, > 1 = runs slow. The learned factor nudges
  // the composition-derived curve toward the user's observed responses.
  const s = Number.isFinite(speedFactor) && (speedFactor as number) > 0
    ? (speedFactor as number)
    : 1;
  const peakMinutes = Math.max(20, Math.min(240, Math.round(firstPeak * s)));
  const durationMinutes = Math.max(90, Math.min(360, Math.round(windowMin * s)));
  const secondPeakMinutes = dualWave
    ? Math.max(peakMinutes + 40, Math.min(durationMinutes - 20, Math.round(secondPeak * s)))
    : null;

  return { peakMinutes, durationMinutes, blend, secondPeakMinutes, dualWave, derivedGi: gi };
}

// Baseline (unlearned) reference timing per speed class. Used ONLY by the
// learning pipeline as the comparison reference for observedSpeedRatio — the
// curve itself now comes from deriveCurveParams, not these buckets. Kept so
// existing learning tests that assert against class baselines remain stable.
export const BASELINE_CLASS_PARAMS: Record<SpeedClass, { peakMin: number; windowMin: number; secPeakMin: number | null }> = {
  fast:    { peakMin: 30, windowMin: 120, secPeakMin: null },
  mixed:   { peakMin: 60, windowMin: 210, secPeakMin: null },
  high_fat: { peakMin: 40, windowMin: 300, secPeakMin: 120 },
};

// Learning loop constants. The user's own timeline (actual Dexcom readings vs
// the predicted curve) nudges each class's speed factor. Learning only activates
// once a class has enough dinners' worth of history to trust the signal.
export const MIN_LEARN_SAMPLES = 5;
export const MAX_SPEED_FACTOR = 1.45;
export const MIN_SPEED_FACTOR = 0.7;
export const LEARN_DAMPING = 0.12;

// Clamp + damp a running per-class speed factor with a fresh observed ratio.
export function updateSpeedFactor(
  current: number | null,
  observedRatio: number,
  samples: number
): { factor: number; sampleSize: number } {
  const base = Number.isFinite(current) && (current as number) > 0
    ? (current as number)
    : 1;
  const clamped = Math.min(MAX_SPEED_FACTOR, Math.max(MIN_SPEED_FACTOR, Number(observedRatio) || 1));
  const next = base + (clamped - base) * LEARN_DAMPING;
  return { factor: Math.round(next * 1000) / 1000, sampleSize: samples + 1 };
}

// Human-readable naming for a speed class used in warm caption copy.
export const SPEED_LABEL: Record<SpeedClass, string> = {
  fast: "fast-absorbing",
  mixed: "mixed",
  high_fat: "high-fat & protein-rich",
};

export { MINUTE_MS };