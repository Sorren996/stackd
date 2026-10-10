import { useEffect, useState } from "react";
import { useCreateCarbs } from "@/hooks/useLogMutations";
import { hasDelayedRise } from "@/lib/mealMonitoring";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import MealEstimateChip from "@/components/forms/MealEstimateChip";
import {
  TapStepper,
  TripleSegmented,
  RescueChip,
  NowTimeField,
  TextField,
  MACRO_GRAMS,
  COPPER,
  CREAM,
  INK,
  FAINT,
} from "@/components/forms/FieldKit";

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function proteinFatFromLevels(proteinLevel, fatLevel) {
  return {
    protein_grams: MACRO_GRAMS[proteinLevel] ?? 0,
    fat_grams: MACRO_GRAMS[fatLevel] ?? 0,
  };
}

/**
 * Log Meal — custom meal entry only.
 * Name, carbs stepper (5g steps + 15/30/45/60 pills), protein and fat
 * Low/Med/High feeding the hasDelayedRise detector, rescue-carb chip,
 * time defaults to now. No dose recommendations.
 */
export default function LogMealForm({ open, onClose }) {
  const [foodName, setFoodName] = useState("");
  const [carbs, setCarbs] = useState("");
  const [proteinLevel, setProteinLevel] = useState("low");
  const [fatLevel, setFatLevel] = useState("low");
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
    setProteinLevel("low");
    setFatLevel("low");
    setIsRescue(false);
    setNotes("");
    setDate(getTodayDateValue());
    setTime(new Date().toTimeString().slice(0, 5));
  }, [open]);

  const carbsNum = Number(carbs) || 0;
  const { protein_grams, fat_grams } = proteinFatFromLevels(proteinLevel, fatLevel);
  const qualifiesDelayed = hasDelayedRise({ fat_grams, protein_grams, carbs: carbsNum });

  const canSubmit = carbsNum > 0 && !logging;

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
      name: (foodName.trim() || "Meal"),
      food_name: (foodName.trim() || "Meal"),
      carbs: carbsNum,
      consumed_at: dt.toISOString(),
      is_rescue_carb: isRescue,
      fat_grams,
      protein_grams,
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
      title="Log meal"
      footer={
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
          style={{ background: COPPER, color: CREAM, boxShadow: "0 4px 16px rgba(156,82,40,0.25)" }}
        >
          {logging ? "Logging..." : carbsNum ? `Log ${carbsNum}g of carbs` : "Add carbs"}
        </button>
      }
    >
      <div className="space-y-5">
        <TextField
          value={foodName}
          onChange={setFoodName}
          placeholder="Meal name (optional)"
        />

        <MealEstimateChip
          description={foodName}
          onEstimate={(est) => {
            if (est?.carbs_grams > 0) setCarbs(String(est.carbs_grams));
            if (est?.protein_level) setProteinLevel(est.protein_level);
            if (est?.fat_level) setFatLevel(est.fat_level);
          }}
        />

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

        {qualifiesDelayed && (
          <p className="text-xs leading-relaxed" style={{ color: "#8a5a12" }}>
            Extended monitoring will be added based on the fat and protein in this meal.
          </p>
        )}

        <div className="flex items-center gap-3">
          <RescueChip checked={isRescue} onChange={setIsRescue} />
        </div>

        <NowTimeField
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