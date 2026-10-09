import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
export {
  deriveSpeedClass,
  entrySpeedFactorFromResolution,
  hasLearnedTimingFromResolution,
  learnedTimingCaptionFromResolution,
} from "@/lib/mealModelResolution";

// Fetches the authoritative meal-response model resolution from the backend.
// This is the SAME persisted, user-specific MealResponseModelState that the
// projection engine (generateProjection) uses — not a parallel learning entity.
//
// Returns:
//   mealModelVersion — "1.0.0-meal-baseline" or "1.1.0-meal-personalized"
//   baselineLocked   — whether the state is at baseline (no personalization)
//   resolutionReason — why personalization is or isn't active
//   classes          — per-class { eligible, speedFactor, magnitudeFactor, reason, source, sampleCount }
//   sampleCountsByClass — { fast, mixed, high_fat } sample counts
//   hasState         — whether a MealResponseModelState record exists
//
// SCOPE: speedFactor adjusts absorption TIMING (applied to the absorption curve).
//        magnitudeFactor adjusts glucose EXCURSION magnitude (used only by the
//        backend projection engine, NOT by the frontend absorption curve — it
//        is a glucose-response parameter, not a carbohydrate-absorption parameter).
export function useMealModelResolution(enabled = true) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["meal-model-resolution"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getMealModelResolution", {});
      return res.data;
    },
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const resolution = data || {
    ok: false,
    mealModelVersion: "1.0.0-meal-baseline",
    baselineLocked: true,
    resolutionReason: "no_state_record",
    classes: {},
    sampleCountsByClass: { fast: 0, mixed: 0, high_fat: 0 },
    hasState: false,
  };

  return { resolution, isLoading, isError };
}