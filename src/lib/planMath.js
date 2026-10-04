// Shared "plan math" — how the user's own I:C setting translates carbs to
// units. Descriptive only. Uses the same rounding as Meal Review
// (grams-per-unit rounded to 1 decimal) so both places show identical numbers.
export function readMealUnitsPer5g() {
  const v = Number(localStorage.getItem("meal_insulin_units_per_5g"));
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function getPlanMath(carbs, mealUnitsPer5g = readMealUnitsPer5g()) {
  const grams = Number(carbs);
  if (!mealUnitsPer5g || !Number.isFinite(grams) || grams <= 0) return null;
  const gramsPerUnit = Math.round((5 / mealUnitsPer5g) * 10) / 10;
  return { carbs: Math.round(grams), gramsPerUnit, units: grams / gramsPerUnit };
}