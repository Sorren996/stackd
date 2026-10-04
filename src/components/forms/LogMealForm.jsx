import { useEffect, useRef, useState } from "react";
import { Sparkles, Camera, Loader2, X } from "lucide-react";
import { InvokeLLM, UploadPublicFile } from "@/api/integrations";
import { useCreateCarbs } from "@/hooks/useLogMutations";
import { hasDelayedRise } from "@/lib/mealMonitoring";
import { toast } from "sonner";
import LogSheetShell from "@/components/forms/LogSheetShell";
import {
  TapStepper,
  CompactSegmented,
  TripleSegmented,
  RescueChip,
  NowTimeField,
  TextField,
  MACRO_GRAMS,
  COPPER,
  SAGE,
  CREAM,
  INK,
  FAINT,
} from "@/components/forms/FieldKit";

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function normalizeEstimatedMeal(data, fallbackName) {
  return {
    mealName: data.mealName || data.name || fallbackName || "Estimated meal",
    carbs: Number(data.carbs ?? 0),
    protein: Number(data.protein ?? 0),
    fat: Number(data.fat ?? 0),
    gi: Number(data.gi ?? 50),
    absorptionProfile: data.absorptionProfile || data.absorption_profile || "medium",
    confidence: Number(data.confidence ?? 0),
    assumptions: Array.isArray(data.assumptions) ? data.assumptions : [],
  };
}

function proteinFatFromLevels(proteinLevel, fatLevel) {
  return {
    protein_grams: MACRO_GRAMS[proteinLevel] ?? 0,
    fat_grams: MACRO_GRAMS[fatLevel] ?? 0,
  };
}

function levelsFromGrams(proteinGrams, fatGrams) {
  const toLevel = (g) => {
    const n = Number(g) || 0;
    if (n >= 40) return "high";
    if (n >= 15) return "med";
    return "low";
  };
  return { protein: toLevel(proteinGrams), fat: toLevel(fatGrams) };
}

/**
 * Log Meal — reference shell. Segmented "Custom meal" | "AI estimate".
 * Custom: optional name, carbs stepper (5g steps + 15/30/45/60 pills), protein
 * and fat Low/Med/High feeding the SAME hasDelayedRise detector used across the
 * app, rescue-carb chip, time defaults to now. AI estimate keeps the existing
 * InvokeLLM estimator; confirmed values land as plain form values with no
 * reference to the estimate afterward. No dose recommendations.
 */
