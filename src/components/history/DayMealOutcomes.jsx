import { format } from "date-fns";
import { Utensils } from "lucide-react";
import DaySection from "./DaySection";

function getMealLabel(time) {
  const hour = new Date(time).getHours();
  if (hour < 10) return "Breakfast";
  if (hour < 14) return "Lunch";
  if (hour < 17) return "Snack";
  if (hour < 21) return "Dinner";
  return "Evening";
}

export default function DayMealOutcomes({ meals }) {
  if (!meals?.length) return null;

  return (
    <DaySection icon={Utensils} iconColor="#f59e0b" label="Meal Outcomes" collapsible>
      <div className="space-y-2.5">
        {meals.map((meal) => {
          const riseColor = meal.rise > 60 ? "#d4a056" : meal.rise < 0 ? "#5ba88a" : "rgba(255,255,255,0.7)";
          const risePct = Math.min(100, Math.max(3, Math.abs(meal.rise) / 1.5));

          return (
            <div
              key={meal.id}
              className="rounded-xl border px-3.5 py-3"
              style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white/90">{getMealLabel(meal.time)}</p>
                  <p className="truncate text-[10px] text-white/40">{meal.name}</p>
                </div>
                <span className="shrink-0 text-[10px] text-white/35">{format(new Date(meal.time), "h:mm a")}</span>
              </div>

              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-white/45">
                <span>{Math.round(meal.carbs)}g carbs</span>
                {meal.insulinUnits != null && (
                  <>
                    <span className="text-white/20">·</span>
                    <span>{meal.insulinUnits}u support</span>
                  </>
                )}
                {meal.highProteinFat && (
                  <span className="text-purple-300/60">· higher protein/fat</span>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm font-bold text-white/80">{Math.round(meal.startingGlucose)}</span>
                <span className="text-white/30">→</span>
                <span className="text-sm font-bold" style={{ color: riseColor }}>
                  {Math.round(meal.peakGlucose)}
                </span>
                <span className="text-[10px] text-white/35">mg/dL</span>
                <span className="ml-auto text-sm font-bold" style={{ color: riseColor }}>
                  {meal.rise > 0 ? "+" : ""}
                  {Math.round(meal.rise)}
                </span>
              </div>

              <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${risePct}%`, background: riseColor, opacity: 0.5 }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </DaySection>
  );
}