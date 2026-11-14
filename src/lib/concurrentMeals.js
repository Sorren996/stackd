// Concurrent-meal grouping for the stacked Meal Review cards.
//
// Meals are grouped exactly as the single-meal review groups them (carb
// entries within a 30-minute window, each bolus dose paired to the closest
// meal by mealTime). A meal is "active" while it is still inside its
// glucose-response window (meal_outcome_window_minutes, with the same
// 6-hour floor the single-meal review uses). When 2+ meals are active at
// once, the Meal Review renders one full card per meal, most recent first.
//
// Rescue carbs never form a meal group on their own — they are filtered out
// upstream in buildMealEventGroups.

import {
  isBasalInsulinType,
  INSULIN_PROFILES,
} from "./insulinPharmacology";
import { isRescueCarbEntry } from "./rescueCarbDetection";
import { mealInPlayWindowMinutes } from "./mealInPlayWindow";

const MINUTE_MS = 60 * 1000;
export const DEFAULT_PRE_MEAL_WINDOW_MINUTES = 45;
export const DEFAULT_POST_MEAL_WINDOW_MINUTES = 90;
export const DEFAULT_OUTCOME_WINDOW_MINUTES = 240;
const MEAL_GROUP_WINDOW_MS = 30 * MINUTE_MS;

// ── Time helpers (shared with ActiveInsulinBanner) ────────────────────────

export function getEntryTime(entry) {
  return new Date(entry.consumed_at || entry.recorded_at || entry.administered_at).getTime();
}

export function getDoseTime(dose) {
  return new Date(dose.administered_at).getTime();
}

// ── Insulin-type helpers ───────────────────────────────────────────────────

export function getDefaultMealInsulinTypes() {
  return Object.entries(INSULIN_PROFILES)
    .filter(([, profile]) => ["Rapid-Acting", "Short-Acting"].includes(profile.category))
    .map(([name]) => name);
}

export function isMealCoverageInsulin(dose, insulinSettings = {}) {
  const selectedTypes = insulinSettings.mealInsulinTypes || getDefaultMealInsulinTypes();
  return selectedTypes.includes(dose.insulin_type);
}

// ── Meal grouping (identical to the single-meal review) ────────────────────
// Carb entries (non-rescue) are clustered into meals by a 30-minute window.
// Each bolus dose is paired to exactly one meal — the one whose mealTime is
// closest among groups whose pairing window contains the dose. This prevents
// a dose from one meal being pooled into a nearby meal's insulin total.

// ── Carb-only clustering (the one definition of "one meal") ───────────────
// A meal is a chain of carb entries whose consecutive gaps are 30 minutes or
// less. Rescue carbs are excluded: they are a treatment, never part of a meal.
// The review cards, the chart's tap-to-edit selection and the item editor all
// read this, so they can never disagree about what one meal is.
export function clusterCarbGroups(carbEntries, glucoseReadings = [], doses = [], targetLow = 70) {
  const carbEvents = (Array.isArray(carbEntries) ? carbEntries : [])
    .filter((entry) => {
      if (entry.is_rescue_carb === true || entry.classification === "rescue_carbs") return false;
      if (entry.classification === "meal" || entry.classification === "snack") return true;
      return !isRescueCarbEntry(entry, glucoseReadings, doses, targetLow);
    })
    .map((entry) => ({
      type: "carb",
      time: getEntryTime(entry),
      carbs: Number(entry.carbs),
      entry,
    }))
    .filter(
      (event) => Number.isFinite(event.time) && Number.isFinite(event.carbs) && event.carbs > 0
    );

  const carbGroups = [];
  carbEvents
    .sort((a, b) => a.time - b.time)
    .forEach((event) => {
      const lastGroup = carbGroups[carbGroups.length - 1];
      if (!lastGroup || event.time - lastGroup.end > MEAL_GROUP_WINDOW_MS) {
        carbGroups.push({ start: event.time, end: event.time, carbEvents: [event] });
        return;
      }
      lastGroup.end = event.time;
      lastGroup.carbEvents.push(event);
    });

  return carbGroups.map((group) => {
    const carbs = group.carbEvents.reduce((sum, event) => sum + event.carbs, 0);
    const carbTimeTotal = group.carbEvents.reduce((sum, event) => sum + event.time * event.carbs, 0);
    const mealTime = carbs > 0 ? carbTimeTotal / carbs : group.start;
    return {
      ...group,
      mealTime,
      carbs,
      carbLogStart: group.start,
      carbLogEnd: group.end,
      carbEntries: group.carbEvents.map((event) => event.entry),
    };
  });
}

