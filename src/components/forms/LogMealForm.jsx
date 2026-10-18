import { useEffect, useState } from "react";
import { useCreateCarbs } from "@/hooks/useLogMutations";
import { hasDelayedRise } from "@/lib/mealMonitoring";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import MealEstimateChip from "@/components/forms/MealEstimateChip";
import MealPhotoChip from "@/components/forms/MealPhotoChip";
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

// Map a continuous gram value back to the closest Low/Med/High level for the
// UI selector. The stored grams still come from the estimate when present —
// this is only so the selector reflects the estimate after it's applied.
function levelFromGrams(grams) {
  if (grams <= 5) return "low";
  if (grams >= 35) return "high";
  return "med";
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
  // Continuous estimate fields from the AI estimator. When present these
  // override the Low/Med/High preset grams so the stored curve reflects the
  // food's real composition. Cleared when the user manually changes a level.
  const [estMacros, setEstMacros] = useState(null);

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
    setEstMacros(null);
  }, [open]);

  const carbsNum = Number(carbs) || 0;
  const levelGrams = proteinFatFromLevels(proteinLevel, fatLevel);
  // Prefer the estimate's continuous grams when available; fall back to the
  // Low/Med/High preset grams for manual entry.
  const fat_grams = estMacros?.fat_grams ?? levelGrams.fat_grams;
  const protein_grams = estMacros?.protein_grams ?? levelGrams.protein_grams;
  const glycemic_index = estMacros?.glycemic_index ?? null;
  const absorption_profile = estMacros?.absorption_profile ?? null;
  const speed_class = estMacros?.speed_class ?? null;
  const dual_wave = estMacros?.dual_wave ?? null;
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
      glycemic_index,
      absorption_profile,
      speed_class,
      dual_wave,
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

        <div className="flex flex-wrap gap-2">
          <MealEstimateChip
            description={foodName}
            onEstimate={(est) => {
              if (est?.carbs_grams > 0) setCarbs(String(est.carbs_grams));
              if (Number.isFinite(est?.fat_grams) || Number.isFinite(est?.protein_grams)) {
                setEstMacros({
                  fat_grams: Number(est.fat_grams) || 0,
                  protein_grams: Number(est.protein_grams) || 0,
                  glycemic_index: Number.isFinite(est?.glycemic_index) ? Number(est.glycemic_index) : null,
                  absorption_profile: est.absorption_profile || null,
                  speed_class: est.speed_class || null,
                  dual_wave: Boolean(est.dual_wave),
                });
                setProteinLevel(levelFromGrams(Number(est.protein_grams) || 0));
                setFatLevel(levelFromGrams(Number(est.fat_grams) || 0));
              }
            }}
          />
          <MealPhotoChip
            onEstimate={(est) => {
              if (est?.meal_name) setFoodName(est.meal_name);
              if (est?.carbs_grams > 0) setCarbs(String(est.carbs_grams));
              if (Number.isFinite(est?.fat_grams) || Number.isFinite(est?.protein_grams)) {
                setEstMacros({
                  fat_grams: Number(est.fat_grams) || 0,
                  protein_grams: Number(est.protein_grams) || 0,
                  glycemic_index: Number.isFinite(est?.glycemic_index) ? Number(est.glycemic_index) : null,
                  absorption_profile: est.absorption_profile || null,
                  speed_class: est.speed_class || null,
                  dual_wave: Boolean(est.dual_wave),
                });
                setProteinLevel(levelFromGrams(Number(est.protein_grams) || 0));
                setFatLevel(levelFromGrams(Number(est.fat_grams) || 0));
              }
            }}
          />
        </div>

        <TapStepper
          label="Carbs"
          sub="· steps of 5g · tap to type"
          value={carbs}
          onChange={setCarbs}
          unit="g"
          step={5}
          presets={[15, 30, 45, 60]}
        />

        <TripleSegmented
          label="Protein"
          value={proteinLevel}
          onChange={(v) => {
            setProteinLevel(v);
            setEstMacros((prev) => prev ? { ...prev, protein_grams: MACRO_GRAMS[v] ?? 0 } : prev);
          }}
        />
        <TripleSegmented
          label="Fat"
          value={fatLevel}
          onChange={(v) => {
            setFatLevel(v);
            setEstMacros((prev) => prev ? { ...prev, fat_grams: MACRO_GRAMS[v] ?? 0 } : prev);
          }}
        />

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