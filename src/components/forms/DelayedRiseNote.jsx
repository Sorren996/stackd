import { Clock } from "lucide-react";
import { hasDelayedRise } from "@/lib/mealMonitoring";

/**
 * High-fat / high-protein label — descriptive only. Appears when the meal's
 * macros meet the app's delayed-rise thresholds.
 */
export default function DelayedRiseNote({ carbs, fat, protein }) {
  const qualifies = hasDelayedRise({
    carbs: Number(carbs) || 0,
    fat_grams: Number(fat) || 0,
    protein_grams: Number(protein) || 0,
  });
  if (!qualifies) return null;

  return (
    <div className="flex items-start gap-2 rounded-2xl px-4 py-3" style={{ background: "#fbf2e2" }}>
      <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#8a5a12" }} />
      <div>
        <p className="text-[12px] font-semibold" style={{ color: "#8a5a12" }}>High fat & protein meal</p>
        <p className="mt-0.5 text-[11px] leading-relaxed" style={{ color: "#8a5a12" }}>
          Fat and protein slow absorption, so glucose may arrive in a gentle, lingering wave (3 to 8 hours after eating). Stackd will keep an extended eye on this window.
        </p>
      </div>
    </div>
  );
}