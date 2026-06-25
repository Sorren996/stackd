import { useState } from "react";
import { Check, Loader2, Sparkles } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { InvokeLLM } from "@/api/integrations";

function normalizeEstimatedMeal(data, fallbackName) {
  return {
    mealName: data.mealName || data.name || fallbackName || "Estimated meal",
    servingDescription: data.servingDescription || data.serving_description || "",
    carbs: Number(data.carbs ?? 0),
    protein: Number(data.protein ?? 0),
    fat: Number(data.fat ?? 0),
    calories: Number(data.calories ?? 0),
    gi: Number(data.gi ?? 50),
    absorptionProfile: data.absorptionProfile || data.absorption_profile || "medium",
    confidence: Number(data.confidence ?? 0),
    assumptions: Array.isArray(data.assumptions) ? data.assumptions : [],
  };
}

export default function CarbsTab({ onSubmit, isPending }) {
  const [mealText, setMealText] = useState("");
  const [estimatedMeal, setEstimatedMeal] = useState(null);
  const [isEstimatingMeal, setIsEstimatingMeal] = useState(false);

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
    } catch (error) {
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

    onSubmit([
      {
        name: estimatedMeal.mealName || "Estimated meal",
        carbs,
        protein: Number(estimatedMeal.protein) || 0,
        fat: Number(estimatedMeal.fat) || 0,
        calories: Number(estimatedMeal.calories) || 0,
        gi: Number(estimatedMeal.gi) || 50,
        category: "AI Estimated",
        profile: estimatedMeal.absorptionProfile || "medium",
        absorption_profile: estimatedMeal.absorptionProfile || "medium",
        consumed_at: new Date().toISOString(),
        is_custom: false,
        notes:
          [
            mealText.trim() ? `Input: ${mealText.trim()}` : null,
            estimatedMeal.servingDescription
              ? `Serving: ${estimatedMeal.servingDescription}`
              : null,
            estimatedMeal.confidence
              ? `AI confidence: ${Math.round(estimatedMeal.confidence * 100)}%`
              : null,
            estimatedMeal.assumptions?.length
              ? `Assumptions: ${estimatedMeal.assumptions.join("; ")}`
              : null,
          ]
            .filter(Boolean)
            .join("\n") || undefined,
      },
    ]);
  };

  return (
    <div className="flex h-full flex-col px-5 pb-6 pt-4">
      <style>{`
        @keyframes ai-estimate-spin {
          to { transform: rotate(360deg); }
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
          padding: 1px;
          background: rgba(255, 255, 255, 0.1);
        }

        .ai-estimate-field::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: conic-gradient(
            from 0deg,
            rgba(45, 212, 191, 0),
            rgba(45, 212, 191, 0.9),
            rgba(59, 130, 246, 0.95),
            rgba(168, 85, 247, 0.95),
            rgba(45, 212, 191, 0)
          );
          opacity: 0;
          transition: opacity 180ms ease;
          pointer-events: none;
          z-index: 0;
        }

        .ai-estimate-field-active {
          padding: 2px;
          animation: ai-estimate-pulse 1.65s ease-in-out infinite;
        }

        .ai-estimate-field-active::before {
          opacity: 1;
          animation: ai-estimate-spin 1.25s linear infinite;
        }

        .ai-estimate-field-inner {
          position: relative;
          z-index: 1;
          border-radius: 0.875rem;
          background: hsl(162,10%,8%);
          overflow: hidden;
        }
      `}</style>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-teal-300" />
          <p className="text-sm font-bold uppercase tracking-widest text-white/40">
            Estimate a meal
          </p>
        </div>

        <div
          className={`ai-estimate-field ${
            isEstimatingMeal ? "ai-estimate-field-active" : ""
          }`}
        >
          <div className="ai-estimate-field-inner">
            <Textarea
              value={mealText}
              onChange={(event) => setMealText(event.target.value)}
              placeholder="e.g. 2 slices pepperoni pizza and a 12 oz coke"
              rows={4}
              className={`resize-none rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-white/30 ${
                isEstimatingMeal ? "border-transparent bg-white/5" : ""
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
        <div className="mt-5 min-h-0 flex-1 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="mb-3 text-sm font-bold uppercase tracking-widest text-white/40">
            Review estimate
          </p>

          <label>
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
              Meal name
            </span>
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
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
                  {label}
                </span>
                <div className="flex items-center rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    inputMode="decimal"
                    value={estimatedMeal[key]}
                    onChange={(event) =>
                      updateEstimatedMeal({ [key]: event.target.value })
                    }
                    className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
                  />
                  {unit && <span className="text-xs text-white/35">{unit}</span>}
                </div>
              </label>
            ))}
          </div>

          <label className="mt-3 block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-white/35">
              Absorption
            </span>
            <select
              value={estimatedMeal.absorptionProfile}
              onChange={(event) =>
                updateEstimatedMeal({ absorptionProfile: event.target.value })
              }
              className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-teal-400"
            >
              <option value="fast" className="bg-[#18211f]">
                Fast
              </option>
              <option value="medium" className="bg-[#18211f]">
                Medium
              </option>
              <option value="slow" className="bg-[#18211f]">
                Slow
              </option>
            </select>
          </label>

          {estimatedMeal.assumptions?.length > 0 && (
            <div className="mt-3 rounded-xl bg-white/[0.04] px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                Assumptions
              </p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">
                {estimatedMeal.assumptions.join("; ")}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 flex min-h-[180px] flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 px-6 text-center">
          <p className="text-sm leading-relaxed text-white/35">
            Enter a meal description above to estimate carbs, GI, calories, protein, fat, and absorption speed.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmitEstimate}
        disabled={!estimatedMeal || isPending}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-600 py-4 text-base font-semibold text-white transition hover:bg-orange-500 disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
        {isPending ? "Logging..." : "Log meal estimate"}
      </button>
    </div>
  );
}
