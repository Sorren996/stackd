import { useState, useEffect, useMemo } from "react";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { getDefaultInsulinLibrary } from "@/lib/userSettings";
import { getGlucoseUnits, glucoseUnitLabel, parseGlucoseInput } from "@/lib/glucoseUnits";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import {
  StepperField,
  SegmentedControl,
  TimeField,
  TextField,
  RescueCarbToggle,
  FieldLabel,
  COPPER,
  CREAM,
  FAINT,
} from "@/components/forms/FieldKit";

function toTimeValue(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toTimeString().slice(0, 5) : date.toTimeString().slice(0, 5);
}

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function toDateValue(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) return getTodayDateValue();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function mergeDateTime(dateValue, timeValue) {
  const [hours, minutes] = String(timeValue || "").split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  const date = dateValue ? new Date(dateValue + "T00:00:00") : new Date();
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(hours, minutes, 0, 0);
  if (date.getTime() > Date.now()) return null;
  return date.toISOString();
}

function getEditInitialForm(log) {
  if (!log) return {};
  if (log.type === "insulin") {
    return {
      insulin_type: log.item.insulin_type || "",
      units: String(log.item.units ?? ""),
      date: toDateValue(log.item.administered_at),
      time: toTimeValue(log.item.administered_at),
      notes: log.item.notes || "",
    };
  }
  if (log.type === "glucose") {
    return {
      value: String(log.item.value ?? ""),
      date: toDateValue(log.item.recorded_at),
      time: toTimeValue(log.item.recorded_at),
      notes: log.item.notes || "",
    };
  }
  return {
    food_name: log.item.food_name || log.item.name || "",
    carbs: String(log.item.carbs ?? ""),
    fat_grams: log.item.fat_grams ?? "",
    protein_grams: log.item.protein_grams ?? "",
    is_rescue_carb: log.item.is_rescue_carb === true || log.item.classification === "rescue_carbs",
    date: toDateValue(log.item.consumed_at),
    time: toTimeValue(log.item.consumed_at),
    notes: log.item.notes || "",
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

/**
 * Shared edit sheet for insulin, glucose, and nourishment logs — now on the
 * shared LogSheetShell with the field kit. Locked logs are read-only (the
 * entity's RLS blocks writes server-side, but we also gate the Save button
 * here for clarity). Preserves existing values and time/date semantics.
 */
export default function EditLogSheet({ log, onClose, onSave, isSaving }) {
  const [form, setForm] = useState(() => getEditInitialForm(log));
  const [insulinLibrary, setInsulinLibrary] = useState(readInsulinLibrary);
  const [glucoseUnits, setGlucoseUnits] = useState(getGlucoseUnits);

  useEffect(() => {
    setForm(getEditInitialForm(log));
  }, [log]);

  useEffect(() => {
    const refreshLib = () => setInsulinLibrary(readInsulinLibrary());
    const refreshUnits = () => setGlucoseUnits(getGlucoseUnits());
    window.addEventListener("insulin-settings-updated", refreshLib);
    window.addEventListener("glucose-units-updated", refreshUnits);
    window.addEventListener("storage", refreshLib);
    return () => {
      window.removeEventListener("insulin-settings-updated", refreshLib);
      window.removeEventListener("glucose-units-updated", refreshUnits);
      window.removeEventListener("storage", refreshLib);
    };
  }, []);

  const insulinTypeOptions = useMemo(
    () =>
      Object.entries(INSULIN_PROFILES)
        .filter(([name]) => insulinLibrary.includes(name))
        .map(([name, profile]) => ({ value: name, label: name, color: profile.color })),
    [insulinLibrary]
  );

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const title = log?.type === "insulin" ? "Edit Insulin" : log?.type === "glucose" ? "Edit Reading" : "Edit Meal";
  const isLocked = !!log?.item?.is_locked;

  const submit = () => {
    if (!log || isLocked) return;
    if (log.type === "insulin") {
      const units = Number(form.units);
      if (!form.insulin_type || !Number.isFinite(units) || units <= 0) {
        toast.error("Choose an insulin type and enter units.");
        return;
      }
      const administeredAt = mergeDateTime(form.date, form.time);
      if (!administeredAt) {
        toast.error("Choose a time that is not in the future.");
        return;
      }
      onSave({
        type: "insulin",
        id: log.item.id,
        patch: {
          insulin_type: form.insulin_type,
          units,
          administered_at: administeredAt,
          notes: form.notes || undefined,
        },
      });
      return;
    }

    if (log.type === "glucose") {
      const value = parseGlucoseInput(form.value);
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("Enter a glucose value.");
        return;
      }
      const recordedAt = mergeDateTime(form.date, form.time);
      if (!recordedAt) {
        toast.error("Choose a time that is not in the future.");
        return;
      }
      onSave({
        type: "glucose",
        id: log.item.id,
        patch: { value, recorded_at: recordedAt, notes: form.notes || undefined },
      });
      return;
    }

    const carbs = Number(form.carbs);
    if (!Number.isFinite(carbs) || carbs <= 0) {
      toast.error("Enter carb grams.");
      return;
    }
    const consumedAt = mergeDateTime(form.date, form.time);
    if (!consumedAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }
    onSave({
      type: "carbs",
      id: log.item.id,
      patch: {
        name: form.food_name || "Food",
        food_name: form.food_name || "Food",
        carbs,
        consumed_at: consumedAt,
        notes: form.notes || undefined,
        fat_grams: Number(form.fat_grams) || 0,
        protein_grams: Number(form.protein_grams) || 0,
        is_rescue_carb: form.is_rescue_carb || false,
      },
    });
  };

  const todayDateValue = getTodayDateValue();
  const nowTimeString = new Date().toTimeString().slice(0, 5);

  return (
    <LogSheetShell
      open={!!log}
      onClose={onClose}
      title={title}
      footer={
        isLocked ? (
          <p className="py-2 text-center text-xs" style={{ color: FAINT }}>
            This moment is locked and can't be edited.
          </p>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={isSaving}
            className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
            style={{ background: COPPER, color: CREAM, boxShadow: "0 4px 16px rgba(156,82,40,0.25)" }}
          >
            {isSaving ? "Saving..." : "Save moment"}
          </button>
        )
      }
    >
      <div className="space-y-4">
        {log?.type === "insulin" && (
          <>
            <SegmentedControl
              label="Insulin Type"
              value={form.insulin_type}
              onChange={(value) => updateField("insulin_type", value)}
              options={insulinTypeOptions}
              ariaLabel="Insulin type"
            />
            <StepperField
              label="Units"
              value={form.units}
              onChange={(value) => updateField("units", value)}
              unit="U"
              step={1}
              presets={[5, 10, 15, 20]}
            />
          </>
        )}

        {log?.type === "glucose" &&
          (glucoseUnits === "mmol/L" ? (
            <TextField
              label={`Glucose (${glucoseUnitLabel()})`}
              value={form.value}
              onChange={(v) => updateField("value", v.replace(/[^\d.]/g, "").slice(0, 4))}
              placeholder="e.g. 6.5"
            />
          ) : (
            <StepperField
              label={`Glucose (${glucoseUnitLabel()})`}
              value={form.value}
              onChange={(value) => updateField("value", value)}
              step={5}
              presets={[70, 100, 130, 180]}
            />
          ))}

        {log?.type === "carbs" && (
          <>
            <TextField label="Meal" value={form.food_name} onChange={(value) => updateField("food_name", value)} placeholder="Food" />
            <StepperField
              label="Carbs"
              value={form.carbs}
              onChange={(value) => updateField("carbs", value)}
              unit="g"
              step={5}
              presets={[15, 30, 45, 60]}
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Protein" value={form.protein_grams} onChange={(v) => updateField("protein_grams", v.replace(/[^\d.]/g, "").slice(0, 4))} placeholder="0" />
              <TextField label="Fat" value={form.fat_grams} onChange={(v) => updateField("fat_grams", v.replace(/[^\d.]/g, "").slice(0, 4))} placeholder="0" />
            </div>
            <RescueCarbToggle checked={form.is_rescue_carb} onChange={(checked) => updateField("is_rescue_carb", checked)} />
          </>
        )}

        <TimeField
          dateValue={form.date}
          timeValue={form.time}
          onDateChange={(value) => updateField("date", value)}
          onTimeChange={(value) => updateField("time", value)}
          maxDate={todayDateValue}
          maxTime={form.date === todayDateValue ? nowTimeString : undefined}
        />
        <TextField label="Notes" value={form.notes} onChange={(value) => updateField("notes", value)} placeholder="Notes" multiline />
      </div>
    </LogSheetShell>
  );
}