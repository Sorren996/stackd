import { useState, useEffect, useMemo } from "react";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { getDefaultInsulinLibrary } from "@/lib/userSettings";
import { getGlucoseUnits, glucoseUnitLabel, parseGlucoseInput } from "@/lib/glucoseUnits";
import { toast } from "sonner";
import { DateScrollField, TimeScrollField, NumberPadField, TextPadField, SelectField } from "@/components/FormInputFields";
import InsulinTypeSelector from "@/components/insulin/InsulinTypeSelector";
import UnitsStepper from "@/components/insulin/UnitsStepper";
import RescueCarbCheckbox from "@/components/RescueCarbCheckbox";
import EditSheetShell from "./EditSheetShell";

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
      meal_units: String(log.item.meal_units ?? ""),
      correction_units: String(log.item.correction_units ?? ""),
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
    absorption_profile: log.item.absorption_profile || log.item.profile || "medium",
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

const absorptionProfileOptions = [
  { value: "fast", label: "Fast", description: "Fast carbs" },
  { value: "medium", label: "Medium", description: "Balanced carbs" },
  { value: "slow", label: "Slow", description: "Slow carbs" },
];

/**
 * Shared edit sheet for insulin, glucose, and nourishment logs. Uses the
 * viewport-safe EditSheetShell (portaled to document.body) so the form is
 * always reachable regardless of scrolling/transformed ancestors. Preserves
 * existing values and time/date editing semantics with native inputs.
 */
export default function EditLogSheet({ log, onClose, onSave, isSaving }) {
  const [form, setForm] = useState(() => getEditInitialForm(log));
  const [insulinLibrary, setInsulinLibrary] = useState(readInsulinLibrary);
  const [glucoseUnits, setGlucoseUnits] = useState(getGlucoseUnits);
  const todayDateValue = getTodayDateValue();
  const nowTimeString = new Date().toTimeString().slice(0, 5);

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
        .map(([name, profile]) => ({ value: name, label: name, description: profile.category, color: profile.color })),
    [insulinLibrary]
  );

  const updateField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const title = log?.type === "insulin" ? "Edit Insulin" : log?.type === "glucose" ? "Edit Glucose" : "Edit Nourishment";

  const submit = () => {
    if (!log) return;
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
      const mealUnits = form.meal_units === "" ? undefined : Number(form.meal_units);
      const correctionUnits = form.correction_units === "" ? undefined : Number(form.correction_units);
      onSave({
        type: "insulin",
        id: log.item.id,
        patch: {
          insulin_type: form.insulin_type,
          units,
          meal_units: Number.isFinite(mealUnits) ? mealUnits : undefined,
          correction_units: Number.isFinite(correctionUnits) ? correctionUnits : undefined,
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
        patch: {
          value,
          recorded_at: recordedAt,
          notes: form.notes || undefined,
        },
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
        absorption_profile: form.absorption_profile || "medium",
        profile: form.absorption_profile || "medium",
        consumed_at: consumedAt,
        notes: form.notes || undefined,
        fat_grams: Number(form.fat_grams) || 0,
        protein_grams: Number(form.protein_grams) || 0,
        is_rescue_carb: form.is_rescue_carb || false,
      },
    });
  };

  return (
    <EditSheetShell
      open={!!log}
      onClose={onClose}
      title={title}
      footer={
        <button
          type="button"
          onClick={submit}
          disabled={isSaving}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
          style={{ background: "#3f3830", color: "#f7f1e8", boxShadow: "0 4px 16px rgba(63, 56, 48, 0.15)" }}
        >
          {isSaving ? "Saving..." : "Save moment"}
        </button>
      }
    >
      <style>{`.edit-sheet-body input,.edit-sheet-body select,.edit-sheet-body textarea{font-size:16px}`}</style>
      <div className="space-y-4">
        {log?.type === "insulin" && (
          <>
            <InsulinTypeSelector
              value={form.insulin_type}
              onChange={(value) => updateField("insulin_type", value)}
              options={insulinTypeOptions}
            />
            <UnitsStepper
              value={form.units}
              onChange={(value) => updateField("units", value)}
            />
            <div className="grid grid-cols-1 gap-2">
              <NumberPadField label="Meal" value={form.meal_units} onChange={(value) => updateField("meal_units", value)} />
              <NumberPadField label="Correction" value={form.correction_units} onChange={(value) => updateField("correction_units", value)} />
            </div>
          </>
        )}

        {log?.type === "glucose" && (
          <NumberPadField
            label="Glucose"
            value={form.value}
            onChange={(value) => {
              if (glucoseUnits === "mmol/L") {
                updateField("value", value.replace(/[^\d.]/g, "").slice(0, 4));
              } else {
                updateField("value", value.replace(/\D/g, "").slice(0, 3));
              }
            }}
            unit={glucoseUnitLabel()}
            decimal={glucoseUnits === "mmol/L"}
            maxLength={glucoseUnits === "mmol/L" ? 4 : 3}
          />
        )}

        {log?.type === "carbs" && (
          <>
            <TextPadField label="Food" value={form.food_name} onChange={(value) => updateField("food_name", value)} placeholder="Food" />
            <div className="grid grid-cols-2 gap-2">
              <NumberPadField label="Carbs" value={form.carbs} onChange={(value) => updateField("carbs", value)} />
              <SelectField
                label="Absorption"
                value={form.absorption_profile}
                onChange={(value) => updateField("absorption_profile", value)}
                options={absorptionProfileOptions}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberPadField label="Protein" value={form.protein_grams} onChange={(value) => updateField("protein_grams", value)} unit="g" />
              <NumberPadField label="Fat" value={form.fat_grams} onChange={(value) => updateField("fat_grams", value)} unit="g" />
            </div>
            <RescueCarbCheckbox
              checked={form.is_rescue_carb}
              onChange={(checked) => updateField("is_rescue_carb", checked)}
            />
          </>
        )}

        <DateScrollField label="Date" value={form.date} onChange={(value) => updateField("date", value)} max={todayDateValue} />
        <TimeScrollField label="Time" value={form.time} onChange={(value) => updateField("time", value)} max={form.date === todayDateValue ? nowTimeString : undefined} />
        <TextPadField label="Notes" value={form.notes} onChange={(value) => updateField("notes", value)} placeholder="Notes" multiline />
      </div>
    </EditSheetShell>
  );
}