// The one cluster whose logged carbohydrate span contains this moment. Clusters
// never overlap, so the only tie is an exact boundary instant, where the
// nearest mealTime wins. Never a symmetric window around the tap.
export function findMealGroupAtTime(groups, timeMs) {
  if (!Number.isFinite(timeMs)) return null;
  const hits = (Array.isArray(groups) ? groups : []).filter(
    (group) =>
      Number.isFinite(group?.carbLogStart) &&
      Number.isFinite(group?.carbLogEnd) &&
      timeMs >= group.carbLogStart &&
      timeMs <= group.carbLogEnd
  );
  if (!hits.length) return null;
  return hits.reduce((best, group) =>
    Math.abs(group.mealTime - timeMs) < Math.abs(best.mealTime - timeMs) ? group : best
  );
}

export function buildMealEventGroups(
  carbEntries,
  doses,
  insulinSettings = {},
  glucoseReadings = [],
  targetLow = 70
) {
// The pairing window is part of the same absorption window: a bolus can belong
// to this meal only while that meal's carbohydrate is landing, so both sides of
// pairing are bounded by meal_outcome_window_minutes. Lowering that setting now
// shortens pairing, instead of leaving it on two fixed values that ignored it.
  const outcomeWindowMs = resolveOutcomeWindowMinutes(insulinSettings) * MINUTE_MS;
  const preMealWindowMs = Math.min(
    (insulinSettings.preMealWindowMinutes ?? DEFAULT_PRE_MEAL_WINDOW_MINUTES) * MINUTE_MS,
    outcomeWindowMs
  );
  const postMealWindowMs = Math.min(
    (insulinSettings.postMealWindowMinutes ?? DEFAULT_POST_MEAL_WINDOW_MINUTES) * MINUTE_MS,
    outcomeWindowMs
  );

  const doseEvents = (Array.isArray(doses) ? doses : [])
    .filter(
      (dose) =>
        isMealCoverageInsulin(dose, insulinSettings) && !isBasalInsulinType(dose.insulin_type)
    )
    .map((dose) => ({
      type: "dose",
      time: getDoseTime(dose),
      units: Number(dose.units),
      dose,
    }))
    .filter(
      (event) => Number.isFinite(event.time) && Number.isFinite(event.units) && event.units > 0
    );

  // The same clusters the review cards, the chart's tap selection and the item
  // editor all use; only the dose-pairing window is added here.
  const groupsWithWindows = clusterCarbGroups(carbEntries, glucoseReadings, doses, targetLow).map(
    (group) => ({
      ...group,
      pairingStart: group.start - preMealWindowMs,
      pairingEnd: group.end + postMealWindowMs,
    })
  );

  const groupDoses = groupsWithWindows.map(() => []);
  doseEvents.forEach((doseEvent) => {
    let bestIndex = -1;
    let bestDist = Infinity;
    groupsWithWindows.forEach((group, index) => {
      if (doseEvent.time >= group.pairingStart && doseEvent.time <= group.pairingEnd) {
        const dist = Math.abs(doseEvent.time - group.mealTime);
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = index;
        }
      }
    });
    if (bestIndex >= 0) groupDoses[bestIndex].push(doseEvent.dose);
  });

  return groupsWithWindows.map((group, index) => ({
    ...group,
    start: group.pairingStart,
    end: group.pairingEnd,
    carbLogStart: group.start,
    carbLogEnd: group.end,
    doses: groupDoses[index],
  }));
}

// ── One absorption window ─────────────────────────────────────────────────
// meal_outcome_window_minutes is the single value that decides when a meal is
// over: the review, the analysis and the projection all read it, and a value
// below the old 6-hour floor is honoured rather than silently raised.
export function resolveOutcomeWindowMinutes(insulinSettings = {}) {
  const requested = Number(insulinSettings.outcomeWindowMinutes);
  if (Number.isFinite(requested) && requested > 0) return Math.max(30, requested);
  return DEFAULT_OUTCOME_WINDOW_MINUTES;
}

// ── Active-meal detection ──────────────────────────────────────────────────
// Returns every meal group still inside its glucose-response window, most
// recent first — the same window the single-meal review and the projection use.
export function getActiveMealGroups(groups, insulinSettings, now = Date.now()) {
  const configured = resolveOutcomeWindowMinutes(insulinSettings);
  return groups
    // Each meal keeps its own size-scaled window, so a large meal stays in play
    // for its full absorption tail — the same rule the projection reads.
    .filter((g) => now - g.mealTime <= mealInPlayWindowMinutes(g.carbs, configured) * MINUTE_MS)
    .sort((a, b) => b.mealTime - a.mealTime); // most recent first
}