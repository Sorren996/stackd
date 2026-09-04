import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const LATEST_GLUCOSE_CACHE_KEY = "latest_glucose_cache";

function prependUnique(entries, current = []) {
  const ids = new Set(entries.map((entry) => entry.id).filter(Boolean));
  return [...entries, ...current.filter((entry) => !ids.has(entry.id))];
}

function writeCachedLatestGlucose(reading) {
  if (typeof window === "undefined" || !reading) return;
  try {
    window.localStorage.setItem(LATEST_GLUCOSE_CACHE_KEY, JSON.stringify(reading));
    window.dispatchEvent(new Event("latest-glucose-updated"));
  } catch {
    // Cache is optional; React Query still refreshes from the backend.
  }
}

export function useCreateDoses() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submittedDoses }) => base44.entities.InsulinDose.bulkCreate(submittedDoses),
    onMutate: ({ optimisticDoses }) => {
      const previousDoses = queryClient.getQueryData(["insulin-doses"]);
      const previousGraphDoses = queryClient.getQueryData(["insulin-doses", "graph"]);
      queryClient.setQueryData(["insulin-doses"], (current = []) => prependUnique(optimisticDoses, current));
      queryClient.setQueryData(["insulin-doses", "graph"], (current = []) => prependUnique(optimisticDoses, current));
      return { optimisticIds: optimisticDoses.map((dose) => dose.id), previousDoses, previousGraphDoses };
    },
    onSuccess: (createdDoses, variables, context) => {
      const optimisticIds = new Set(context?.optimisticIds || []);
      const savedDoses = Array.isArray(createdDoses) && createdDoses.length ? createdDoses : variables.submittedDoses;
      queryClient.setQueryData(["insulin-doses"], (current = []) => prependUnique(savedDoses, current.filter((dose) => !optimisticIds.has(dose.id))));
      queryClient.setQueryData(["insulin-doses", "graph"], (current = []) => prependUnique(savedDoses, current.filter((dose) => !optimisticIds.has(dose.id))));
      queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
      queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
      toast.success("Support logged — tracking its gentle activity");
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(["insulin-doses"], context?.previousDoses ?? []);
      queryClient.setQueryData(["insulin-doses", "graph"], context?.previousGraphDoses ?? []);
      toast.error("Unable to log support. Please try again.");
    },
  });
}

export function useCreateGlucose() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ submittedReading }) => base44.entities.GlucoseReading.create(submittedReading),
    onMutate: ({ optimisticReading }) => {
      const previousLatestGlucose = queryClient.getQueryData(["latest-glucose"]);
      const previousGraphGlucose = queryClient.getQueryData(["glucose-readings", "graph"]);
      writeCachedLatestGlucose(optimisticReading);
      queryClient.setQueryData(["latest-glucose"], [optimisticReading]);
      queryClient.setQueryData(["glucose-readings", "graph"], (current = []) => prependUnique([optimisticReading], current));
      return { optimisticId: optimisticReading.id, previousLatestGlucose, previousGraphGlucose };
    },
    onSuccess: (createdReading, variables, context) => {
      const savedReading = createdReading || variables.submittedReading;
      writeCachedLatestGlucose(savedReading);
      queryClient.setQueryData(["latest-glucose"], [savedReading]);
      queryClient.setQueryData(["glucose-readings", "graph"], (current = []) =>
        prependUnique([savedReading], current.filter((reading) => reading.id !== context?.optimisticId))
      );
      queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
      queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
      toast.success("Glucose check-in recorded");
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(["latest-glucose"], context?.previousLatestGlucose ?? []);
      queryClient.setQueryData(["glucose-readings", "graph"], context?.previousGraphGlucose ?? []);
      toast.error("Unable to log glucose. Please try again.");
    },
  });
}

