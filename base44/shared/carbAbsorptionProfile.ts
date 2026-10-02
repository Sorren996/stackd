// Shared carb absorption profile classification + learning math.
// Imported by BOTH the backend (classifyLogEntry persists speed_class/dual_wave
// on each CarbEntry, processMealAnalyses updates per-class learning) and mirrors
// the frontend carbAbsorption model so the stored curve always reconciles with
// what's rendered. The estimated absorption curve is an ESTIMATE derived from
// the logged meal — never a measurement, never a dosing recommendation.

const MINUTE_MS = 60 * 1000;

// A single meal's macros can span different entries, so classification uses the
// entry's own absorption_profile / glycemic index plus high-fat-protein macro
// thresholds — the same rule that drives extended monitoring.
export type SpeedClass = "fast" | "mixed" | "high_fat";

// Deterministic speed-class + dual-wave derivation for one carb entry.
//   - high_fat: macros cross the delayed-rise threshold (fat>=40g, or
//     protein>=30g with carbs, or protein>=75g alone). These meals absorb with
//     a long, often double-wave profile.
//   - fast: quick-sugar / high-GI / fast-absorption profile.
//   - mixed: everything else (starchy, medium profile).
// dual_wave flags fatty/protein-heavy meals (pizza, pad thai style): a quick
// first wave + a delayed second wave peaking ~2h later with a long tail.
export function getCarbSpeedClass(entry: any): SpeedClass {
  const fat = Number(entry?.fat_grams ?? entry?.fat ?? 0) || 0;
  const protein = Number(entry?.protein_grams ?? entry?.protein ?? 0) || 0;
  const carbs = Number(entry?.carbs ?? 0) || 0;
  const gi = Number(entry?.glycemic_index ?? entry?.gi ?? 0) || 0;
  const profile = entry?.absorption_profile || "medium";

  const highFat =
    fat >= 40 || (protein >= 30 && carbs > 0) || (protein >= 75 && carbs === 0);
  if (highFat) return "high_fat";

  const fastish =
    profile === "fast" || gi >= 70;
  if (fastish) return "fast";

  return "mixed";
}

export function getCarbDualWave(entry: any): boolean {
  const speed = getCarbSpeedClass(entry);
  return speed === "high_fat";
}

// Baseline (unlearned) peak / window minutes for a speed class — used both when
// a user has no learned adjustment yet and as the learning seed.
// Curve area always integrates exactly to the logged carbs; these timings only
// shape WHEN the grams are estimated to hit the bloodstream, never the total.
export const BASELINE_CLASS_PARAMS: Record<SpeedClass, { peakMin: number; windowMin: number; secPeakMin: number | null }> = {
  fast:    { peakMin: 30, windowMin: 120, secPeakMin: null },
  mixed:   { peakMin: 60, windowMin: 210, secPeakMin: null },
  high_fat: { peakMin: 40, windowMin: 300, secPeakMin: 120 },
};

// Learning loop constants. The user's own timeline (actual Dexcom readings vs
// the predicted curve) nudges each class's speed factor. Learning only activates
// once a class has enough dinners' worth of history to trust the signal.
export const MIN_LEARN_SAMPLES = 5;
export const MAX_SPEED_FACTOR = 1.45; // window/peak can stretch at most +45% slow
export const MIN_SPEED_FACTOR = 0.7;  // ... or shrink to 70% fast
export const LEARN_DAMPING = 0.12;    // each new meal nudges the factor a little

// Clamp + damp a running per-class speed factor with a fresh observed ratio.
// observedRatio < 1 => the meal's glucose ran FAST relative to the prediction
// (peak came earlier) => future curves should be shifted faster.
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

// Where in a meal's window the peak is estimated to land, given the class's
// baseline timing adjusted by a learned speed factor. Never before ~20min (a
// floor for even the fastest carbs to leave the stomach) and never beyond ~4h.
export function getClassPeakMinutes(speed: SpeedClass, speedFactor?: number | null): number {
  const s = Number.isFinite(speedFactor) && (speedFactor as number) > 0
    ? (speedFactor as number)
    : 1;
  const base = BASELINE_CLASS_PARAMS[speed] || BASELINE_CLASS_PARAMS.mixed;
  return Math.max(20, Math.min(240, Math.round(base.peakMin * s)));
}

// Window the estimated curve spans, adjusted by the same speed factor.
export function getClassWindowMinutes(speed: SpeedClass, speedFactor?: number | null): number {
  const s = Number.isFinite(speedFactor) && (speedFactor as number) > 0
    ? (speedFactor as number)
    : 1;
  const base = BASELINE_CLASS_PARAMS[speed] || BASELINE_CLASS_PARAMS.mixed;
  return Math.max(90, Math.min(360, Math.round(base.windowMin * s)));
}

// Human-readable naming for a speed class used in warm caption copy.
export const SPEED_LABEL: Record<SpeedClass, string> = {
  fast: "fast-absorbing",
  mixed: "mixed",
  high_fat: "high-fat & protein-rich",
};

export { MINUTE_MS };