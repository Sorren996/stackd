import { useEffect, useMemo, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { FOOD_DATABASE } from "@/lib/carbAbsorption";
import { base44 } from "@/api/base44Client";
import { InvokeLLM, UploadFile } from "@/api/integrations";
import { Camera, Check, Clock, Loader2, PenLine, Sparkles, X } from "lucide-react";
import HighProteinFatCheckbox from "@/components/HighProteinFatCheckbox";
import RescueCarbCheckbox from "@/components/RescueCarbCheckbox";
import { toast } from "sonner";
import { DateScrollField, TimeScrollField, NumberPadField, TextPadField } from "@/components/FormInputFields";
import SplitDosePlanner from "@/components/splitdose/SplitDosePlanner";
import { findMealMemory } from "@/lib/mealMemory";
import MealMemoryModal from "@/components/MealMemoryModal";

const CARB_COLOR = "#d97706";
const PROFILE_COLORS = { fast: "#ef4444", medium: "#f59e0b", slow: "#a78bfa" };
const CUSTOM_MODE_ENABLED = true;
const ABSORPTION_CATEGORY = {
  fast: "Fast Absorbing",
  medium: "Medium Absorbing",
  slow: "Slow Absorbing",
};

function normalizeEstimatedMeal(data, fallbackName) {
  const absorptionProfile = data.absorptionProfile || data.absorption_profile || "medium";

  return {
    mealName: data.mealName || data.name || fallbackName || "Estimated meal",
    servingDescription: data.servingDescription || data.serving_description || "",
    carbs: Number(data.carbs ?? 0),
    protein: Number(data.protein ?? 0),
    fat: Number(data.fat ?? 0),
    calories: Number(data.calories ?? 0),
    gi: Number(data.gi ?? 50),
    absorptionProfile: ABSORPTION_CATEGORY[absorptionProfile] ? absorptionProfile : "medium",
    confidence: Number(data.confidence ?? 0),
    assumptions: Array.isArray(data.assumptions) ? data.assumptions : [],
  };
}

function getTodayDateValue() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function buildConsumedAt(dateValue, timeValue) {
  const [hours, minutes] = String(timeValue || "").split(":").map(Number);
  const consumedAt = dateValue ? new Date(dateValue + "T00:00:00") : new Date();
  if (Number.isNaN(consumedAt.getTime())) return null;
  consumedAt.setHours(hours, minutes, 0, 0);
  if (consumedAt.getTime() > Date.now()) return null;
  return consumedAt.toISOString();
}

function readImageAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function CarbsTab({ open, onSubmit, isPending, onDirtyChange, embedded, externalDate, externalTime, onCarbsTotal }, ref) {
  const [mode, setMode] = useState("estimate");
  const [mealText, setMealText] = useState("");
  const [mealPhoto, setMealPhoto] = useState(null);
  const [mealPhotoFile, setMealPhotoFile] = useState(null);
  const [mealPhotoName, setMealPhotoName] = useState("");
  const [estimatedMeal, setEstimatedMeal] = useState(null);
  const [isEstimatingMeal, setIsEstimatingMeal] = useState(false);
  const [customFoodName, setCustomFoodName] = useState("");
  const [customCarbs, setCustomCarbs] = useState("");
  const [carbSearch, setCarbSearch] = useState("");
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [recentFoods, setRecentFoods] = useState([]);
  const [carbTime, setCarbTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [carbDate, setCarbDate] = useState(getTodayDateValue);
  const [isHighProteinFat, setIsHighProteinFat] = useState(false);
  const [isRescueCarb, setIsRescueCarb] = useState(false);
  const [memoryMatch, setMemoryMatch] = useState(null);
  const [memoryCurrent, setMemoryCurrent] = useState(null);
  const [memoryPending, setMemoryPending] = useState(null);
  const [isCheckingMemory, setIsCheckingMemory] = useState(false);

  const nowTimeString = new Date().toTimeString().slice(0, 5);
  const todayDateValue = getTodayDateValue();
  const submitDate = externalDate !== undefined ? externalDate : carbDate;
  const submitTime = externalTime !== undefined ? externalTime : carbTime;

  useEffect(() => {
    onDirtyChange?.(
      Boolean(mealText || mealPhotoFile || estimatedMeal || customFoodName || customCarbs || selectedFoods.length > 0)
    );
  }, [mealText, mealPhotoFile, estimatedMeal, customFoodName, customCarbs, selectedFoods, onDirtyChange]);

  // Refresh the consumed time whenever the form opens so a long-lived PWA
  // session never shows a stale time from when the tab was mounted.
  useEffect(() => {
    if (!open) return;
    setCarbTime(new Date().toTimeString().slice(0, 5));
    setCarbDate(getTodayDateValue());
  }, [open]);

  useEffect(() => {
    base44.entities.CarbEntry.list("-consumed_at", 20).then((entries) => {
      const seen = new Set();
      const recent = [];

      for (const entry of entries) {
        const foodName = entry.food_name || entry.name;
        if (!entry.is_custom && foodName && !seen.has(foodName)) {
          seen.add(foodName);
          const food = FOOD_DATABASE.find((item) => item.name === foodName);
          if (food) recent.push(food);
        }
        if (recent.length >= 3) break;
      }

      setRecentFoods(recent);
    }).catch(() => {});
  }, []);

  const filteredFoods = useMemo(() => {
    const query = carbSearch.toLowerCase().trim();
    if (!query) return [];
    return FOOD_DATABASE.filter((food) => food.name.toLowerCase().includes(query));
  }, [carbSearch]);

  const totalCarbs = selectedFoods.reduce((sum, item) => sum + (parseFloat(item.carbs) || 0), 0);
  const canSubmitManual = selectedFoods.length > 0 && selectedFoods.every((item) => parseFloat(item.carbs) > 0);
  const isEstimateMode = mode === "estimate";
  const isCustomMode = mode === "custom";
  const canSubmitCustom = customFoodName.trim().length > 0 && Number(customCarbs) > 0;
  const canSubmitCarbs = isEstimateMode ? !!estimatedMeal && !isEstimatingMeal : isCustomMode ? canSubmitCustom : canSubmitManual;
  const EstimateButtonIcon = isEstimatingMeal ? Loader2 : Sparkles;
  const estimateButtonLabel = isEstimatingMeal ? "Estimating..." : "Estimate meal";

  const currentMealName = isEstimateMode
    ? estimatedMeal?.mealName
    : isCustomMode
      ? customFoodName
      : selectedFoods.length === 1
        ? selectedFoods[0].food.name
        : selectedFoods.length > 1
          ? "Multiple foods"
          : "";

  const expectedDose = useMemo(() => {
    const carbs = isEstimateMode ? Number(estimatedMeal?.carbs) : isCustomMode ? Number(customCarbs) : totalCarbs;
    if (!carbs) return null;
    const per5g = Number(localStorage.getItem("meal_insulin_units_per_5g"));
    if (!per5g || per5g <= 0) return null;
    const gramsPerUnit = 5 / per5g;
    return (carbs / gramsPerUnit).toFixed(1);
  }, [estimatedMeal, customCarbs, totalCarbs]);

  const gateMealName = isEstimateMode
    ? estimatedMeal?.mealName
    : isCustomMode
      ? customFoodName
      : selectedFoods.length === 1
        ? selectedFoods[0].food.name
        : selectedFoods.map((f) => f.food.name).join(" ");
  const gateCarbs = isEstimateMode ? Number(estimatedMeal?.carbs) : isCustomMode ? Number(customCarbs) : totalCarbs;

  // Surface the live carb total + meal name to the parent sheet so it can show
  // a dynamic "Expected meal insulin" estimate alongside the insulin input.
  const onCarbsTotalRef = useRef(onCarbsTotal);
  onCarbsTotalRef.current = onCarbsTotal;
  useEffect(() => {
    onCarbsTotalRef.current?.({ carbs: Number(gateCarbs) || 0, mealName: String(gateMealName || "") });
  }, [gateCarbs, gateMealName]);

  const gateThenSubmit = async (realSubmit) => {
    const name = String(gateMealName || "").trim();
    const carbs = Number(gateCarbs) || 0;
    if (!name || carbs <= 0) { realSubmit(); return; }

    setIsCheckingMemory(true);
    try {
      const result = await findMealMemory({ mealName: name, carbs, highProteinFat: isHighProteinFat, mealTime: Date.now() });
      if (result?.found && result.best) {
        setMemoryMatch(result.best);
        setMemoryCurrent({ mealName: name, carbs, fingerprint: result.currentFingerprint, normalized_name: result.currentFingerprint?.normalized_name || name });
        setMemoryPending(() => realSubmit);
        return;
      }
    } catch {
      // Memory lookup is best-effort; never block logging.
    } finally {
      setIsCheckingMemory(false);
    }
    realSubmit();
  };

  const handleMemoryContinue = () => {
    const fn = memoryPending;
    setMemoryMatch(null);
    setMemoryCurrent(null);
    setMemoryPending(null);
    if (typeof fn === "function") fn();
  };
  const handleMemoryClose = () => {
    setMemoryMatch(null);
    setMemoryCurrent(null);
    setMemoryPending(null);
  };

  const handleSplitConfirm = (planData) => {
    if (!canSubmitCarbs) {
      toast.error("Complete your meal entry before confirming the split plan.");
      return;
    }
    if (isEstimateMode) gateThenSubmit(() => handleSubmitEstimate(planData));
    else if (isCustomMode) gateThenSubmit(() => handleSubmitCustom(planData));
    else gateThenSubmit(() => handleSubmitManual(planData));
  };

  const submitCarbsRef = useRef(() => {});
  submitCarbsRef.current = () => {
    if (isCustomMode) gateThenSubmit(() => handleSubmitCustom());
    else if (isEstimateMode) gateThenSubmit(() => handleSubmitEstimate());
    else gateThenSubmit(() => handleSubmitManual());
  };

  useImperativeHandle(ref, () => ({
    submit: () => submitCarbsRef.current(),
  }), []);

  const updateEstimatedMeal = (patch) => {
    setEstimatedMeal((meal) => (meal ? { ...meal, ...patch } : meal));
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image of your meal.");
      return;
    }

    try {
      const dataUrl = await readImageAsDataUrl(file);
      setMealPhoto(dataUrl);
      setMealPhotoFile(file);
      setMealPhotoName(file.name);
      setEstimatedMeal(null);
    } catch {
      toast.error("Unable to read that image.");
    }
  };

  const clearMealPhoto = () => {
    setMealPhoto(null);
    setMealPhotoFile(null);
    setMealPhotoName("");
  };

  const handleEstimateMeal = async () => {
    const description = mealText.trim();

    if (!description && !mealPhotoFile) {
      toast.error("Describe the meal or add a photo first.");
      return;
    }

    setIsEstimatingMeal(true);

    try {
      let uploadedPhotoUrl = null;

      if (mealPhotoFile) {
        toast.message("Uploading meal photo...");
        const uploadResult = await UploadFile({ file: mealPhotoFile });
        uploadedPhotoUrl = uploadResult?.file_url || uploadResult?.url;

        if (!uploadedPhotoUrl) {
          throw new Error("Meal photo upload failed.");
        }
      }

      const data = await InvokeLLM({
        prompt: `
Estimate nutrition for this meal:

${description ? `"${description}"` : "Use the attached food photo as the primary meal description."}

Return a cautious estimate using the visible food, plate/container size, and typical US serving sizes when exact serving sizes are missing.

Estimate:
- meal name
- serving description
- carbs in grams
- protein in grams
- fat in grams
- calories
- glycemic index from 0-100
- absorption profile: fast, medium, or slow
- confidence from 0 to 1
- assumptions

Do not give insulin dosing advice.
        `,
        file_urls: uploadedPhotoUrl ? [uploadedPhotoUrl] : undefined,
        response_json_schema: {
          type: "object",
          properties: {
            mealName: { type: "string" },
            servingDescription: { type: "string" },
            carbs: { type: "number" },
            protein: { type: "number" },
            fat: { type: "number" },
            calories: { type: "number" },
            gi: { type: "number" },
            absorptionProfile: {
              type: "string",
              enum: ["fast", "medium", "slow"],
            },
            confidence: { type: "number" },
            assumptions: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: [
            "mealName",
            "servingDescription",
            "carbs",
            "protein",
            "fat",
            "calories",
            "gi",
            "absorptionProfile",
            "confidence",
            "assumptions",
          ],
        },
      });

      setEstimatedMeal(normalizeEstimatedMeal(data, description || "Photo meal"));
    } catch (error) {
      toast.error(error?.message || "Unable to estimate that meal yet.");
    } finally {
      setIsEstimatingMeal(false);
    }
  };

  const handleSubmitEstimate = (splitPlan = null) => {
    if (!estimatedMeal) return;

    const carbs = Number(estimatedMeal.carbs);
    if (!Number.isFinite(carbs) || carbs <= 0) {
      toast.error("Enter estimated carbs before logging.");
      return;
    }

    const absorptionProfile = estimatedMeal.absorptionProfile || "medium";
    const consumedAt = buildConsumedAt(submitDate, submitTime);
    if (!consumedAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    onSubmit([
      {
        name: estimatedMeal.mealName || "Estimated meal",
        food_name: estimatedMeal.mealName || "Estimated meal",
        carbs,
        gi: Number(estimatedMeal.gi) || 50,
        category: ABSORPTION_CATEGORY[absorptionProfile],
        profile: absorptionProfile,
        absorption_profile: absorptionProfile,
        consumed_at: consumedAt,
        is_custom: true,
        is_high_protein_fat_meal: isHighProteinFat,
        is_rescue_carb: isRescueCarb,
      },
    ], splitPlan);
    setIsHighProteinFat(false);
    setIsRescueCarb(false);
  };

  const handleSubmitCustom = (splitPlan = null) => {
    const carbs = Number(customCarbs);
    if (!customFoodName.trim() || !Number.isFinite(carbs) || carbs <= 0) return;

    const consumedAt = buildConsumedAt(submitDate, submitTime);
    if (!consumedAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    const profile = "medium";
    onSubmit([
      {
        name: customFoodName.trim(),
        food_name: customFoodName.trim(),
        carbs,
        gi: 50,
        category: ABSORPTION_CATEGORY[profile],
        profile,
        absorption_profile: profile,
        consumed_at: consumedAt,
        is_custom: true,
        is_high_protein_fat_meal: isHighProteinFat,
        is_rescue_carb: isRescueCarb,
      },
    ], splitPlan);

    setIsHighProteinFat(false);
    setIsRescueCarb(false);
    setCustomFoodName("");
    setCustomCarbs("");
  };

  const addFood = (food) => {
    if (selectedFoods.find((item) => item.food.name === food.name)) return;
    setSelectedFoods((items) => [...items, { food, carbs: food.carbs }]);
    setCarbSearch("");
  };

  const removeFood = (name) => {
    setSelectedFoods((items) => items.filter((item) => item.food.name !== name));
  };

  const updateCarbs = (name, value) => {
    const carbs = parseFloat(value);
    setSelectedFoods((items) =>
      items.map((item) => item.food.name === name ? { ...item, carbs: Number.isNaN(carbs) ? "" : carbs } : item)
    );
  };

  const handleSubmitManual = (splitPlan = null) => {
    if (!canSubmitManual) return;
    const consumedAt = buildConsumedAt(submitDate, submitTime);
    if (!consumedAt) {
      toast.error("Choose a time that is not in the future.");
      return;
    }

    onSubmit(
      selectedFoods.map(({ food, carbs }) => ({
        name: food.name,
        food_name: food.name,
        carbs: parseFloat(carbs),
        gi: food.gi,
        category: food.category,
        profile: food.profile,
        absorption_profile: food.profile,
        serving_amount: 1,
        consumed_at: consumedAt,
        is_custom: false,
        is_high_protein_fat_meal: isHighProteinFat,
        is_rescue_carb: isRescueCarb,
      })),
      splitPlan
    );
    setIsHighProteinFat(false);
    setIsRescueCarb(false);
  };

  return (
    <>
      <style>{`
        @keyframes stackd-fade-up {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .stackd-reveal { animation: stackd-fade-up 280ms ease-out both; }
      `}</style>

      <div className={embedded ? "flex flex-col" : "flex min-h-0 flex-1 flex-col overflow-hidden"}>
        {CUSTOM_MODE_ENABLED && (
          <div className="px-5 pb-2 pt-4">
            <div className="flex rounded-2xl p-1" style={{ background: "#f7f1e8" }}>
              {[
                ["estimate", "AI Estimate", Sparkles],
                ["custom", "Custom", PenLine],
              ].map(([id, label, Icon]) => {
                const selected = mode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setMode(id)}
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium"
                    style={{
                      transition: "background 250ms ease-out, color 250ms ease-out",
                      background: selected ? "#9c5228" : "transparent",
                      color: selected ? "#f7f1e8" : "#8a7f70",
                    }}
                    aria-pressed={selected}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className={embedded ? "px-5 pb-6 pt-2" : "min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-5 pb-6 pt-2"}>
          {isCustomMode ? (
            <div className="space-y-4">
              <div>
                <span className="stackd-section-label">Food Name</span>
                <div className="mt-2">
                  <TextPadField
                    value={customFoodName}
                    onChange={setCustomFoodName}
                    placeholder="e.g. Rice and chicken"
                  />
                </div>
              </div>
              <div>
                <span className="stackd-section-label">Carbs</span>
                <div className="mt-2">
                  <NumberPadField
                    value={customCarbs}
                    onChange={setCustomCarbs}
                    unit="g"
                    placeholder="0"
                    maxLength={5}
                  />
                </div>
              </div>
            </div>
          ) : isEstimateMode ? (
            <div className="space-y-4">
              <div>
                <span className="stackd-section-label">Meal</span>
                <textarea
                  value={mealText}
                  onChange={(e) => setMealText(e.target.value)}
                  placeholder="Describe your meal..."
                  rows={3}
                  className="mt-2 w-full resize-none rounded-2xl px-4 py-3.5 text-sm focus:outline-none"
                  style={{
                    background: "#f7f1e8",
                    color: "#3f3830",
                    transition: "box-shadow 250ms ease-out",
                  }}
                  onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 2px #9c5228"; }}
                  onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>

              <div>
                {mealPhoto ? (
                  <div className="overflow-hidden rounded-2xl" style={{ background: "#f7f1e8" }}>
                    <div className="relative aspect-[4/3] w-full">
                      <img src={mealPhoto} alt="Selected meal" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={clearMealPhoto}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/70 backdrop-blur-sm transition hover:text-white"
                        aria-label="Remove meal photo"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label
                    className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition hover:opacity-70"
                    style={{
                      background: "#f7f1e8",
                      color: "#6b6153",
                    }}
                  >
                    <Camera className="h-4 w-4" />
                    Add food photo
                    <input type="file" accept="image/*" capture="environment" onChange={handlePhotoChange} className="hidden" />
                  </label>
                )}
              </div>

              <button
                type="button"
                onClick={handleEstimateMeal}
                disabled={(!mealText.trim() && !mealPhotoFile) || isEstimatingMeal}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition disabled:opacity-40"
                style={{
                  background: "#9c5228",
                  color: "#f7f1e8",
                }}
              >
                <EstimateButtonIcon className={`h-4 w-4 ${isEstimatingMeal ? "animate-spin" : ""}`} />
                <span className="whitespace-nowrap">{estimateButtonLabel}</span>
              </button>

              {estimatedMeal && (
                <div className="stackd-reveal space-y-3">
                  <div>
                    <span className="stackd-section-label">Estimated Nutrition</span>
                    <div className="mt-2">
                      <TextPadField
                        label="Meal name"
                        value={estimatedMeal.mealName}
                        onChange={(value) => updateEstimatedMeal({ mealName: value })}
                        placeholder="Meal name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["carbs", "Carbs", "g"],
                      ["protein", "Protein", "g"],
                      ["fat", "Fat", "g"],
                      ["calories", "Calories", ""],
                      ["gi", "GI", ""],
                    ].map(([key, label, unit]) => (
                      <div key={key} className={key === "gi" ? "col-span-2" : ""}>
                        <NumberPadField
                          label={label}
                          value={estimatedMeal[key]}
                          onChange={(value) => updateEstimatedMeal({ [key]: value })}
                          unit={unit}
                          decimal={key !== "calories" && key !== "gi"}
                        />
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between rounded-xl px-3 py-2.5" style={{ background: "#f7f1e8" }}>
                    <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#746959" }}>Absorption</span>
                    <span className="text-sm font-semibold" style={{ color: "#3f3830" }}>{ABSORPTION_CATEGORY[estimatedMeal.absorptionProfile] || "Medium"}</span>
                  </div>

                  {estimatedMeal.assumptions?.length > 0 && (
                    <p className="px-1 text-[11px] leading-relaxed text-white/35">{estimatedMeal.assumptions.join("; ")}</p>
                  )}
                </div>
              )}

              {estimatedMeal && (Number(estimatedMeal.protein) >= 30 || Number(estimatedMeal.fat) >= 20) && !isHighProteinFat && (
                <div className="rounded-xl px-3.5 py-2.5" style={{ background: "rgba(138,90,18,0.08)" }}>
                  <p className="text-[11px] leading-relaxed" style={{ color: "#8a5a12" }}>
                    This meal may contain substantial protein or fat. Review the monitoring option below.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="relative">
                <span className="stackd-section-label">Search Foods</span>
                <div className="mt-2">
                  <TextPadField value={carbSearch} onChange={setCarbSearch} placeholder="Search foods..." />
                </div>

                {filteredFoods.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 shadow-lg" style={{ background: "#fdf9f2" }}>
                    {filteredFoods.map((food) => {
                      const alreadySelected = !!selectedFoods.find((item) => item.food.name === food.name);
                      return (
                        <button
                          key={food.name}
                          type="button"
                          onClick={() => addFood(food)}
                          disabled={alreadySelected}
                          className="flex w-full items-center justify-between border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:opacity-70 disabled:opacity-40"
                        >
                          <div>
                            <p className="text-sm font-medium" style={{ color: "#3f3830" }}>{food.name}</p>
                            <p className="text-xs" style={{ color: "#746959" }}>{food.carbs}g - GI {food.gi}</p>
                          </div>
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-bold"
                            style={{ backgroundColor: `${PROFILE_COLORS[food.profile]}22`, color: PROFILE_COLORS[food.profile] }}
                          >
                            {food.profile}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {recentFoods.length > 0 && carbSearch === "" && (
                <div>
                  <span className="stackd-section-label flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    Recently Used
                  </span>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {recentFoods.map((food) => {
                      const alreadySelected = !!selectedFoods.find((item) => item.food.name === food.name);
                      return (
                        <button
                          key={food.name}
                          type="button"
                          onClick={() => addFood(food)}
                          disabled={alreadySelected}
                          className="flex flex-col items-start rounded-xl px-3 py-2 text-left transition-all disabled:opacity-40"
                          style={{
                            backgroundColor: alreadySelected ? `${PROFILE_COLORS[food.profile]}22` : "#f7f1e8",
                          }}
                        >
                          <span className="text-sm font-medium" style={{ color: "#3f3830" }}>{food.name}</span>
                          <span className="text-xs" style={{ color: "#746959" }}>{food.carbs}g - {food.profile}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedFoods.length > 0 && (
                <div>
                  <span className="stackd-section-label">Selected Foods</span>
                  <div className="mt-2 space-y-2">
                    {selectedFoods.map(({ food, carbs }) => (
                      <div key={food.name} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-white">{food.name}</p>
                          <p className="text-xs text-white/40">
                            GI {food.gi} - <span style={{ color: PROFILE_COLORS[food.profile] }}>{food.profile}</span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          <div className="w-28">
                            <NumberPadField
                              label="Carbs"
                              value={carbs}
                              onChange={(value) => updateCarbs(food.name, value)}
                              unit="g"
                              maxLength={5}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFood(food.name)}
                          className="shrink-0 text-white/30 transition-colors hover:text-white/70"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}

                    {selectedFoods.length > 1 && !isPending && (
                      <div className="flex items-center justify-between rounded-2xl px-4 py-2.5" style={{ background: "rgba(138,90,18,0.08)" }}>
                        <span className="text-sm" style={{ color: "#6b6153" }}>Total Carbs</span>
                        <span className="text-lg font-bold" style={{ color: "#8a5a12" }}>{Math.round(totalCarbs * 10) / 10}g</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {!embedded && (
            <div className="mt-5">
              <span className="stackd-section-label">Time Consumed</span>
              <div className="mt-2 space-y-3">
                <DateScrollField label="Date" value={carbDate} onChange={setCarbDate} max={todayDateValue} />
                <TimeScrollField label="Consumed at" value={carbTime} onChange={setCarbTime} max={carbDate === todayDateValue ? nowTimeString : undefined} />
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <HighProteinFatCheckbox checked={isHighProteinFat} onChange={setIsHighProteinFat} />
            <RescueCarbCheckbox checked={isRescueCarb} onChange={setIsRescueCarb} />
          </div>

          {isHighProteinFat && (
            <SplitDosePlanner
              mealName={currentMealName}
              expectedDose={expectedDose}
              onConfirm={handleSplitConfirm}
            />
          )}
        </div>

        {!embedded && (
          <div className={`shrink-0 px-5 pb-6 pt-2 ${isEstimateMode && isEstimatingMeal ? "hidden" : ""}`}>
            <button
              type="button"
              onClick={isCustomMode ? () => gateThenSubmit(handleSubmitCustom) : isEstimateMode ? () => gateThenSubmit(handleSubmitEstimate) : () => gateThenSubmit(handleSubmitManual)}
              disabled={isPending || isEstimatingMeal || isCheckingMemory || !canSubmitCarbs}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold disabled:opacity-40"
              style={{ background: "#3f3830", color: "#f7f1e8", boxShadow: "0 4px 16px rgba(63, 56, 48, 0.15)" }}
            >
              {isPending || isCheckingMemory ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Logging...
                </>
              ) : isCustomMode ? (
                <>
                  <Check className="h-4 w-4" />
                  {canSubmitCustom ? "Log carbs" : "Enter food and carbs"}
                </>
              ) : isEstimateMode ? (
                <>
                  <Check className="h-4 w-4" />
                  Log meal estimate
                </>
              ) : canSubmitManual ? (
                "Log meal"
              ) : (
                "Select a food to log"
              )}
            </button>
          </div>
        )}
      </div>

      <MealMemoryModal
        open={!!memoryMatch}
        match={memoryMatch}
        currentMeal={memoryCurrent}
        onContinue={handleMemoryContinue}
        onClose={handleMemoryClose}
      />
    </>
  );
}

export default forwardRef(CarbsTab);