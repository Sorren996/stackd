import { useEffect, useMemo, useState } from "react";
import { FOOD_DATABASE } from "@/lib/carbAbsorption";
import { base44 } from "@/api/base44Client";
import { InvokeLLM, UploadFile } from "@/api/integrations";
import { Camera, Check, Clock, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

const CARB_COLOR = "#d97706";
const PROFILE_COLORS = { fast: "#ef4444", medium: "#f59e0b", slow: "#a78bfa" };
const FOOD_SEARCH_ENABLED = false;
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

function buildConsumedAt(timeValue) {
  const [hours, minutes] = timeValue.split(":").map(Number);
  const consumedAt = new Date();
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

function formatTimeLabel(value) {
  const [hoursRaw, minutes = "00"] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.padStart(2, "0")} ${suffix}`;
}

function buildTimeValue(hour12, minute, suffix) {
  let hour = Number(hour12) % 12;
  if (suffix === "PM") hour += 12;
  const safeMinute = Math.max(0, Math.min(55, Number(minute) || 0));
  return `${String(hour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function parseTimeValue(value) {
  const [hoursRaw = "0", minutesRaw = "0"] = String(value || "00:00").split(":");
  const hours = Number(hoursRaw);
  return {
    hour12: hours % 12 || 12,
    minute: Math.max(0, Math.min(55, Math.floor(Number(minutesRaw) / 5) * 5)),
    suffix: hours >= 12 ? "PM" : "AM",
  };
}

function TimeScrollField({ label, value, onChange, max }) {
  const [open, setOpen] = useState(false);
  const parsed = parseTimeValue(value);
  const hours = Array.from({ length: 12 }, (_, index) => index + 1);
  const minutes = Array.from({ length: 12 }, (_, index) => index * 5);
  const updateTime = (patch) => {
    const next = { ...parsed, ...patch };
    const nextValue = buildTimeValue(next.hour12, next.minute, next.suffix);
    onChange(max && nextValue > max ? max : nextValue);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between">
        <span className="text-sm text-white/40">{label}</span>
        <span className="text-sm font-semibold text-white">{formatTimeLabel(value)}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-[1fr_1fr_0.9fr] gap-2">
          {[["hour12", hours], ["minute", minutes]].map(([key, values]) => (
            <div key={key} className="max-h-36 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-1" style={{ scrollbarWidth: "none" }}>
              {values.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => updateTime({ [key]: item })}
                  className={`mb-1 flex h-9 w-full items-center justify-center rounded-lg text-sm font-semibold transition last:mb-0 ${
                    parsed[key] === item ? "bg-teal-500 text-white" : "text-white/45 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {String(item).padStart(key === "minute" ? 2 : 1, "0")}
                </button>
              ))}
            </div>
          ))}
          <div className="grid gap-2">
            {["AM", "PM"].map((suffix) => (
              <button
                key={suffix}
                type="button"
                onClick={() => updateTime({ suffix })}
                className={`rounded-xl text-sm font-bold transition ${
                  parsed.suffix === suffix ? "bg-teal-500 text-white" : "border border-white/10 bg-black/20 text-white/45"
                }`}
              >
                {suffix}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NumberPadField({ label, value, onChange, unit, placeholder = "--", decimal = true, maxLength = 6 }) {
  const [open, setOpen] = useState(false);
  const textValue = value === undefined || value === null ? "" : String(value);
  const press = (key) => {
    if (key === "clear") return onChange("");
    if (key === "back") return onChange(textValue.slice(0, -1));
    if (key === "." && (!decimal || textValue.includes("."))) return;
    if (textValue.length >= maxLength) return;
    onChange(`${textValue}${key}`);
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between gap-3">
        <span className="text-left text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
        <span className="text-right text-base font-bold text-white">{textValue || placeholder}{unit && <span className="ml-1 text-xs text-white/35">{unit}</span>}</span>
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", decimal ? "." : "clear", "0", "back"].map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => press(key)}
              className="h-11 rounded-xl border border-white/10 bg-black/20 text-sm font-bold text-white/80 transition hover:bg-white/10"
            >
              {key === "back" ? "⌫" : key === "clear" ? "Clear" : key}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function TextPadField({ label, value, onChange, placeholder, multiline = false }) {
  const [open, setOpen] = useState(false);
  const rows = ["1234567890", "QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"];
  const add = (key) => onChange(`${value || ""}${key}`);

  return (
    <div>
      {label && <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left text-sm text-white outline-none transition focus:border-teal-400 ${multiline ? "min-h-24" : ""}`}
      >
        {value ? <span className="whitespace-pre-wrap">{value}</span> : <span className="text-white/30">{placeholder}</span>}
      </button>
      {open && (
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/30 p-2">
          {rows.map((row) => (
            <div key={row} className="mb-1 flex justify-center gap-1 last:mb-0">
              {[...row].map((letter) => (
                <button key={letter} type="button" onClick={() => add(letter.toLowerCase())} className="h-9 min-w-0 flex-1 rounded-lg bg-white/10 text-xs font-bold text-white/80">
                  {letter}
                </button>
              ))}
            </div>
          ))}
          <div className="mt-2 grid grid-cols-[1fr_1fr_2fr_1fr_1fr] gap-2">
            <button type="button" onClick={() => onChange("")} className="h-10 rounded-xl bg-white/10 text-xs font-bold text-white/65">Clear</button>
            <button type="button" onClick={() => add(",")} className="h-10 rounded-xl bg-white/10 text-xs font-bold text-white/65">,</button>
            <button type="button" onClick={() => add(" ")} className="h-10 rounded-xl bg-white/10 text-xs font-bold text-white/65">Space</button>
            <button type="button" onClick={() => add(".")} className="h-10 rounded-xl bg-white/10 text-xs font-bold text-white/65">.</button>
            <button type="button" onClick={() => onChange(String(value || "").slice(0, -1))} className="h-10 rounded-xl bg-white/10 text-xs font-bold text-white/65">⌫</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CarbsTab({ onSubmit, isPending }) {
  const [mode, setMode] = useState("estimate");
  const [mealText, setMealText] = useState("");
  const [mealPhoto, setMealPhoto] = useState(null);
  const [mealPhotoFile, setMealPhotoFile] = useState(null);
  const [mealPhotoName, setMealPhotoName] = useState("");
  const [estimatedMeal, setEstimatedMeal] = useState(null);
  const [isEstimatingMeal, setIsEstimatingMeal] = useState(false);
  const [carbSearch, setCarbSearch] = useState("");
  const [selectedFoods, setSelectedFoods] = useState([]);
  const [recentFoods, setRecentFoods] = useState([]);
  const [carbTime, setCarbTime] = useState(() => new Date().toTimeString().slice(0, 5));

  const nowTimeString = new Date().toTimeString().slice(0, 5);

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
  const isEstimateMode = !FOOD_SEARCH_ENABLED || mode === "estimate";
  const canSubmitCarbs = isEstimateMode ? !!estimatedMeal && !isEstimatingMeal : canSubmitManual;
  const EstimateButtonIcon = isEstimatingMeal ? Loader2 : Sparkles;
  const estimateButtonLabel = isEstimatingMeal ? "Estimating..." : "Estimate meal";

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

  const handleSubmitEstimate = () => {
    if (!estimatedMeal) return;

    const carbs = Number(estimatedMeal.carbs);
    if (!Number.isFinite(carbs) || carbs <= 0) {
      toast.error("Enter estimated carbs before logging.");
      return;
    }

    const absorptionProfile = estimatedMeal.absorptionProfile || "medium";
    const consumedAt = buildConsumedAt(carbTime);
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
      },
    ]);
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

  const handleSubmitManual = () => {
    if (!canSubmitManual) return;
    const consumedAt = buildConsumedAt(carbTime);
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
      }))
    );
  };

  return (
    <>
      <style>{`
        @keyframes ai-estimate-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(20, 184, 166, 0.55),
              0 0 14px rgba(20, 184, 166, 0.22),
              inset 0 0 0 1px rgba(20, 184, 166, 0.2);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(15, 118, 110, 0.9),
              0 0 24px rgba(15, 118, 110, 0.42),
              inset 0 0 0 1px rgba(20, 184, 166, 0.28);
          }
        }

        .ai-estimate-field {
          position: relative;
          border-radius: 1rem;
          border: 1px solid rgba(20, 184, 166, 0.42);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.05);
          box-shadow:
            0 0 0 1px rgba(20, 184, 166, 0.16),
            0 0 16px rgba(20, 184, 166, 0.12);
          transition: border-color 180ms ease, box-shadow 180ms ease;
        }

        .ai-estimate-field-active {
          border-color: rgba(15, 118, 110, 0.95);
          animation: ai-estimate-pulse 1.45s ease-in-out infinite;
        }

        .ai-estimate-field-inner {
          position: relative;
          z-index: 1;
          border-radius: 1rem;
          background: hsl(162,10%,8%);
        }
      `}</style>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {FOOD_SEARCH_ENABLED && (
          <div className="px-5 pb-2 pt-4">
            <div className="flex rounded-2xl bg-white/[0.06] p-1">
              {[
                ["estimate", "AI Estimate", Sparkles],
                ["manual", "Food Search", Clock],
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-sm font-medium transition-colors ${
                    mode === id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-2">
          {!FOOD_SEARCH_ENABLED || mode === "estimate" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-teal-300" />
                  <p className="text-sm font-bold uppercase tracking-widest text-white/40">Estimate a meal</p>
                </div>

                <div className={`ai-estimate-field ${isEstimatingMeal ? "ai-estimate-field-active" : ""}`}>
                  <div className="ai-estimate-field-inner p-1">
                    <TextPadField
                      value={mealText}
                      onChange={setMealText}
                      placeholder="e.g. 2 slices pepperoni pizza and a 12 oz coke, or add a photo"
                      multiline
                    />
                  </div>
                </div>

                <div className="mt-3">
                  {mealPhoto ? (
                    <div className="overflow-hidden rounded-2xl border border-teal-500/30 bg-teal-500/[0.04]">
                      <div className="relative aspect-[4/3] w-full bg-black/20">
                        <img
                          src={mealPhoto}
                          alt="Selected meal"
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={clearMealPhoto}
                          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/45 text-white/70 backdrop-blur-sm transition hover:text-white"
                          aria-label="Remove meal photo"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 text-xs text-teal-100/70">
                        <Camera className="h-3.5 w-3.5" />
                        <span className="truncate">{mealPhotoName || "Meal photo attached"}</span>
                      </div>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-teal-500/35 bg-teal-500/[0.03] px-4 py-3 text-sm font-semibold text-teal-100/75 transition hover:border-teal-400/60 hover:bg-teal-500/[0.06] hover:text-teal-50">
                      <Camera className="h-4 w-4" />
                      Add food photo
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        onChange={handlePhotoChange}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleEstimateMeal}
                  disabled={(!mealText.trim() && !mealPhotoFile) || isEstimatingMeal}
                  className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 py-3 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:opacity-40"
                >
                  <EstimateButtonIcon className={`h-4 w-4 ${isEstimatingMeal ? "animate-spin" : ""}`} />
                  <span className="whitespace-nowrap">{estimateButtonLabel}</span>
                </button>
              </div>

              {estimatedMeal ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="mb-3 text-sm font-bold uppercase tracking-widest text-white/40">Review estimate</p>

                  <TextPadField
                    label="Meal name"
                    value={estimatedMeal.mealName}
                    onChange={(value) => updateEstimatedMeal({ mealName: value })}
                    placeholder="Meal name"
                  />

                  <div className="mt-3 grid grid-cols-2 gap-2">
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

                  <label className="mt-3 block">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">Absorption</span>
                    <select
                      value={estimatedMeal.absorptionProfile}
                      onChange={(event) => updateEstimatedMeal({ absorptionProfile: event.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-teal-400"
                    >
                      <option value="fast" className="bg-[#18211f]">Fast</option>
                      <option value="medium" className="bg-[#18211f]">Medium</option>
                      <option value="slow" className="bg-[#18211f]">Slow</option>
                    </select>
                  </label>

                  {estimatedMeal.assumptions?.length > 0 && (
                    <div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">Assumptions</p>
                      <p className="mt-1 text-xs leading-relaxed text-white/45">{estimatedMeal.assumptions.join("; ")}</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex min-h-[160px] items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 text-center">
                  <p className="text-sm leading-relaxed text-white/35">
                    Enter a meal description above to estimate carbs, GI, calories, protein, fat, and absorption speed.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="relative">
                <p className="mb-3 text-sm font-bold uppercase tracking-widest text-white/40">Search Foods</p>
                <TextPadField value={carbSearch} onChange={setCarbSearch} placeholder="Search foods..." />

                {filteredFoods.length > 0 && (
                  <div className="mt-2 overflow-hidden rounded-2xl border border-white/10 bg-[hsl(162,10%,12%)] shadow-xl">
                    {filteredFoods.map((food) => {
                      const alreadySelected = !!selectedFoods.find((item) => item.food.name === food.name);
                      return (
                        <button
                          key={food.name}
                          type="button"
                          onClick={() => addFood(food)}
                          disabled={alreadySelected}
                          className="flex w-full items-center justify-between border-b border-white/5 px-4 py-3 text-left transition-colors last:border-0 hover:bg-white/5 disabled:opacity-40"
                        >
                          <div>
                            <p className="text-sm font-medium text-white">{food.name}</p>
                            <p className="text-xs text-white/40">{food.carbs}g - GI {food.gi}</p>
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
                  <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-white/40">
                    <Clock className="h-3.5 w-3.5" />
                    Recently Used
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {recentFoods.map((food) => {
                      const alreadySelected = !!selectedFoods.find((item) => item.food.name === food.name);
                      return (
                        <button
                          key={food.name}
                          type="button"
                          onClick={() => addFood(food)}
                          disabled={alreadySelected}
                          className="flex flex-col items-start rounded-xl border px-3 py-2 text-left transition-all disabled:opacity-40"
                          style={{
                            borderColor: alreadySelected ? `${PROFILE_COLORS[food.profile]}99` : "rgba(255,255,255,0.1)",
                            backgroundColor: alreadySelected ? `${PROFILE_COLORS[food.profile]}22` : "transparent",
                          }}
                        >
                          <span className="text-sm font-medium text-white">{food.name}</span>
                          <span className="text-xs text-white/40">{food.carbs}g - {food.profile}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedFoods.length > 0 && (
                <div>
                  <p className="mb-3 text-sm font-bold uppercase tracking-widest text-white/40">Selected Foods</p>
                  <div className="space-y-2">
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

                    {selectedFoods.length > 1 && (
                      <div className="flex items-center justify-between rounded-2xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5">
                        <span className="text-sm text-white/60">Total Carbs</span>
                        <span className="text-lg font-bold text-amber-400">{Math.round(totalCarbs * 10) / 10}g</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-5">
            <p className="mb-3 text-sm font-bold uppercase tracking-widest text-white/40">Time Consumed</p>
            <TimeScrollField label="Consumed at" value={carbTime} onChange={setCarbTime} max={nowTimeString} />
          </div>
        </div>

        <div className={`shrink-0 px-5 pb-6 pt-2 ${isEstimateMode && isEstimatingMeal ? "hidden" : ""}`}>
          <button
            type="button"
            onClick={isEstimateMode ? handleSubmitEstimate : handleSubmitManual}
            disabled={isPending || isEstimatingMeal || !canSubmitCarbs}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: CARB_COLOR, filter: "brightness(0.9)" }}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Logging...
              </>
            ) : isEstimateMode ? (
              <>
                <Check className="h-4 w-4" />
                Log meal estimate
              </>
            ) : canSubmitManual ? (
              `Log ${Math.round(totalCarbs * 10) / 10}g across ${selectedFoods.length} food${selectedFoods.length > 1 ? "s" : ""}`
            ) : (
              "Select a food to log"
            )}
          </button>
        </div>
      </div>
    </>
  );
}
