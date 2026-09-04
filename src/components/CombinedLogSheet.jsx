import { useState, useEffect, useMemo, useRef, lazy, Suspense } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, Plus, Trash2, Syringe, Wheat } from "lucide-react";
import { toast } from "sonner";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { getDefaultInsulinLibrary } from "@/lib/userSettings";
import { useCreateDoses, useCreateCarbs } from "@/hooks/useLogMutations";
import { DateScrollField, TimeScrollField, TextPadField, NumberPadField, SelectField } from "@/components/FormInputFields";
import Sheet from "@/components/Sheet";

const CarbsTab = lazy(() => import("@/components/CarbsTab"));

function createInsulinRow(defaults = {}) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    insulinType: "",
    units: "",
    ...defaults,
  };
}

function readInsulinLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem("insulin_library") || "null");
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // fall through to defaults
  }
  return getDefaultInsulinLibrary();
}

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function buildTimestampNoFuture(dateValue, timeValue) {
  const [hours, minutes] = String(timeValue || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const date = dateValue ? new Date(dateValue + "T00:00:00") : new Date();
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(hours, minutes, 0, 0);
  return date.getTime() > Date.now() ? null : date;
}

function normalizeCarbEntryForSave(entry) {
  const absorptionProfile = entry.absorption_profile || entry.profile || "medium";
  const name = entry.food_name || entry.name || "Estimated meal";
  const carbs = Number(entry.carbs);
  return {
    name,
    food_name: name,
    carbs: Number.isFinite(carbs) ? carbs : 0,
    gi: Number(entry.gi) || 50,
    category: entry.category || "Medium Absorbing",
    profile: absorptionProfile,
    absorption_profile: absorptionProfile,
    serving_amount: entry.serving_amount ?? 1,
    consumed_at: entry.consumed_at || new Date().toISOString(),
    is_custom: entry.is_custom === true,
    is_high_protein_fat_meal: entry.is_high_protein_fat_meal === true,
  };
}

export default function CombinedLogSheet({ open, onOpenChange }) {
  const [renderSheet, setRenderSheet] = useState(open);
  const [insulinRows, setInsulinRows] = useState(() => [createInsulinRow()]);
  const [sharedNotes, setSharedNotes] = useState("");
  const [sharedTime, setSharedTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [sharedDate, setSharedDate] = useState(getTodayDateValue);
  const [carbDirty, setCarbDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDiscardPrompt, setShowDiscardPrompt] = useState(false);
  const [insulinLibrary, setInsulinLibrary] = useState(readInsulinLibrary);

  const carbsRef = useRef(null);
  const insulinSavedRef = useRef(false);

  const createDoses = useCreateDoses();
  const createCarb = useCreateCarbs();

  useEffect(() => {
    setRenderSheet(open);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setSharedTime(new Date().toTimeString().slice(0, 5));
    setSharedDate(getTodayDateValue());
    insulinSavedRef.current = false;
  }, [open]);

  useEffect(() => {
    const refresh = () => setInsulinLibrary(readInsulinLibrary());
    window.addEventListener("insulin-settings-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("insulin-settings-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const insulinTypeOptions = useMemo(
    () =>
      Object.entries(INSULIN_PROFILES)
        .filter(([name]) => insulinLibrary.includes(name))
        .map(([name, profile]) => ({ value: name, label: name, description: profile.category })),
    [insulinLibrary]
  );

  const nowTimeString = new Date().toTimeString().slice(0, 5);
  const todayDateValue = getTodayDateValue();

  const updateInsulinRow = (id, patch) => {
    setInsulinRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const addInsulinRow = () => {
    const previous = insulinRows[insulinRows.length - 1];
    setInsulinRows((rows) => [...rows, createInsulinRow({ insulinType: previous?.insulinType || "" })]);
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
  const hasInsulin = totalUnits > 0;
  const canLogBoth = hasInsulin || carbDirty;

  const requestClose = () => {
    setRenderSheet(false);
    onOpenChange?.(false);
  };

  const resetForm = () => {
    setInsulinRows([createInsulinRow()]);
    setSharedNotes("");
    setSharedTime(new Date().toTimeString().slice(0, 5));
    setSharedDate(getTodayDateValue());
    setCarbDirty(false);
    insulinSavedRef.current = false;
  };

  const attemptClose = () => {
    if (isSaving) return;
    if (hasInsulin || carbDirty) {
      setShowDiscardPrompt(true);
    } else {
      requestClose();
    }
  };

  const discardAndClose = () => {
    setShowDiscardPrompt(false);
    resetForm();
    requestClose();
  };

  const saveInsulin = (timestamp) => {
    if (insulinSavedRef.current) return;

    const groupedDoses = insulinRows.reduce((groups, row) => {
      const units = Number(row.units);
      if (!row.insulinType || !Number.isFinite(units) || units <= 0) return groups;
      const existing = groups[row.insulinType] || {
        insulin_type: row.insulinType,
        units: 0,
        administered_at: timestamp.toISOString(),
        notes: sharedNotes || undefined,
      };
      existing.units += units;
      groups[row.insulinType] = existing;
      return groups;
    }, {});

    const submittedDoses = Object.values(groupedDoses);
    if (!submittedDoses.length) return;

    const optimisticDoses = submittedDoses.map((dose, index) => ({
      ...dose,
      id: `optimistic-dose-${Date.now()}-${index}`,
      created_date: new Date().toISOString(),
    }));

    insulinSavedRef.current = true;
    createDoses.mutate({ submittedDoses, optimisticDoses });
  };

  const closeAfterSave = () => {
    const close = () => {
      setIsSaving(false);
      requestClose();
      setTimeout(resetForm, 320);
    };
    if (typeof window !== "undefined" && window.requestAnimationFrame) {
      window.requestAnimationFrame(() => window.setTimeout(close, 220));
    } else {
      setTimeout(close, 220);
    }
  };

  const handleCarbEntries = (entries, splitPlan = null) => {
    const submittedEntries = entries
      .map((entry) => ({
        ...normalizeCarbEntryForSave(entry),
        notes: sharedNotes || undefined,
      }))
      .filter((entry) => entry.carbs > 0);

    if (!submittedEntries.length) return;

    const optimisticEntries = submittedEntries.map((entry, index) => ({
      ...entry,
      id: `optimistic-carb-${Date.now()}-${index}`,
      created_date: new Date().toISOString(),
    }));

    createCarb.mutate({ submittedEntries, optimisticEntries, splitPlan });

    // Also save insulin if not yet saved (covers split-planner confirm path)
    if (hasInsulin) {
      const timestamp = buildTimestampNoFuture(sharedDate, sharedTime);
      if (timestamp) saveInsulin(timestamp);
    }

    closeAfterSave();
  };

  const handleLogBoth = () => {
    if (isSaving || !canLogBoth) return;

    navigator.vibrate?.(20);

    const timestamp = buildTimestampNoFuture(sharedDate, sharedTime);
    if (!timestamp) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    setIsSaving(true);

    if (hasInsulin) {
      saveInsulin(timestamp);
    }

    if (carbDirty) {
      carbsRef.current?.submit();
    } else {
      closeAfterSave();
    }
  };

  return (
    <>
      <Sheet open={renderSheet} onClose={attemptClose} accentColor="rgba(45,212,191,0.10)">
        <div className="combined-sheet flex min-h-0 flex-1 flex-col">
          <style>{`.combined-sheet input,.combined-sheet select,.combined-sheet textarea{font-size:16px}`}</style>

          {/* Title bar */}
          <div className="flex shrink-0 items-center justify-between px-5 pb-2">
            <h2 className="text-base font-semibold text-white/90">Log Meal + Support</h2>
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
          <div className="relative min-h-0 flex-1 overflow-hidden flex flex-col">
            {/* Scrollable body */}
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {/* Nourishment header */}
              <div className="flex items-center gap-2 px-5 pt-1 pb-1">
                <Wheat className="h-3.5 w-3.5" style={{ color: "#A8E6CF" }} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#A8E6CF" }}>
                  Nourishment
                </span>
              </div>

              {/* CarbsTab (embedded — no internal scroll, no submit, no timestamp) */}
              <Suspense
                fallback={
                  <div className="flex h-32 items-center justify-center text-sm text-white/35">Loading...</div>
                }
              >
                <CarbsTab
                  ref={carbsRef}
                  open={open}
                  onSubmit={handleCarbEntries}
                  isPending={isSaving}
                  onDirtyChange={setCarbDirty}
                  embedded
                  externalDate={sharedDate}
                  externalTime={sharedTime}
                />
              </Suspense>

              {/* Support header */}
              <div
                className="mx-5 mt-3 flex items-center gap-2 border-t pt-3 pb-1"
                style={{ borderColor: "rgba(168,230,207,0.12)" }}
              >
                <Syringe className="h-3.5 w-3.5" style={{ color: "#A8E6CF" }} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#A8E6CF" }}>
                  Support
                </span>
              </div>

              {/* Insulin rows */}
              <div className="space-y-2 px-5 pb-2">
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

              {/* Shared Date / Time / Notes */}
              <div className="space-y-2 px-5 pt-3 pb-4">
                <DateScrollField label="Date" value={sharedDate} onChange={setSharedDate} max={todayDateValue} />
                <TimeScrollField
                  label="Time"
                  value={sharedTime}
                  onChange={setSharedTime}
                  max={sharedDate === todayDateValue ? nowTimeString : undefined}
                />
                <TextPadField label="Notes" value={sharedNotes} onChange={setSharedNotes} placeholder="e.g. before lunch" multiline />
              </div>
            </div>

            {/* Sticky "Log both" button */}
            <div
              className="shrink-0 border-t px-5 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-3"
              style={{ borderColor: "rgba(168,230,207,0.12)" }}
            >
              {Object.entries(insulinTotals).length > 0 && !isSaving && (
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
                onClick={handleLogBoth}
                disabled={!canLogBoth || isSaving}
                className="w-full rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-40"
                style={{
                  background: "linear-gradient(135deg, #2DD4BF, #059669)",
                  boxShadow: "0 8px 28px rgba(45,212,191,0.25), inset 0 1px 1px rgba(255,255,255,0.2)",
                }}
              >
                {isSaving ? "Logging..." : "Log both"}
              </button>
            </div>
          </div>
        </div>
      </Sheet>

      {/* Discard confirmation */}
      {typeof document !== "undefined" &&
        createPortal(
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
                  style={{
                    background: "linear-gradient(165deg, hsl(162,12%,11%), hsl(162,10%,7%))",
                    borderColor: "rgba(255,255,255,0.14)",
                    boxShadow: "0 24px 60px rgba(0,0,0,0.4), inset 0 1px 1px rgba(255,255,255,0.08)",
                  }}
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
                      style={{
                        background: "linear-gradient(145deg, rgba(201,112,96,0.8), rgba(180,90,75,0.7))",
                        boxShadow: "0 6px 20px rgba(201,112,96,0.2)",
                      }}
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