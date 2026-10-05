import MealReviewAtAGlance from "./MealReviewAtAGlance";

const INK = "#3f3830";
const TAUPE = "#746959";
const SAGE = "#5b6550";

/**
 * Stacked Meal Cards — one full Meal Review card per active meal, most
 * recent first. Used only when 2+ meals are still within their
 * glucose-response window. Each card is the existing single-meal review,
 * unchanged (same layout, hero glucose outcome, insight, and actions). A
 * small banner describes how many meals are in view.
 *
 * Copy rule: describes, never prescribes.
 */
export default function StackedMealCards({
  meals,
  monitoringStatus,
  glucoseTrend,
  onResolve,
  glucoseReadings,
}) {
  if (!Array.isArray(meals) || meals.length < 2) return null;

  return (
    <div className="space-y-4">
      {/* Banner — descriptive, never prescriptive */}
      <div
        className="flex items-center gap-2 rounded-full px-4 py-2"
        style={{ background: "rgba(91,101,80,0.12)" }}
      >
        <span
          className="shrink-0 rounded-full"
          style={{ width: 8, height: 8, background: SAGE }}
        />
        <span className="text-[12px] font-semibold" style={{ color: INK }}>
          {meals.length} meals still in their response window
        </span>
        <span className="text-[12px]" style={{ color: TAUPE }}>
          · most recent on top
        </span>
      </div>

      {meals.map((meal, i) => (
        <MealReviewAtAGlance
          key={(meal.group && meal.group.mealTime) || i}
          mealInsight={meal.insight}
          monitoringStatus={monitoringStatus}
          glucoseTrend={glucoseTrend}
          onResolve={onResolve}
          glucoseReadings={glucoseReadings}
        />
      ))}
    </div>
  );
}