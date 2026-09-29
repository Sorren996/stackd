import { useState } from "react";
import { format } from "date-fns";
import { Utensils } from "lucide-react";
import DaySection from "./DaySection";
import MealOutcomeModal from "./MealOutcomeModal";
import { getMealSlotLabel } from "@/lib/mealSlot";
import { formatGlucose, formatGlucoseAbsDelta, glucoseUnitLabel } from "@/lib/glucoseUnits";

export default function DayMealOutcomes({ meals, glucose, insulin, targetLow, targetHigh, bare = false }) {
  const [selectedMeal, setSelectedMeal] = useState(null);

  if (!meals?.length) return null;

  const content = (
    <div className="space-y-2.5">
      {meals.map((meal) => {
        // #6b6153 (5.4:1) replaces #8a7f70 (3.5:1) for the neutral rise color —
        // WCAG AA for normal-size text on the #fdf9f2 card surface.
        const riseColor = meal.rise > 60 ? "#af751b" : meal.rise < 0 ? "#5b6550" : "#6b6153";
        const risePct = Math.min(100, Math.max(3, Math.abs(meal.rise) / 1.5));

        return (
          <button
            key={meal.id}
            onClick={() => setSelectedMeal(meal)}
            className="block w-full rounded-xl border px-3.5 py-3 text-left transition hover:opacity-70"
            style={{ background: "#fdf9f2", borderColor: "#eadccf" }}
          >
            <div className="flex items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold" style={{ color: "#3f3830" }}>{meal.name}</p>
                <p className="text-[10px]" style={{ color: "#746959" }}>{getMealSlotLabel({ time: meal.time, carbs: meal.carbs, fatGrams: meal.fat_grams, proteinGrams: meal.protein_grams, foodName: meal.name })}</p>
              </div>
              <span className="shrink-0 text-[10px]" style={{ color: "#746959" }}>{format(new Date(meal.time), "h:mm a")}</span>
            </div>

            <div className="mt-1.5 flex items-center gap-2 text-[11px]" style={{ color: "#6b6153" }}>
              <span>{Math.round(meal.carbs)}g carbs</span>
              {meal.insulinUnits != null && (
                <>
                  <span>{meal.insulinUnits}u support</span>
                </>
              )}
              {meal.highProteinFat && (
                <span style={{ color: "#8a6db8" }}>higher protein/fat</span>
              )}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <span className="text-sm font-bold" style={{ color: "#3f3830" }}>{formatGlucose(meal.startingGlucose)}</span>
              <span style={{ color: "#746959" }}>→</span>
              <span className="text-sm font-bold" style={{ color: riseColor }}>
                {formatGlucose(meal.peakGlucose)}
              </span>
              <span className="text-[10px]" style={{ color: "#746959" }}>{glucoseUnitLabel()}</span>
              <span className="ml-auto text-sm font-bold" style={{ color: riseColor }}>
                {meal.rise > 0 ? "+" : ""}
                {formatGlucoseAbsDelta(meal.rise)}
              </span>
            </div>

            <div className="mt-1.5 h-1 rounded-full overflow-hidden" style={{ background: "rgba(63, 56, 48, 0.06)" }}>
              <div
                className="h-full rounded-full"
                style={{ width: `${risePct}%`, background: riseColor, opacity: 0.5 }}
              />
            </div>
            <p className="mt-1.5 text-[9px]" style={{ color: "#746959" }}>Tap to view glucose response</p>
          </button>
        );
      })}
    </div>
  );

  const modal = (
    <MealOutcomeModal
      meal={selectedMeal}
      glucose={glucose}
      insulin={insulin}
      targetLow={targetLow}
      targetHigh={targetHigh}
      onClose={() => setSelectedMeal(null)}
    />
  );

  if (bare) {
    return <>{content}{modal}</>;
  }
  return (
    <>
      <DaySection icon={Utensils} iconColor="#af751b" label="Meal Outcomes" collapsible>
        {content}
      </DaySection>
      {modal}
    </>
  );
}