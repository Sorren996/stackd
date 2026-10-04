import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { INSULIN_PROFILES, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { getDefaultInsulinLibrary } from "@/lib/userSettings";
import { useCreateDoses, useCreateCarbs } from "@/hooks/useLogMutations";
import { hasDelayedRise } from "@/lib/mealMonitoring";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import {
  TapStepper,
  InsulinChips,
  CompactSegmented,
  TripleSegmented,
  RescueChip,
  NowTimeField,
  TextField,
  FieldLabel,
  MACRO_GRAMS,
  INK,
  COPPER,
  SAGE,
  CREAM,
  TAUPE,
  FAINT,
  CANVAS,
  HAIRLINE,
} from "@/components/forms/FieldKit";

function createInsulinRow(defaults = {}) {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, insulinType: "", covers: "meal", units: "", ...defaults };
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

/**
 * Log Insulin + Meal — combined form on the reference shell (taller detent).
 * Meal section and Insulin section, same field kit. Shared date/time/notes.
 * No dose estimates or recommendation copy (per spec). Insulin chips show
 * only the user's settings; basal hides the covers row.
 */
export default function LogInsulinMealForm({ open, onClose }) {
  const [foodName, setFoodName] = useState("");
  const [carbs, setCarbs] = useState("");
  const [proteinLevel, setProteinLevel] = useState("low");
  const [fatLevel, setFatLevel] = useState("low");
  const [isRescue, setIsRescue] = useState(false);
  const [insulinRows, setInsulinRows] = useState(() => [createInsulinRow()]);
  const [sharedNotes, setSharedNotes] = useState("");
  const [date, setDate] = useState(getTodayDateValue);
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [insulinLibrary, setInsulinLibrary] = useState(readInsulinLibrary);
  const [logging, setLogging] = useState(false);

  const createDoses = useCreateDoses();
  const createCarb = useCreateCarbs();

  useEffect(() => {
    if (!open) return;
    setFoodName("");
    setCarbs("");
    setProteinLevel("low");
    setFatLevel("low");
    setIsRescue(false);
    setInsulinRows([createInsulinRow()]);
    setSharedNotes("");
    setDate(getTodayDateValue());
    setTime(new Date().toTimeString().slice(0, 5));
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

  const typeOptions = useMemo(
    () =>
      Object.entries(INSULIN_PROFILES)
        .filter(([name]) => insulinLibrary.includes(name))
        .map(([name]) => ({ value: name, label: name })),
    [insulinLibrary]
  );

  const updateInsulinRow = (id, patch) =>
    setInsulinRows((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const addInsulinRow = () => {
    const previous = insulinRows[insulinRows.length - 1];
    setInsulinRows((rows) => [...rows, createInsulinRow({ insulinType: previous?.insulinType || "" })]);
  };

  const removeInsulinRow = (id) =>
    setInsulinRows((rows) => (rows.length === 1 ? rows : rows.filter((row) => row.id !== id)));

  const carbsNum = Number(carbs) || 0;
  const proteinGrams = MACRO_GRAMS[proteinLevel] ?? 0;
  const fatGrams = MACRO_GRAMS[fatLevel] ?? 0;
  const hasMeal = foodName.trim() && carbsNum > 0;

  const insulinTotals = insulinRows.reduce((totals, row) => {
    const units = Number(row.units);
    if (!row.insulinType || !Number.isFinite(units) || units <= 0) return totals;
    totals[row.insulinType] = (totals[row.insulinType] || 0) + units;
    return totals;
  }, {});
  const totalUnits = Object.values(insulinTotals).reduce((sum, units) => sum + units, 0);
  const hasInsulin = totalUnits > 0;

  const canSubmit = (hasMeal || hasInsulin) && !logging;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const timestamp = buildTimestampNoFuture(date, time);
    if (!timestamp) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    navigator.vibrate?.(20);
    setLogging(true);

    if (hasInsulin) {
      const submittedDoses = Object.entries(insulinTotals).map(([insulin_type, units]) => ({
        insulin_type,
        units,
        administered_at: timestamp.toISOString(),
        notes: sharedNotes || undefined,
      }));
      const optimisticDoses = submittedDoses.map((dose, i) => ({
        ...dose,
        id: `optimistic-dose-${Date.now()}-${i}`,
        created_date: new Date().toISOString(),
      }));
      createDoses.mutate({ submittedDoses, optimisticDoses });
    }

    if (hasMeal) {
      const entry = {
        name: foodName.trim(),
        food_name: foodName.trim(),
        carbs: carbsNum,
        consumed_at: timestamp.toISOString(),
        is_rescue_carb: isRescue,
        fat_grams: fatGrams,
        protein_grams: proteinGrams,
        notes: sharedNotes || undefined,
      };
      const optimisticEntries = [{ ...entry, id: `optimistic-carb-${Date.now()}`, created_date: new Date().toISOString() }];
      createCarb.mutate({ submittedEntries: [entry], optimisticEntries, splitPlan: null });
    }

    setTimeout(() => {
      setLogging(false);
      onClose?.();
    }, 280);
  };

  return (
    <LogSheetShell
      open={open}
      onClose={onClose}
      title="Log meal + support"
      detent="tall"
      footer={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
          style={{ background: COPPER, color: CREAM, boxShadow: "0 4px 16px rgba(156,82,40,0.25)" }}
        >
          {logging ? "Logging..." : "Log both"}
        </button>
      }
    >
      {/* ── Meal section ── */}
      <div className="mb-2 flex items-center gap-2">
        <span style={{ width: 6, height: 6, borderRadius: "9999px", background: COPPER }} />
        <FieldLabel>Meal</FieldLabel>
      </div>
      <div className="space-y-5">
        <TextField value={foodName} onChange={setFoodName} placeholder="Meal name (optional)" />
        <TapStepper
          label="Carbs"
          sub="· steps of 5g · tap to type"
          value={carbs}
          onChange={setCarbs}
          unit="g"
          step={5}
          presets={[15, 30, 45, 60]}
        />
        <TripleSegmented label="Protein" value={proteinLevel} onChange={setProteinLevel} />
        <TripleSegmented label="Fat" value={fatLevel} onChange={setFatLevel} />
        <RescueChip checked={isRescue} onChange={setIsRescue} />
      </div>

      {/* ── Insulin section ── */}
      <div className="mt-6 mb-2 flex items-center gap-2 border-t pt-4" style={{ borderColor: HAIRLINE }}>
        <span style={{ width: 6, height: 6, borderRadius: "9999px", background: SAGE }} />
        <FieldLabel>Insulin</FieldLabel>
      </div>
      <div className="space-y-5">
        {insulinRows.map((row) => {
          const basal = row.insulinType ? isBasalInsulinType(row.insulinType) : false;
          return (
            <div key={row.id} className="space-y-4">
              <InsulinChips
                value={row.insulinType}
                onChange={(value) => updateInsulinRow(row.id, { insulinType: value })}
                options={typeOptions}
                ariaLabel="Insulin type"
              />
              {!basal && row.insulinType && (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium" style={{ color: FAINT }}>
                    This dose covers
                  </span>
                  <CompactSegmented
                    value={row.covers}
                    onChange={(v) => updateInsulinRow(row.id, { covers: v })}
                    options={[
                      { value: "meal", label: "A meal" },
                      { value: "correction", label: "Correction" },
                    ]}
                    ariaLabel="Covers"
                    layoutId={`insulin-meal-covers-${row.id}`}
                  />
                </div>
              )}
              <TapStepper
                label="Dose"
                sub="· steps of 1u · tap to type"
                value={row.units}
                onChange={(v) => updateInsulinRow(row.id, { units: v })}
                unit="u"
                step={1}
                presets={[5, 10, 15, 20]}
              />
              {insulinRows.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeInsulinRow(row.id)}
                  className="flex items-center gap-1.5 px-1 text-xs"
                  style={{ color: FAINT }}
                >
                  <Trash2 className="h-3 w-3" />
                  Remove this dose
                </button>
              )}
            </div>
          );
        })}
        <button
          type="button"
          onClick={addInsulinRow}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed py-3 text-sm font-medium"
          style={{ borderColor: HAIRLINE, color: TAUPE }}
        >
          <Plus className="h-4 w-4" />
          Add another dose
        </button>
      </div>

      {/* ── Shared time + notes ── */}
      <div className="mt-6 space-y-5">
        <NowTimeField
          dateValue={date}
          timeValue={time}
          onDateChange={setDate}
          onTimeChange={setTime}
          maxDate={getTodayDateValue()}
          maxTime={date === getTodayDateValue() ? new Date().toTimeString().slice(0, 5) : undefined}
        />
        <TextField label="Notes" value={sharedNotes} onChange={setSharedNotes} placeholder="e.g. before lunch" multiline />
      </div>
    </LogSheetShell>
  );
}