export default function LogMealForm({ open, onClose }) {
  const [mode, setMode] = useState("custom");
  const [foodName, setFoodName] = useState("");
  const [carbs, setCarbs] = useState("");
  const [proteinLevel, setProteinLevel] = useState("low");
  const [fatLevel, setFatLevel] = useState("low");
  const [isRescue, setIsRescue] = useState(false);
  const [date, setDate] = useState(getTodayDateValue);
  const [time, setTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [notes, setNotes] = useState("");
  const [logging, setLogging] = useState(false);

  // AI estimate state
  const [aiText, setAiText] = useState("");
  const [isEstimating, setIsEstimating] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  const createCarb = useCreateCarbs();

  useEffect(() => {
    if (!open) return;
    setMode("custom");
    setFoodName("");
    setCarbs("");
    setProteinLevel("low");
    setFatLevel("low");
    setIsRescue(false);
    setNotes("");
    setAiText("");
    setAiResult(null);
    setPhotoUrl(null);
    setIsUploadingPhoto(false);
    setDate(getTodayDateValue());
    setTime(new Date().toTimeString().slice(0, 5));
  }, [open]);

  const carbsNum = Number(carbs) || 0;
  const { protein_grams, fat_grams } = proteinFatFromLevels(proteinLevel, fatLevel);
  const qualifiesDelayed = hasDelayedRise({ fat_grams, protein_grams, carbs: carbsNum });

  const canSubmit = mode === "custom"
    ? carbsNum > 0 && !logging
    : !!aiResult && !logging;

  const runEstimate = async (url, description) => {
    if (!description && !url) {
      toast.error("Describe what you ate or take a photo.");
      return;
    }
    setIsEstimating(true);
    try {
      const prompt = description
        ? `Estimate nutrition for this meal: "${description}".${url ? " A photo is also provided for reference." : ""} Return a cautious estimate using typical US serving sizes when exact serving sizes are missing. Estimate: meal name, carbs in grams, protein in grams, fat in grams, glycemic index 0-100, absorption profile (fast/medium/slow), confidence 0-1, assumptions. Do not give insulin dosing advice.`
        : `Estimate nutrition for this meal from the photo. Return a cautious estimate using typical US serving sizes. Estimate: meal name, carbs in grams, protein in grams, fat in grams, glycemic index 0-100, absorption profile (fast/medium/slow), confidence 0-1, assumptions. Do not give insulin dosing advice.`;
      const data = await InvokeLLM({
        prompt,
        file_urls: url ? [url] : undefined,
        response_json_schema: {
          type: "object",
          properties: {
            mealName: { type: "string" },
            carbs: { type: "number" },
            protein: { type: "number" },
            fat: { type: "number" },
            gi: { type: "number" },
            absorptionProfile: { type: "string", enum: ["fast", "medium", "slow"] },
            confidence: { type: "number" },
            assumptions: { type: "array", items: { type: "string" } },
          },
          required: ["mealName", "carbs", "protein", "fat", "gi", "absorptionProfile", "confidence", "assumptions"],
        },
      });
      setAiResult(normalizeEstimatedMeal(data, description || "Photo estimate"));
    } catch (error) {
      toast.error(error?.message || "Unable to estimate that meal yet.");
    } finally {
      setIsEstimating(false);
    }
  };

  const handleEstimate = () => runEstimate(photoUrl, aiText.trim());

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const { file_url } = await UploadPublicFile({ file });
      setPhotoUrl(file_url);
      await runEstimate(file_url, aiText.trim());
    } catch {
      toast.error("Unable to upload photo. Please try again.");
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleUseValues = () => {
    if (!aiResult) return;
    setFoodName(aiResult.mealName || "");
    setCarbs(String(Math.round(aiResult.carbs) || ""));
    const levels = levelsFromGrams(aiResult.protein, aiResult.fat);
    setProteinLevel(levels.protein);
    setFatLevel(levels.fat);
    setMode("custom");
    setAiResult(null);
    setAiText("");
    setPhotoUrl(null);
  };

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
        <div className="flex justify-center">
          <CompactSegmented
            value={mode}
            onChange={setMode}
            options={[
              { value: "custom", label: "Custom meal" },
              { value: "ai", label: "AI estimate" },
            ]}
            ariaLabel="Meal mode"
            layoutId="meal-mode-segment"
          />
        </div>

        {mode === "custom" ? (
          <div className="space-y-5">
            <TextField
              value={foodName}
              onChange={setFoodName}
              placeholder="Meal name (optional)"
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
        ) : (
          <div className="space-y-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
            />

            {photoUrl && (
              <div className="relative overflow-hidden rounded-2xl" style={{ border: "1px solid rgba(91,101,80,0.18)" }}>
                <img src={photoUrl} alt="Meal photo" className="max-h-48 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPhotoUrl(null)}
                  className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full transition active:scale-95"
                  style={{ background: "rgba(63,56,48,0.7)", color: CREAM }}
                  aria-label="Remove photo"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            <textarea
              value={aiText}
              onChange={(e) => setAiText(e.target.value)}
              placeholder="Describe what you ate (optional with photo)"
              rows={3}
              className="w-full rounded-2xl px-4 pt-3.5 text-base font-medium"
              style={{ background: "#f7f1e8", color: INK, border: "none", outline: "none", resize: "none", minHeight: "84px" }}
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isEstimating || isUploadingPhoto}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition disabled:opacity-40"
                style={{ background: "#f7f1e8", color: INK, border: "1px solid #eadccf" }}
              >
                {isUploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {isUploadingPhoto ? "Uploading..." : "Take photo"}
              </button>
              <button
                type="button"
                onClick={handleEstimate}
                disabled={(!aiText.trim() && !photoUrl) || isEstimating}
                className="flex flex-1 items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition disabled:opacity-40"
                style={{ background: SAGE, color: CREAM }}
              >
                {isEstimating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isEstimating ? "Estimating..." : "Estimate"}
              </button>
            </div>

            {aiResult && (
              <div
                className="rounded-2xl p-4"
                style={{ background: "rgba(91,101,80,0.08)", border: "1px solid rgba(91,101,80,0.18)" }}
              >
                <strong style={{ color: INK }}>{aiResult.mealName}</strong>
                <p className="mt-1 text-sm" style={{ color: FAINT }}>
                  about {Math.round(aiResult.carbs)}g carbs · protein {levelsFromGrams(aiResult.protein, aiResult.fat).protein.toLowerCase()} · fat {levelsFromGrams(aiResult.protein, aiResult.fat).fat.toLowerCase()}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setAiResult(null); setPhotoUrl(null); }}
                    className="flex-1 rounded-full py-2.5 text-sm font-semibold"
                    style={{ background: "#f7f1e8", color: FAINT }}
                  >
                    Start over
                  </button>
                  <button
                    type="button"
                    onClick={handleUseValues}
                    className="flex-1 rounded-full py-2.5 text-sm font-semibold"
                    style={{ background: COPPER, color: CREAM }}
                  >
                    Use values
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs leading-relaxed" style={{ color: FAINT }}>
              Estimates describe the meal. Your settings do the math later. Not a dose recommendation.
            </p>
          </div>
        )}
      </div>
    </LogSheetShell>
  );
}