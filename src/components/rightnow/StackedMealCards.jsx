import MealReviewAtAGlance from "./MealReviewAtAGlance";
import CollapsibleMealCard from "./CollapsibleMealCard";

// On-teal text colors — WCAG AA against the #4c6770 page background.
// The teal canvas needs its own light text colors; the muted-on-cream tokens
// (e.g. #746959) fail on teal (~1.1:1). These are distinct, audited colors.
const ON_TEAL_INK = "#f7f1e8"; // 5.47:1 — primary text on teal
const ON_TEAL_MUTED = "#e8dfd2"; // 4.65:1 — secondary text on teal
const ON_TEAL_SAGE = "#b7c4a1"; // 3.42:1 — decorative accent on teal (>=3:1 non-text)

/**
 * Stacked Meal Cards — one full Meal Review card per active meal, most
 * recent first. Used only when 2+ meals are still within their
 * glucose-response window.
 *
 * The most recent meal renders the full card (unchanged). Every other
 * still-active meal renders as a compact collapsed summary row that
 * expands in place to the full detail on tap, then collapses on a second tap.
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

  const [mostRecent, ...rest] = meals;

  return (
    <div className="space-y-4">
      {/* Banner — descriptive, never prescriptive. Sits directly on the teal
          page background, so text uses on-teal colors (not muted-on-cream). */}
      <div className="flex items-center gap-2 px-1">
        <span
          className="shrink-0 rounded-full"
          style={{ width: 8, height: 8, background: ON_TEAL_SAGE }}
        />
        <span className="text-[12px] font-semibold" style={{ color: ON_TEAL_INK }}>
          {meals.length} meals still in their response window
        </span>
        <span className="text-[12px]" style={{ color: ON_TEAL_MUTED }}>
          · most recent on top
        </span>
      </div>

      {/* Most recent meal — full card, unchanged */}
      <MealReviewAtAGlance
        key={(mostRecent.group && mostRecent.group.mealTime) || "m0"}
        mealInsight={mostRecent.insight}
        monitoringStatus={monitoringStatus}
        glucoseTrend={glucoseTrend}
        onResolve={onResolve}
        glucoseReadings={glucoseReadings}
      />

      {/* Other active meals — collapsed summaries, expand in place */}
      {rest.map((meal, i) => (
        <CollapsibleMealCard
          key={(meal.group && meal.group.mealTime) || `m${i + 1}`}
          meal={meal}
          monitoringStatus={monitoringStatus}
          glucoseTrend={glucoseTrend}
          onResolve={onResolve}
          glucoseReadings={glucoseReadings}
        />
      ))}
    </div>
  );
}