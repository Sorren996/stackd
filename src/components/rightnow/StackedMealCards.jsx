import { useMemo, useState } from "react";
import MealReviewAtAGlance from "./MealReviewAtAGlance";

/**
 * Several meals are still being reviewed at once.
 *
 * They now share ONE measured timeline and one set of estimates: the meal rows
 * inside the review choose which meal's numbers the estimates describe, while
 * the glucose picture above stays the whole represented window. This replaces
 * the truncated chip carousel; the selection index is the same state the chips
 * used, and no per-meal value is combined with another.
 */
export default function StackedMealCards({
  meals,
  monitoringStatus,
  glucoseTrend,
  onResolve,
  glucoseReadings,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const sharedWindow = useMemo(() => {
    if (!Array.isArray(meals) || meals.length < 2) return null;
    const starts = meals.map((m) => m.mealTime ?? m.group?.mealTime).filter(Number.isFinite);
    if (!starts.length) return null;
    const ends = meals.map((m) => m.insight?.details?.reviewWindowEnd).filter(Number.isFinite);
    const from = Math.min(...starts);

    // The window's start anchor is the first meal's own measured glucose before
    // it was eaten — an existing value, plotted at the existing time. No new
    // reading is derived for the shared span.
    const earliest = meals.reduce((best, meal) => {
      const time = meal?.mealTime ?? meal?.group?.mealTime;
      if (!Number.isFinite(time)) return best;
      const bestTime = best ? best.mealTime ?? best.group?.mealTime : Infinity;
      return time < bestTime ? meal : best;
    }, null);
    const startValue = Number(earliest?.insight?.details?.glucoseValue);

    return {
      from,
      to: ends.length ? Math.max(...ends) : Date.now(),
      startValue: Number.isFinite(startValue) ? startValue : null,
    };
  }, [meals]);

  const sharedMeals = useMemo(() => {
    if (!Array.isArray(meals) || meals.length < 2) return null;
    const safe = Math.min(selectedIndex, meals.length - 1);
    return meals.map((meal, index) => {
      const details = meal?.insight?.details;
      return {
        key: (meal?.group && meal?.group?.mealTime) || `meal-${index}`,
        name: meal?.name || "Meal",
        mealTime: meal?.mealTime ?? details?.meal?.time,
        carbs: meal?.carbs ?? details?.mealGroup?.carbs ?? 0,
        reviewWindowEnd: details?.reviewWindowEnd ?? null,
        underReview: details?.mealStillUnderReview,
        selected: index === safe,
      };
    });
  }, [meals, selectedIndex]);

  if (!Array.isArray(meals) || meals.length < 2) return null;

  const safeIndex = Math.min(selectedIndex, meals.length - 1);
  const selectedMeal = meals[safeIndex];

  return (
    <MealReviewAtAGlance
      mealInsight={selectedMeal?.insight}
      monitoringStatus={monitoringStatus}
      glucoseTrend={glucoseTrend}
      onResolve={onResolve}
      glucoseReadings={glucoseReadings}
      sharedMeals={sharedMeals}
      sharedWindow={sharedWindow}
      onSelectMeal={(index) => setSelectedIndex(index)}
    />
  );
}