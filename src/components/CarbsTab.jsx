import { useEffect, useMemo, useState } from "react";
import { FOOD_DATABASE } from "@/lib/carbAbsorption";
import { base44 } from "@/api/base44Client";
import { InvokeLLM } from "@/api/integrations";
import { Textarea } from "@/components/ui/textarea";
import { Check, Clock, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";

const CARB_COLOR = "#d97706";
const PROFILE_COLORS = { fast: "#ef4444", medium: "#f59e0b", slow: "#a78bfa" };
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
  return consumedAt.toISOString();
}

export default function CarbsTab({ onSubmit, isPending }) {
  const [mode, setMode] = useState("estimate");
  const [mealText, setMealText] = useState("");
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

  const updateEstimatedMeal = (patch) => {
    setEstimatedMeal((meal) => (meal ? { ...meal, ...patch } : meal));
  };

  const handleEstimateMeal = async () => {
    const description = mealText.trim();

    if (!description) {
      toast.error("Describe the meal first.");
      return;
    }

    setIsEstimatingMeal(true);

    try {
      const data = await InvokeLLM({
        prompt: `
Estimate nutrition for this meal:

"${description}"

Return a cautious estimate using typical US serving sizes when exact serving sizes are missing.

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

      setEstimatedMeal(normalizeEstimatedMeal(data, description));
    } catch {
      toast.error("Unable to estimate that meal yet.");
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

    onSubmit([
      {
        name: estimatedMeal.mealName || "Estimated meal",
        food_name: estimatedMeal.mealName || "Estimated meal",
        carbs,
        gi: Number(estimatedMeal.gi) || 50,
        category: ABSORPTION_CATEGORY[absorptionProfile],
        profile: absorptionProfile,
        absorption_profile: absorptionProfile,
        consumed_at: buildConsumedAt(carbTime),
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
        consumed_at: buildConsumedAt(carbTime),
        is_custom: false,
      }))
    );
  };

  return (
    <>
      <style>{`
        @property --ai-estimate-angle {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }

        @keyframes ai-estimate-spin {
          to { --ai-estimate-angle: 360deg; }
        }

        @keyframes ai-estimate-pulse {
          0%, 100% {
            box-shadow:
              0 0 0 1px rgba(45, 212, 191, 0.22),
              0 0 22px rgba(59, 130, 246, 0.18),
              0 0 34px rgba(168, 85, 247, 0.14);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(168, 85, 247, 0.38),
              0 0 28px rgba(59, 130, 246, 0.32),
              0 0 46px rgba(168, 85, 247, 0.28);
          }
        }

        .ai-estimate-field {
          position: relative;
          border-radius: 1rem;
          border: 1px solid rgba(255, 255, 255, 0.1);
          overflow: hidden;
          background: rgba(255, 255, 255, 0.08);
        }

        .ai-estimate-field-active {
          border: 0;
          padding: 2px;
          background: conic-gradient(
            from var(--ai-estimate-angle, 0deg),
            #2dd4bf,
            #3b82f6,
            #8b5cf6,
            #d946ef,
            #3b82f6,
            #2dd4bf
          );
          animation:
            ai-estimate-spin 1.25s linear infinite,
            ai-estimate-pulse 1.65s ease-in-out infinite;
        }

        .ai-estimate-field-inner {
          position: relative;
          z-index: 1;
          border-radius: calc(1rem - 2px);
          background: hsl(162,10%,8%);
        }
      `}</style>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-2">
          {mode === "estimate" ? (
            <div className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-teal-300" />
                  <p className="text-sm font-bold uppercase tracking-widest text-white/40">Estimate a meal</p>
                </div>

                <div className={`ai-estimate-field ${isEstimatingMeal ? "ai-estimate-field-active" : ""}`}>
                  <div className="ai-estimate-field-inner">
                    <Textarea
                      value={mealText}
                      onChange={(event) => setMealText(event.target.value)}
                      placeholder="e.g. 2 slices pepperoni pizza and a 12 oz coke"
                      rows={4}
                      className={`resize-none rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-white/30 ${
                        isEstimatingMeal ? "border-transparent" : ""
                      }`}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleEstimateMeal}
                  disabled={!mealText.trim() || isEstimatingMeal}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-teal-500 py-3 text-sm font-semibold text-white transition hover:bg-teal-400 disabled:opacity-40"
                >
                  {isEstimatingMeal ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Estimating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Estimate meal
                    </>
                  )}
                </button>
              </div>

              {estimatedMeal ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                  <p className="mb-3 text-sm font-bold uppercase tracking-widest text-white/40">Review estimate</p>

                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">Meal name</span>
                    <input
                      value={estimatedMeal.mealName}
                      onChange={(event) => updateEstimatedMeal({ mealName: event.target.value })}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-semibold text-white outline-none focus:border-teal-400"
                    />
                  </label>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {[
                      ["carbs", "Carbs", "g"],
                      ["protein", "Protein", "g"],
                      ["fat", "Fat", "g"],
                      ["calories", "Calories", ""],
                      ["gi", "GI", ""],
                    ].map(([key, label, unit]) => (
                      <label key={key} className={key === "gi" ? "col-span-2" : ""}>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</span>
                        <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            inputMode="decimal"
                            value={estimatedMeal[key]}
                            onChange={(event) => updateEstimatedMeal({ [key]: event.target.value })}
                            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                          />
                          {unit && <span className="text-xs text-white/35">{unit}</span>}
                        </div>
                      </label>
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
                <input
                  type="text"
                  value={carbSearch}
                  onChange={(event) => setCarbSearch(event.target.value)}
                  placeholder="Search foods..."
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none placeholder:text-white/30 transition-colors focus:border-amber-500/30"
                />

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
                          <input
                            type="number"
                            min="1"
                            max="500"
                            value={carbs}
                            onChange={(event) => updateCarbs(food.name, event.target.value)}
                            className="w-16 rounded-xl border border-white/10 bg-black/20 px-2 py-1.5 text-center text-sm font-bold text-white outline-none transition-colors focus:border-amber-500/40"
                          />
                          <span className="text-xs text-white/40">g</span>
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
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <span className="text-sm text-white/40">Consumed at</span>
              <input
                type="time"
                value={carbTime}
                max={nowTimeString}
                onChange={(event) => {
                  if (event.target.value <= nowTimeString) setCarbTime(event.target.value);
                }}
                className="cursor-pointer bg-transparent text-sm font-medium text-white outline-none"
                style={{ colorScheme: "dark" }}
              />
            </div>
          </div>
        </div>

        <div className="shrink-0 px-5 pb-6 pt-2">
          <button
            type="button"
            onClick={mode === "estimate" ? handleSubmitEstimate : handleSubmitManual}
            disabled={isPending || (mode === "estimate" ? !estimatedMeal : !canSubmitManual)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition-all disabled:opacity-40"
            style={{ backgroundColor: CARB_COLOR, filter: "brightness(0.9)" }}
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Logging...
              </>
            ) : mode === "estimate" ? (
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
