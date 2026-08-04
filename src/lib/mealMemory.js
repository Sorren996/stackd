import { base44 } from "@/api/base44Client";

// Frontend bridge to the Meal Memory backend functions. Keeps CarbsTab and the
// modal decoupled from the SDK invoke shape.

export async function findMealMemory({ mealName, carbs, highProteinFat, mealTime }) {
  try {
    const res = await base44.functions.invoke("findMealMemory", {
      mealName,
      carbs,
      highProteinFat,
      mealTime,
    });
    return res?.data || res;
  } catch {
    return { found: false };
  }
}

export async function submitMatchFeedback({ match, currentMeal, feedbackType }) {
  try {
    const historicalFingerprint = match?.analysis?.meal_fingerprint || null;
    const historicalName = match?.analysis?.meal_name_normalized || match?.analysis?.meal_name_original || "";
    const currentName = currentMeal?.normalized_name || currentMeal?.mealName || "";
    await base44.entities.MealMatchFeedback.create({
      current_meal_name: currentName,
      current_meal_fingerprint: currentMeal?.fingerprint || null,
      historical_meal_name: historicalName,
      historical_meal_fingerprint: historicalFingerprint,
      historical_analysis_id: match?.analysis?.id || null,
      feedback_type: feedbackType,
    });
  } catch {
    // Feedback is best-effort; never block logging on it.
  }
}

const CONFOUNDING_LABELS = {
  overlapping_meal: "Another meal or snack during the window",
  rescue_carbs: "Rescue carbohydrates used",
  multiple_corrections: "Multiple correction doses",
  missing_glucose_data: "Some glucose data missing",
  active_insulin_at_start: "Active insulin already present",
  already_rising: "Glucose was already rising",
  already_falling: "Glucose was already falling",
  high_protein_fat: "High protein or fat meal",
};

export function confoundingLabels(events = []) {
  return (events || []).map((e) => CONFOUNDING_LABELS[e] || e).filter(Boolean);
}

export const OUTCOME_LABELS = {
  well_supported: "Appeared well supported",
  may_need_more: "May have needed more support",
  may_have_more_than_needed: "May have had more support than needed",
  mixed_or_delayed: "Mixed or delayed response",
  unclear: "Outcome unclear",
};