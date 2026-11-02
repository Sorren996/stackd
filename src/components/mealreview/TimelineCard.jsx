import MealReviewCard from "./MealReviewCard";
import MealWindowChart from "./MealWindowChart";
import MealRow from "./MealRow";
import { MR, SERIF, SERIF_ITALIC, splitItalic } from "./mealReviewTheme";

/**
 * Card 1 — the shared measured picture for the meals being reviewed.
 *
 * One glucose timeline for the whole represented window, the window's own
 * statistics underneath (only when they describe that same window), then every
 * included meal as a readable row. With more than one meal the rows are the
 * switcher: picking one moves the estimates below to that meal without losing
 * the shared context above.
 */

function Heading({ text, accent }) {
  const { before, phrase, after } = splitItalic(text, accent);
  return (
    <h3 style={{ ...SERIF, fontSize: 17, lineHeight: 1.3, color: MR.ink }}>
      {before}
      {phrase ? <em style={SERIF_ITALIC}>{phrase}</em> : null}
      {after}
    </h3>
  );
}

export default function TimelineCard({
  title,
  titleAccent,
  chartProps,
  statSentence,
  meals = [],
  onSelectMeal,
  sharedNote,
}) {
  return (
    <MealReviewCard>
      <div className="px-5 pt-5">
        <Heading text={title} accent={titleAccent} />
      </div>

      <div className="pt-2">
        <MealWindowChart {...chartProps} />
      </div>

      {statSentence && (
        <p className="px-5 pt-1.5" style={{ fontSize: 12.5, lineHeight: 1.65, color: MR.sec }}>
          {statSentence}
        </p>
      )}

      {meals.length > 0 && (
        <div className="mt-3">
          {meals.map((meal, index) => (
            <div
              key={meal.key || `meal-${index}`}
              className={index > 0 ? "border-t" : ""}
              style={index > 0 ? { borderColor: MR.hairline } : undefined}
            >
              <MealRow
                name={meal.name}
                time={meal.time}
                carbs={meal.carbs}
                selected={meal.selected}
                onSelect={onSelectMeal ? () => onSelectMeal(meal.index) : null}
              />
            </div>
          ))}
        </div>
      )}

      {sharedNote && (
        <p className="px-5 pt-2.5 pb-5" style={{ fontSize: 11.5, lineHeight: 1.6, color: MR.sec }}>
          {sharedNote}
        </p>
      )}

      {!sharedNote && <div style={{ height: 18 }} />}
    </MealReviewCard>
  );
}