export function useCreateCarbs() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ submittedEntries }) => {
      const savePromise =
        submittedEntries.length === 1
          ? base44.entities.CarbEntry.create(submittedEntries[0]).then((entry) => [entry])
          : base44.entities.CarbEntry.bulkCreate(submittedEntries);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Carb save timed out after 10 seconds")), 10000);
      });
      return Promise.race([savePromise, timeoutPromise]);
    },
    onMutate: ({ optimisticEntries }) => {
      const previousCarbs = queryClient.getQueryData(["carb-entries"]);
      const previousGraphCarbs = queryClient.getQueryData(["carb-entries", "graph"]);
      queryClient.setQueryData(["carb-entries"], (current = []) => prependUnique(optimisticEntries, current));
      queryClient.setQueryData(["carb-entries", "graph"], (current = []) => prependUnique(optimisticEntries, current));
      return { optimisticIds: optimisticEntries.map((entry) => entry.id), previousCarbs, previousGraphCarbs };
    },
    onSuccess: (result, variables, context) => {
      const optimisticIds = new Set(context?.optimisticIds || []);
      const submittedEntries = variables.submittedEntries;
      const savedEntries =
        Array.isArray(result) && result.length
          ? result.map((entry, index) => ({ ...submittedEntries[index], ...entry }))
          : submittedEntries;

      queryClient.setQueryData(["carb-entries"], (current = []) => prependUnique(savedEntries, current.filter((entry) => !optimisticIds.has(entry.id))));
      queryClient.setQueryData(["carb-entries", "graph"], (current = []) => prependUnique(savedEntries, current.filter((entry) => !optimisticIds.has(entry.id))));
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      toast.success("Nourishment logged");

      // Split dose plan creation — only when a split plan was confirmed.
      if (variables.splitPlan?.strategy === "split" && savedEntries.length) {
        (async () => {
          try {
            let firstDoseId = null;
            if (variables.splitPlan.logFirstDose) {
              const dose = await base44.entities.InsulinDose.create({
                insulin_type: variables.splitPlan.insulinType,
                units: variables.splitPlan.firstPlannedUnits,
                administered_at: savedEntries[0].consumed_at,
                notes: "First portion — split dose plan",
              });
              firstDoseId = dose.id;
              queryClient.setQueryData(["insulin-doses"], (current = []) => prependUnique([dose], current));
              queryClient.setQueryData(["insulin-doses", "graph"], (current = []) => prependUnique([dose], current));
              queryClient.invalidateQueries({ queryKey: ["insulin-doses"] });
              queryClient.invalidateQueries({ queryKey: ["insulin-doses", "graph"] });
              toast.success("First portion logged");
            }

            const reviewAt = new Date(Date.now() + variables.splitPlan.reviewAfterMinutes * 60000).toISOString();
            await base44.entities.SplitDosePlan.create({
              meal_log_id: savedEntries[0].id,
              meal_name: savedEntries[0].food_name || savedEntries[0].name || "Meal",
              total_planned_units: variables.splitPlan.totalPlannedUnits,
              first_planned_units: variables.splitPlan.firstPlannedUnits,
              follow_up_planned_units: variables.splitPlan.followUpPlannedUnits,
              first_dose_log_id: firstDoseId,
              insulin_type: variables.splitPlan.insulinType,
              review_after_minutes: variables.splitPlan.reviewAfterMinutes,
              original_review_at: reviewAt,
              current_review_at: reviewAt,
              status: firstDoseId ? "planned" : "draft",
              source: "manual",
            });
            queryClient.invalidateQueries({ queryKey: ["split-plans"] });
            if (!variables.splitPlan.logFirstDose) {
              toast.success("Split plan saved");
            }
          } catch (error) {
            console.error("Split plan creation failed:", error);
            toast.error("Meal logged, but split plan could not be saved.");
          }
        })();
      }
    },
    onError: (error, _variables, context) => {
      queryClient.setQueryData(["carb-entries"], context?.previousCarbs ?? []);
      queryClient.setQueryData(["carb-entries", "graph"], context?.previousGraphCarbs ?? []);
      console.error("Unable to log carbs", error);
      toast.error(error?.message || "Unable to log nourishment. Please check the entry fields.");
    },
  });
}