import { lazy, Suspense, useEffect, useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { X, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import { TimeScrollField, NumberPadField, TextPadField, SelectField } from "@/components/FormInputFields";
import Sheet from "@/components/Sheet";

const CarbsTab = lazy(() => import("@/components/CarbsTab"));
const LATEST_GLUCOSE_CACHE_KEY = "latest_glucose_cache";

const CATEGORY_ORDER = [
  "Rapid-Acting",
  "Short-Acting",
  "Intermediate",
  "Long-Acting",
  "Ultra Long-Acting",
];

const groupedInsulins = CATEGORY_ORDER.reduce((groups, category) => {
  const items = Object.entries(INSULIN_PROFILES).filter(([, profile]) => profile.category === category);
  if (items.length) groups.push({ category, items });
  return groups;
}, []);

const insulinTypeOptions = Object.entries(INSULIN_PROFILES).map(([name, profile]) => ({
  value: name,
  label: name,
  description: profile.category,
}));

const dosePurposeOptions = [
  { value: "meal", label: "Meal", description: "Carb coverage" },
  { value: "correction", label: "Correction", description: "Glucose correction" },
];

const ACCENT_COLORS = {
  insulin: "rgba(91,163,184,0.12)",
  glucose: "rgba(91,168,138,0.12)",
  carbs: "rgba(212,160,86,0.12)",
};

const TAB_TITLES = {
  insulin: "Log Support",
  glucose: "Log Glucose",
  carbs: "Log Nourishment",
};

function createInsulinRow(defaults = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    insulinType: "",
    units: "",
    purpose: "meal",
    ...defaults,
  };
}

function normalizeCarbEntryForSave(entry) {
  const absorptionProfile = entry.absorption_profile || entry.profile || "medium";
  const categoryByProfile = {
    fast: "Fast Absorbing",
    medium: "Medium Absorbing",
    slow: "Slow Absorbing",
  };
  const name = entry.food_name || entry.name || "Estimated meal";
  const carbs = Number(entry.carbs);

  return {
    name,
    food_name: name,
    carbs: Number.isFinite(carbs) ? carbs : 0,
    gi: Number(entry.gi) || 50,
    category: entry.category || categoryByProfile[absorptionProfile] || "Medium Absorbing",
    profile: absorptionProfile,
    absorption_profile: absorptionProfile,
    serving_amount: entry.serving_amount ?? 1,
    consumed_at: entry.consumed_at || new Date().toISOString(),
    is_custom: entry.is_custom === true,
    is_high_protein_fat_meal: entry.is_high_protein_fat_meal === true,
  };
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

function prependUnique(entries, current = []) {
  const ids = new Set(entries.map((entry) => entry.id).filter(Boolean));
  return [...entries, ...current.filter((entry) => !ids.has(entry.id))];
}

function buildTodayTimestampNoFuture(timeValue) {
  const [hours, minutes] = String(timeValue || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;

  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.getTime() > Date.now() ? null : date;
}

export default function DoseForm({ open, onOpenChange, mode = "insulin" }) {
  const [renderSheet, setRenderSheet] = useState(open);
  const [insulinRows, setInsulinRows] = useState(() => [createInsulinRow()]);
  const [insulinNotes, setInsulinNotes] = useState("");
  const [insulinTime, setInsulinTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [glucoseValue, setGlucoseValue] = useState("");
  const [glucoseNotes, setGlucoseNotes] = useState("");
  const [glucoseTime, setGlucoseTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [loggingTab, setLoggingTab] = useState(null);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const [carbsDirty, setCarbsDirty] = useState(false);

  const queryClient = useQueryClient();
  const nowTimeString = new Date().toTimeString().slice(0, 5);

  useEffect(() => {
    setRenderSheet(open);
  }, [open]);

  const requestClose = () => {
    setRenderSheet(false);
    onOpenChange?.(false);
  };

  const closeWithSpring = (resetForm) => {
    requestClose();
    const scheduleReset = typeof window === "undefined" ? setTimeout : window.setTimeout;
    scheduleReset(resetForm, 320);
  };
  const closeAfterLoggingPaint = (resetForm) => {
    const scheduleClose = typeof window === "undefined" ? setTimeout : window.setTimeout;
    const close = () => {
      scheduleClose(() => {
        closeWithSpring(() => {
          resetForm();
          setLoggingTab(null);
        });
      }, 220);
    };

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => window.requestAnimationFrame(close));
      return;
    }

    scheduleClose(close, 0);
  };
  const runSaveAfterLoggingPaint = (save, resetForm) => {
    const start = () => {
      save();
      closeAfterLoggingPaint(resetForm);
    };

    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => window.setTimeout(start, 0));
      return;
    }

    setTimeout(start, 0);
  };

  const createDoses = useMutation({
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
      toast.success("Insulin logged — tracking its gentle activity");
    },
    onError: (_error, _variables, context) => {
      queryClient.setQueryData(["insulin-doses"], context?.previousDoses ?? []);
      queryClient.setQueryData(["insulin-doses", "graph"], context?.previousGraphDoses ?? []);
      toast.error("Unable to log insulin. Please try again.");
    },
  });

  const createGlucose = useMutation({
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

  const createCarb = useMutation({
    mutationFn: async ({ submittedEntries }) => {
      const savePromise = submittedEntries.length === 1
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
      const savedEntries = Array.isArray(result) && result.length ? result.map((entry, index) => ({
        ...submittedEntries[index],
        ...entry,
      })) : submittedEntries;

      queryClient.setQueryData(["carb-entries"], (current = []) => prependUnique(savedEntries, current.filter((entry) => !optimisticIds.has(entry.id))));
      queryClient.setQueryData(["carb-entries", "graph"], (current = []) => prependUnique(savedEntries, current.filter((entry) => !optimisticIds.has(entry.id))));
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      toast.success("Nourishment logged");
      toast.success(`Added ${submittedEntries[0]?.carbs ?? "?"}g to your day`);

      // Split dose plan creation — only when a split plan was confirmed.
      // Planned follow-up insulin is NEVER created as an InsulinDose here —
      // only the first portion (if the user chose "Confirm and log first portion").
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
      toast.error(error?.message || "Unable to log carbs. Please check the carb entry fields.");
    },
  });

  const updateInsulinRow = (id, patch) => {
    setInsulinRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addInsulinRow = () => {
    const previous = insulinRows[insulinRows.length - 1];
    setInsulinRows((rows) => [
      ...rows,
      createInsulinRow({
        insulinType: previous?.insulinType || "",
        purpose: previous?.purpose || "meal",
      }),
    ]);
  };

  const removeInsulinRow = (id) => {
    setInsulinRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== id)));
  };

  const insulinTotals = insulinRows.reduce((totals, row) => {
    const units = Number(row.units);
    if (!row.insulinType || !Number.isFinite(units) || units <= 0) return totals;

    totals[row.insulinType] = (totals[row.insulinType] || 0) + units;
    return totals;
  }, {});

  const totalUnits = Object.values(insulinTotals).reduce((sum, units) => sum + units, 0);

  const hasUnsavedChanges = useMemo(() => {
    if (loggingTab) return false;
    if (mode === "insulin") {
      return insulinRows.some((row) => row.insulinType || row.units) || insulinNotes.length > 0;
    }
    if (mode === "glucose") {
      return glucoseValue !== "" || glucoseNotes.length > 0;
    }
    if (mode === "carbs") {
      return carbsDirty;
    }
    return false;
  }, [mode, loggingTab, insulinRows, insulinNotes, glucoseValue, glucoseNotes, carbsDirty]);

  useEffect(() => {
    if (!hasUnsavedChanges || !renderSheet) return;
    const handler = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnsavedChanges, renderSheet]);

  const attemptClose = () => {
    if (loggingTab) return;
    if (hasUnsavedChanges) {
      setShowDiscardPrompt(true);
    } else {
      requestClose();
    }
  };

  const discardAndClose = () => {
    setShowDiscardPrompt(false);
    setInsulinRows([createInsulinRow()]);
    setInsulinNotes("");
    setInsulinTime(new Date().toTimeString().slice(0, 5));
    setGlucoseValue("");
    setGlucoseNotes("");
    setGlucoseTime(new Date().toTimeString().slice(0, 5));
    setCarbsDirty(false);
    requestClose();
  };

  const handleSubmitInsulin = () => {
    if (loggingTab) return;

    navigator.vibrate?.(20);

    const invalidRow = insulinRows.find((row) => {
      const units = Number(row.units);
      return !row.insulinType || !Number.isFinite(units) || units <= 0;
    });

    if (invalidRow) {
      toast.error("Choose an insulin type and enter units for every row.");
      return;
    }

    const administeredAt = buildTodayTimestampNoFuture(insulinTime);
    if (!administeredAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    const groupedDoses = insulinRows.reduce((groups, row) => {
      const units = Number(row.units);
      const existing = groups[row.insulinType] || {
        insulin_type: row.insulinType,
        units: 0,
        meal_units: 0,
        correction_units: 0,
        administered_at: administeredAt.toISOString(),
        notes: insulinNotes || undefined,
      };

      existing.units += units;
      if (row.purpose === "correction") {
        existing.correction_units += units;
      } else {
        existing.meal_units += units;
      }

      groups[row.insulinType] = existing;
      return groups;
    }, {});

    const submittedDoses = Object.values(groupedDoses);
    const optimisticDoses = submittedDoses.map((dose, index) => ({
      ...dose,
      id: `optimistic-dose-${Date.now()}-${index}`,
      created_date: new Date().toISOString(),
    }));

    setLoggingTab("insulin");
    runSaveAfterLoggingPaint(() => createDoses.mutate({ submittedDoses, optimisticDoses }), () => {
      setInsulinRows([createInsulinRow()]);
      setInsulinNotes("");
      setInsulinTime(new Date().toTimeString().slice(0, 5));
    });
  };

  const handleSubmitGlucose = () => {
    if (loggingTab) return;

    navigator.vibrate?.(20);

    const value = Number(glucoseValue);
    if (!Number.isFinite(value) || value <= 0) return;

    const recordedAt = buildTodayTimestampNoFuture(glucoseTime);
    if (!recordedAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    const submittedReading = {
      value,
      recorded_at: recordedAt.toISOString(),
      notes: glucoseNotes || undefined,
    };
    const optimisticReading = {
      ...submittedReading,
      id: `optimistic-glucose-${Date.now()}`,
      created_date: new Date().toISOString(),
    };

    setLoggingTab("glucose");
    runSaveAfterLoggingPaint(() => createGlucose.mutate({ submittedReading, optimisticReading }), () => {
      setGlucoseValue("");
      setGlucoseNotes("");
      setGlucoseTime(new Date().toTimeString().slice(0, 5));
    });
  };

  const handleSubmitCarbs = (entries, splitPlan = null) => {
    if (loggingTab) return;

    navigator.vibrate?.(20);

    const submittedEntries = entries.map(normalizeCarbEntryForSave).filter((entry) => entry.carbs > 0);

    if (!submittedEntries.length) {
      toast.error("Enter carbs before logging.");
      return;
    }

    const optimisticEntries = submittedEntries.map((entry, index) => ({
      ...entry,
      id: `optimistic-carb-${Date.now()}-${index}`,
      created_date: new Date().toISOString(),
    }));

    setLoggingTab("carbs");
    runSaveAfterLoggingPaint(() => createCarb.mutate({ submittedEntries, optimisticEntries, splitPlan }), () => {
      setCarbsDirty(false);
    });
  };

  return (
    <>
      <Sheet open={renderSheet} onClose={attemptClose} accentColor={ACCENT_COLORS[mode]}>
        <div className="dose-form-sheet flex min-h-0 flex-1 flex-col">
          <style>{`.dose-form-sheet input,.dose-form-sheet select,.dose-form-sheet textarea{font-size:16px}`}</style>

          {/* Title bar */}
          <div className="flex shrink-0 items-center justify-between px-5 pb-2">
            <h2 className="text-base font-semibold text-white/90">{TAB_TITLES[mode]}</h2>
            <button
              type="button"
              onClick={attemptClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border text-white/60 transition hover:text-white"
              style={{ background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))", borderColor: "rgba(255,255,255,0.12)" }}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form content */}
          <div className="relative min-h-0 flex-1 overflow-hidden flex min-h-0 flex-col">
                {mode === "carbs" ? (
                  <div className="min-h-0 flex-1 overflow-y-auto">
                    <Suspense fallback={<div className="flex h-full items-center justify-center text-sm text-white/35">Loading...</div>}>
                      <CarbsTab onSubmit={handleSubmitCarbs} isPending={loggingTab === "carbs" || createCarb.isPending} onDirtyChange={setCarbsDirty} />
                    </Suspense>
                  </div>
                ) : mode === "insulin" ? (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3">
                      <div className="space-y-3">
                        {insulinRows.map((row) => (
                          <div key={row.id} className="space-y-2">
                            <div className="grid grid-cols-1 gap-2">
                              <SelectField
                                label="Insulin type"
                                value={row.insulinType}
                                onChange={(value) => updateInsulinRow(row.id, { insulinType: value })}
                                options={insulinTypeOptions}
                                placeholder="Insulin type"
                              />
                              <NumberPadField
                                label="Units"
                                value={row.units}
                                onChange={(value) => updateInsulinRow(row.id, { units: value })}
                                placeholder="0"
                                maxLength={4}
                                large
                              />
                              <SelectField
                                label="Purpose"
                                value={row.purpose}
                                onChange={(value) => updateInsulinRow(row.id, { purpose: value })}
                                options={dosePurposeOptions}
                              />
                            </div>
                            {insulinRows.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeInsulinRow(row.id)}
                                className="flex items-center gap-1 px-1 text-xs text-white/35 transition hover:text-red-300"
                              >
                                <Trash2 className="h-3 w-3" />
                                Remove this row
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addInsulinRow}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 py-3 text-sm font-medium text-white/60 transition hover:border-teal-400/50 hover:bg-teal-400/5 hover:text-teal-300"
                          style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.04)" }}
                        >
                          <Plus className="h-4 w-4" />
                          Add another dose
                        </button>
                      </div>
                      <div className="mt-4 space-y-3">
                        <TimeScrollField label="Administered at" value={insulinTime} onChange={setInsulinTime} max={nowTimeString} />
                        <TextPadField label="Notes" value={insulinNotes} onChange={setInsulinNotes} placeholder="e.g. before lunch" multiline />
                      </div>
                    </div>
                    <div className="shrink-0 px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2">
                      {Object.entries(insulinTotals).length > 0 && (
                        <div className="mb-2 px-1">
                          {Object.entries(insulinTotals).map(([type, units]) => (
                            <p key={type} className="text-xs text-white/35">
                              {type.split(" ")[0]} · {units % 1 === 0 ? units : units.toFixed(1)}u
                            </p>
                          ))}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={handleSubmitInsulin}
                        disabled={!totalUnits || loggingTab === "insulin" || createDoses.isPending}
                        className="w-full rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-40"
                        style={{ background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))", boxShadow: "0 8px 28px rgba(91,163,184,0.22), inset 0 1px 1px rgba(255,255,255,0.2)" }}
                      >
                        {loggingTab === "insulin" || createDoses.isPending
                          ? "Logging..."
                          : totalUnits
                            ? `Log ${totalUnits % 1 === 0 ? totalUnits : totalUnits.toFixed(1)} units`
                            : "Add insulin units"}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3">
                      <NumberPadField
                        label="Glucose"
                        value={glucoseValue}
                        onChange={(value) => setGlucoseValue(value.replace(/\D/g, "").slice(0, 3))}
                        unit="mg/dL"
                        decimal={false}
                        maxLength={3}
                        large
                      />
                      <div className="mt-4 space-y-3">
                        <TimeScrollField label="Reading time" value={glucoseTime} onChange={setGlucoseTime} max={nowTimeString} />
                        <TextPadField label="Notes" value={glucoseNotes} onChange={setGlucoseNotes} placeholder="e.g. fasting, after meal" multiline />
                      </div>
                    </div>
                    <div className="shrink-0 px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-2">
                      <button
                        type="button"
                        onClick={handleSubmitGlucose}
                        disabled={!glucoseValue || loggingTab === "glucose" || createGlucose.isPending}
                        className="w-full rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-40"
                        style={{ background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))", boxShadow: "0 8px 28px rgba(91,163,184,0.22), inset 0 1px 1px rgba(255,255,255,0.2)" }}
                      >
                        {loggingTab === "glucose" || createGlucose.isPending ? "Logging..." : `Log ${glucoseValue || "--"} mg/dL`}
                      </button>
                    </div>
                  </>
                )}
          </div>
        </div>
      </Sheet>

      {/* Unsaved changes confirmation */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showDiscardPrompt && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-6 backdrop-blur-sm"
              onClick={() => setShowDiscardPrompt(false)}
            >
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.92, opacity: 0 }}
                transition={{ type: "spring", stiffness: 380, damping: 28 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-3xl border p-6 text-center"
                style={{ background: "linear-gradient(165deg, hsl(162,12%,11%), hsl(162,10%,7%))", borderColor: "rgba(255,255,255,0.14)", boxShadow: "0 24px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.08)" }}
              >
                <h3 className="text-lg font-semibold text-white">Discard this entry?</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/55">
                  Your moment hasn't been saved yet. You'll lose what you've entered.
                </p>
                <div className="mt-6 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowDiscardPrompt(false)}
                    className="flex-1 rounded-2xl border py-3 text-sm font-semibold text-white/80 transition hover:text-white"
                    style={{ borderColor: "rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={discardAndClose}
                    className="flex-1 rounded-2xl py-3 text-sm font-semibold text-white transition"
                    style={{ background: "linear-gradient(145deg, rgba(201,112,96,0.8), rgba(180,90,75,0.7))", boxShadow: "0 6px 20px rgba(201,112,96,0.2)" }}
                  >
                    Discard
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}