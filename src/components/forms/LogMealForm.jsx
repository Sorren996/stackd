import { useEffect, useState } from "react";
import { useCreateCarbs } from "@/hooks/useLogMutations";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import {
  StepperField,
  TimeField,
  TextField,
  RescueCarbToggle,
  COPPER,
  CREAM,
} from "@/components/forms/FieldKit";

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/**
 * Log Meal form — shared shell. Meal name, carb stepper, rescue-carbs option,
 * time eaten, optional notes. NO manual high-fat/high-protein toggle — the
 * app auto-classifies high fat/protein status from the food data.
 */
export default function LogMealForm({ open, onClose }) {
  const [foodName, setFoodName] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fatGrams, setFatGrams] = useState("");
  const [proteinGrams, setProteinGrams] = useState("");
  const [isRescue, setIsRescue] = useState(false);
  const [date, setDate] = useState(getTodayDateValue);
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);

  const createCarb = useCreateCarbs();

  useEffect(() => {
    if (!open) return;
    setFoodName("");
    setCarbs("");
    setFatGrams("");
    setProteinGrams("");
    setIsRescue(false);
    setNotes("");
    setDate(getTodayDateValue());
    setTime(new Date().toTimeString().slice(0, 5));
  }, [open]);

  const carbsNum = Number(carbs) || 0;
  const canSubmit = foodName.trim() && carbsNum > 0 && !logging;

  const handleSubmit = () => {
    if (!canSubmit) return;
    const [hours, minutes] = String(time || "").split(":").map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      toast.error("Choose a time.");
      return;
    }
    const dt = date ? new Date(`${date}T00:00:00`) : new Date();
    dt.setHours(hours, minutes, 0, 0);
    if (dt.getTime() > Date.now()) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    navigator.vibrate?.(20);
    setLogging(true);

    const entry = {
      name: foodName.trim(),
      food_name: foodName.trim(),
      carbs: carbsNum,
      fat_grams: Number(fatGrams) || 0,
      protein_grams: Number(proteinGrams) || 0,
      consumed_at: dt.toISOString(),
      is_rescue_carb: isRescue,
      notes: notes || undefined,
    };
    const submittedEntries = [entry];
    const optimisticEntries = [{ ...entry, id: `optimistic-carb-${Date.now()}`, created_date: new Date().toISOString() }];

    createCarb.mutate(
      { submittedEntries, optimisticEntries, splitPlan: null },
      {
        onSuccess: () => {
          setLogging(false);
          onClose?.();
        },
        onError: () => {
          setLogging(false);
          toast.error("Unable to log. Please try again.");
        },
      }
    );
  };

  return (
    <LogSheetShell
      open={open}
      onClose={onClose}
      title="Log Meal"
      footer={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
          style={{ background: COPPER, color: CREAM, boxShadow: "0 4px 16px rgba(156,82,40,0.25)" }}
        >
          {logging ? "Saving..." : carbsNum ? `Save ${carbsNum}g meal` : "Add meal"}
        </button>
      }
    >
      <div className="space-y-4">
        <TextField label="Meal" value={foodName} onChange={setFoodName} placeholder="e.g. Lunch, snack" />
        <StepperField label="Carbs" value={carbs} onChange={setCarbs} unit="g" step={5} presets={[15, 30, 45, 60]} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Protein (g)" value={proteinGrams} onChange={(v) => setProteinGrams(v.replace(/[^\d.]/g, "").slice(0, 4))} placeholder="0" />
          <TextField label="Fat (g)" value={fatGrams} onChange={(v) => setFatGrams(v.replace(/[^\d.]/g, "").slice(0, 4))} placeholder="0" />
        </div>
        <RescueCarbToggle checked={isRescue} onChange={setIsRescue} />
        <TimeField
          dateValue={date}
          timeValue={time}
          onDateChange={setDate}
          onTimeChange={setTime}
          maxDate={getTodayDateValue()}
          maxTime={date === getTodayDateValue() ? new Date().toTimeString().slice(0, 5) : undefined}
        />
        <TextField label="Notes" value={notes} onChange={setNotes} placeholder="e.g. restaurant, homemade" multiline />
      </div>
    </LogSheetShell>
  );
}