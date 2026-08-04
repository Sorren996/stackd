// Builds the conversational, retrospective summary text shown in the Meal Memory
// modal. Deterministic and credit-free — the spec's examples are templated, so we
// compose them from the matched MealResponseAnalysis. Language stays wellness-oriented
// and never prescribes a dose.

import { format } from "date-fns";

function formatUnits(units) {
  if (!Number.isFinite(units) || units <= 0) return "0u";
  return units % 1 === 0 ? `${units}u` : `${units.toFixed(1)}u`;
}

function formatGlucose(value) {
  if (!Number.isFinite(value)) return null;
  return Math.round(value);
}

function trendLabel(trend) {
  if (trend === "rising") return "rising";
  if (trend === "falling") return "falling";
  if (trend === "steady") return "steady";
  return "at a steady point";
}

function relativeTime(mealTime) {
  if (!mealTime) return "Last time";
  const now = Date.now();
  const then = new Date(mealTime).getTime();
  const days = Math.floor((now - then) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "Earlier today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.round(days / 7)} week${days < 14 ? "" : "s"} ago`;
  return `On ${format(new Date(mealTime), "MMM d")}`;
}

function carbDiffLine(currentCarbs, historicalCarbs) {
  const a = Math.round(currentCarbs);
  const b = Math.round(historicalCarbs);
  if (a === b) return null;
  const diff = Math.abs(a - b);
  if (b < a) return `that entry was ${b}g of carbs compared with today's ${a}g`;
  return `that entry was ${b}g of carbs compared with today's ${a}g`;
}

function outcomeLine(analysis) {
  const start = formatGlucose(analysis.starting_glucose);
  const peak = formatGlucose(analysis.peak_glucose);
  const low = formatGlucose(analysis.lowest_glucose);
  const end = formatGlucose(analysis.glucose_at_4_hours);
  const classification = analysis.outcome_classification;

  switch (classification) {
    case "well_supported":
      if (end != null && start != null && Math.abs(end - start) <= 25) {
        return `Glucose peaked at ${peak} and was back near ${end} about four hours later. That amount appeared to cover the meal reasonably well.`;
      }
      return `Glucose peaked at ${peak} and settled to ${end} about four hours later. That amount appeared to cover the meal reasonably well.`;

    case "may_need_more":
      return `Glucose was still ${end} mg/dL four hours after the meal, so the meal may have needed additional support that day.`;

    case "may_have_more_than_needed":
      if (analysis.rescue_carbs > 0) {
        return `Glucose later fell to ${low}, and you logged ${Math.round(analysis.rescue_carbs)}g of rescue carbs. The total support may have been more than the meal required that day.`;
      }
      return `Glucose later fell to ${low}. The total support may have been more than the meal required that day.`;

    case "mixed_or_delayed":
      if (analysis.high_protein_fat) {
        return `Glucose stayed fairly steady early but rose later. This may have been a delayed response from the meal's fat and protein.`;
      }
      return `Glucose rose to ${peak} and later fell to ${low}, so the response was mixed and a little harder to read.`;

    default:
      return `Several factors affected this response, so the result is difficult to interpret.`;
  }
}

function insulinLine(analysis) {
  const initial = analysis.initial_insulin_units || 0;
  const initialType = analysis.initial_insulin_type;
  const additional = analysis.additional_insulin_units || 0;
  const details = Array.isArray(analysis.additional_insulin_details) ? analysis.additional_insulin_details : [];

  if (initial <= 0 && additional <= 0) return "you did not log insulin with that meal";

  const startLabel = startTrendIntro(analysis);
  const initialText = initial > 0
    ? `you supported it with ${formatUnits(initial)} of ${initialType || "insulin"}`
    : "you did not log insulin with that meal";

  let extra = "";
  if (additional > 0 && details.length) {
    const first = details[0];
    const delayMin = first?.minutes_after_meal != null
      ? Math.round(first.minutes_after_meal)
      : null;
    const delayLabel = delayMin != null
      ? (delayMin >= 60 ? `about ${Math.round(delayMin / 60)} hour${Math.round(delayMin / 60) === 1 ? "" : "s"} later` : `${delayMin} minutes later`)
      : "later";
    extra = `, followed by ${formatUnits(additional)} ${delayLabel}`;
  }

  return `${startLabel} ${initialText}${extra}`;
}

function startTrendIntro(analysis) {
  const start = formatGlucose(analysis.starting_glucose);
  const trend = analysis.starting_trend;
  if (start == null) return "At that meal,";
  const trendWord = trendLabel(trend);
  if (trend === "steady" || trend === "unknown") return `while glucose was ${start} and ${trendWord}`;
  return `while glucose was ${start} and ${trendWord}`;
}

function confoundingLine(analysis) {
  const events = Array.isArray(analysis.confounding_events) ? analysis.confounding_events : [];
  if (!events.length) return null;
  if (analysis.overlapping_meal && events.includes("overlapping_meal")) {
    return "You also logged a snack during that window, so it is difficult to separate the meal's effect from the additional food and insulin.";
  }
  if (events.includes("rescue_carbs")) {
    return "Rescue carbohydrates were used during that window, which makes the response harder to interpret.";
  }
  if (events.includes("missing_glucose_data")) {
    return "Some glucose data was missing during that window, so the picture is incomplete.";
  }
  return "Other activity during that window makes this comparison limited.";
}

function contextReminder(analysis, currentCarbs) {
  const reminders = [];
  if (analysis.starting_trend === "rising") {
    reminders.push("You were already rising during the previous meal.");
  }
  if ((analysis.active_insulin_at_start || 0) > 0.5) {
    reminders.push("You had active insulin before the previous meal.");
  }
  if (currentCarbs && analysis.carbs_logged && Math.abs(currentCarbs - analysis.carbs_logged) > 10) {
    reminders.push("The previous entry contained a different amount of carbohydrates.");
  }
  if (analysis.high_protein_fat) {
    reminders.push("Fat and protein can delay how this kind of meal affects you.");
  }
  reminders.push("Use this as a past pattern, not a prediction.");
  // pick the first relevant one, fall back to the generic closing
  return reminders[0];
}

export function buildMealMemorySummary(currentMeal, match) {
  const analysis = match.analysis;
  const when = relativeTime(analysis.meal_time);
  const name = analysis.meal_name_original || "a similar meal";
  const carbs = Math.round(analysis.carbs_logged);
  const start = formatGlucose(analysis.starting_glucose);

  const parts = [];

  // opening: "Last time you logged chicken Alfredo at about 62g of carbs, ..."
  parts.push(`${when} you logged ${name} at about ${carbs}g of carbs, ${insulinLine(analysis)}.`);

  // outcome line
  parts.push(outcomeLine(analysis));

  // carb difference note
  if (currentMeal?.carbs && Math.abs(currentMeal.carbs - analysis.carbs_logged) > 10) {
    const diff = carbDiffLine(currentMeal.carbs, analysis.carbs_logged);
    if (diff) parts.push(`${diff.charAt(0).toUpperCase() + diff.slice(1)}. Keep the carbohydrate difference in mind when reviewing this result.`);
  }

  // confounding note
  const confounding = confoundingLine(analysis);
  if (confounding) parts.push(confounding);

  // confidence note for low confidence
  let lowConfidence = (analysis.confidence_score || 0) < 0.5;
  if (lowConfidence) {
    parts.push("This is the closest similar meal in your history, but the comparison is limited.");
  }

  const body = parts.join(" ");
  const reminder = contextReminder(analysis, currentMeal?.carbs);

  return { body, reminder };
}

export function buildAggregateSummary(matchCount, matches) {
  if (matchCount < 3) return null;
  const withCorrection = matches.filter((m) => (m.analysis.additional_insulin_units || 0) > 0).length;
  const peaks = matches
    .map((m) => (m.analysis.peak_time ? new Date(m.analysis.peak_time).getTime() - new Date(m.analysis.meal_time).getTime() : null))
    .filter((t) => Number.isFinite(t));
  let peakHint = null;
  if (peaks.length) {
    const avgMin = Math.round(peaks.reduce((s, t) => s + t, 0) / peaks.length / 60000);
    if (avgMin >= 60) peakHint = `about ${Math.round(avgMin / 60)} hour${Math.round(avgMin / 60) === 1 ? "" : "s"} later`;
    else peakHint = `about ${avgMin} minutes later`;
  }

  const lines = [`You have logged meals similar to this ${matchCount} times.`];
  if (peakHint) lines.push(`Glucose was usually highest ${peakHint}.`);
  if (withCorrection > 0) lines.push(`Additional insulin was logged in ${withCorrection} of those meals.`);
  return lines.join(" ");
}