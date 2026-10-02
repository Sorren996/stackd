import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

// Per-user, per-class learned absorption-speed adjustments. Each user has at
// most one AbsorptionAdjustment record per speed class (fast / mixed / high_fat).
// The factor is a multiplier on the ESTIMATED absorption timing — <1 = the
// user's meals of that class tended to run fast (peak earlier than predicted),
// >1 = they tended to run slow. Learning only activates once a class has
// enough reviewed meals with Dexcom data, so a factor of exactly 1 means
// "no adjustment learned yet."

// React Query hook: returns a map keyed by speed_class -> { factor, sampleSize }.
export function useAbsorptionAdjustments(enabled = true) {
  const { data = [] } = useQuery({
    queryKey: ["absorption-adjustments"],
    queryFn: () => base44.entities.AbsorptionAdjustment.list("-updated_date", 10),
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const byClass = {};
  for (const a of data || []) {
    if (!a?.speed_class) continue;
    byClass[a.speed_class] = {
      factor: Number.isFinite(a.speed_factor) ? a.speed_factor : 1,
      sampleSize: Number(a.sample_size) || 0,
    };
  }
  return byClass;
}

// Resolve the effective speed factor for one entry's class. Returns null when
// the class has no learned adjustment yet (so the curve keeps its baseline
// timing and no "learned" caption is shown).
export function entrySpeedFactor(adjustmentsByClass, entry) {
  const cls = entry?.speed_class || deriveSpeedClass(entry);
  const adj = adjustmentsByClass?.[cls];
  if (!adj || !Number.isFinite(adj.factor) || adj.factor <= 0) return null;
  return adj.factor;
}

// Deterministic fallback when the entry's stored speed_class hasn't been set yet
// (e.g. logged before the classifier ran). Mirrors the backend shared rule.
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

// True when the per-class learning has gathered enough meals to be trusted.
// Below this the displayed curve uses baseline timing and the caption frames
// the estimate plainly ("estimated from your meal") rather than leaning on
// the learned factor ("estimated from your meal and history").
export function hasLearnedTiming(adjustmentsByClass, entry) {
  const cls = entry?.speed_class || deriveSpeedClass(entry);
  const adj = adjustmentsByClass?.[cls];
  return Boolean(adj && (adj.sampleSize || 0) >= 5 && Number.isFinite(adj.factor) && Math.abs(adj.factor - 1) > 0.05);
}

// Warm caption copy describing the learned timing per class. Describes, never
// prescribes — purely informational about the user's own pattern.
export function learnedTimingCaption(adjustmentsByClass, entry) {
  const cls = entry?.speed_class || deriveSpeedClass(entry);
  const adj = adjustmentsByClass?.[cls];
  if (!hasLearnedTiming(adjustmentsByClass, entry) || !adj) return null;
  const factor = adj.factor;
  const classLabel = cls === "high_fat" ? "high-fat & protein-rich meals" : cls === "fast" ? "fast-absorbing meals" : "mixed meals";
  if (factor < 0.9) {
    return `For you, ${classLabel} tend to run a bit faster than the typical estimate — based on your past meals.`;
  }
  if (factor > 1.1) {
    return `For you, ${classLabel} tend to run a bit slower than the typical estimate — based on your past meals.`;
  }
  return null;
}