// Pure helper functions for meal model resolution — no React, no base44 SDK.
// These can be imported by both the hook and tests without side effects.

// Deterministic fallback when the entry's stored speed_class hasn't been set yet.
// Mirrors the backend shared rule from carbAbsorptionProfile.ts.
export function deriveSpeedClass(entry) {
  const fat = Number(entry?.fat_grams ?? 0) || 0;
  const protein = Number(entry?.protein_grams ?? 0) || 0;
  const carbs = Number(entry?.carbs ?? 0) || 0;
  const gi = Number(entry?.glycemic_index ?? entry?.gi ?? 0) || 0;
  const profile = entry?.absorption_profile || "medium";
  if (fat >= 40 || (protein >= 30 && carbs > 0) || (protein >= 75 && carbs === 0)) return "high_fat";
  if (profile === "fast" || gi >= 70) return "fast";
  return "mixed";
}

// Resolve the effective speed factor for one entry's class from the
// authoritative model resolution. Returns null when the class has no
// eligible learned adjustment (so the curve keeps its baseline timing).
export function entrySpeedFactorFromResolution(resolution, entry) {
  if (!resolution || !entry) return null;
  const cls = entry?.speed_class || deriveSpeedClass(entry);
  const cr = resolution.classes?.[cls];
  if (!cr || !cr.eligible || !Number.isFinite(cr.speedFactor) || cr.speedFactor <= 0) return null;
  // Only return a factor when it meaningfully differs from baseline (1.0).
  if (Math.abs(cr.speedFactor - 1.0) < 0.001) return null;
  return cr.speedFactor;
}

// True when the per-class learning has gathered enough meals to be trusted
// AND the resolved model marks the class as eligible.
export function hasLearnedTimingFromResolution(resolution, entry) {
  if (!resolution || !entry) return false;
  const cls = entry?.speed_class || deriveSpeedClass(entry);
  const cr = resolution.classes?.[cls];
  return Boolean(cr && cr.eligible && (cr.sampleCount || 0) >= 5 && Number.isFinite(cr.speedFactor) && Math.abs(cr.speedFactor - 1) > 0.05);
}

// Warm caption copy describing the learned timing per class. Describes, never
// prescribes — purely informational about the user's own pattern.
export function learnedTimingCaptionFromResolution(resolution, entry) {
  if (!resolution || !entry) return null;
  const cls = entry?.speed_class || deriveSpeedClass(entry);
  const cr = resolution.classes?.[cls];
  if (!cr || !cr.eligible) return null;
  const factor = cr.speedFactor;
  const classLabel = cls === "high_fat" ? "high-fat & protein-rich meals" : cls === "fast" ? "fast-absorbing meals" : "mixed meals";
  if (factor < 0.9) {
    return `For you, ${classLabel} tend to run a bit faster than the typical estimate — based on your past meals.`;
  }
  if (factor > 1.1) {
    return `For you, ${classLabel} tend to run a bit slower than the typical estimate — based on your past meals.`;
  }
  return null;
}