import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { COPPER, FAINT } from "@/components/forms/FieldKit";

/**
 * Optional AI meal estimate. Sends ONLY the meal description text — never
 * glucose, doses, settings, or identity. Fills carbs (and protein/fat levels)
 * as a starting point the user can freely adjust.
 */
export default function MealEstimateChip({ description, onEstimate }) {
  const [loading, setLoading] = useState(false);
  const [estimated, setEstimated] = useState(false);
  const text = String(description || "").trim();
  const disabled = loading || text.length < 2;

  const handleEstimate = async () => {
    if (disabled) return;
    setLoading(true);
    try {
      const res = await base44.functions.invoke("estimateMealCarbs", { description: text });
      onEstimate(res.data);
      setEstimated(true);
    } catch (error) {
      toast.error(error?.response?.data?.error || "Could not estimate this meal. You can still enter carbs yourself.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleEstimate}
        disabled={disabled}
        className="flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40"
        style={{ background: "rgba(156,82,40,0.12)", color: COPPER }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
        {loading ? "Estimating..." : "Estimate with AI"}
      </button>
      <span className="text-xs" style={{ color: FAINT }}>
        {estimated ? "A starting point. Adjust it to fit your meal." : text.length < 2 ? "Optional · name your meal first" : "Optional · only the meal name is shared"}
      </span>
    </div>
  );
}