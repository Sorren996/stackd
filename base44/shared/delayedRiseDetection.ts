/**
 * Auto-detection of a "delayed rise" meal for backend use.
 * Mirrors src/lib/mealMonitoring.hasDelayedRise so the frontend and the
 * analysis pipeline classify meals identically.
 *
 * A meal qualifies when it meets ANY of these clinical thresholds
 * (ADA/ISPAD-backed guidance):
 *   - Fat >= 40 g (regardless of carbs)
 *   - Protein >= 30 g AND the meal contains carbs (carb grams > 0)
 *   - Protein >= 75 g with no carbs (protein eaten alone needs a higher bar)
 */
export function hasDelayedRise(meal: any): boolean {
  if (!meal) return false;
  const fat = Number(meal.fat_grams ?? meal.fat ?? 0);
  const protein = Number(meal.protein_grams ?? meal.protein ?? 0);
  const carbs = Number(meal.carbs ?? 0);
  if (!Number.isFinite(fat) || !Number.isFinite(protein) || !Number.isFinite(carbs)) return false;
  if (fat >= 40) return true;
  if (protein >= 30 && carbs > 0) return true;
  if (protein >= 75 && carbs === 0) return true;
  return false;
}