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

  const groupsWithWindows = carbGroups.map((group) => {
    const carbs = group.carbEvents.reduce((sum, event) => sum + event.carbs, 0);
    const carbTimeTotal = group.carbEvents.reduce((sum, event) => sum + event.time * event.carbs, 0);
    const mealTime = carbs > 0 ? carbTimeTotal / carbs : group.start;
    const pairingStart = group.start - preMealWindowMs;
    const pairingEnd = group.end + postMealWindowMs;
    return {
      ...group,
      mealTime,
      pairingStart,
      pairingEnd,
      carbs,
      carbEntries: group.carbEvents.map((event) => event.entry),
    };
  });

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
  const maxOutcomeWindowMs = resolveOutcomeWindowMinutes(insulinSettings) * MINUTE_MS;
  return groups
    .filter((g) => now - g.mealTime <= maxOutcomeWindowMs)
    .sort((a, b) => b.mealTime - a.mealTime); // most recent first
}