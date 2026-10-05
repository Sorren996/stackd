// Concurrent-meal grouping, IOB math, and chart-curve building for the
// multi-meal "Stack" Meal Review.
//
// Meals are grouped exactly as the single-meal review groups them (carb
// entries within a 30-minute window, each bolus dose paired to the closest
// meal by mealTime). A stack exists when 2+ meals under review share
// overlapping bolus IOB windows — i.e. an earlier meal's bolus IOB was still
// above the 0.49u floor when a later meal was logged.
//
// All insulin math delegates to the existing pharmacology engine
// (insulinPharmacology / iobModel) so per-meal IOB, clear times, and the
// total envelope reconcile exactly with the rest of the app.

import {
  getDoseIOB,
  isBolusInsulinType,
  isBasalInsulinType,
  INSULIN_PROFILES,
  getDoseTimingInfo,
  generateActivityCurve,
} from "./insulinPharmacology";
import { IOB_FLOOR } from "./iobModel";
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
  const preMealWindowMs =
    (insulinSettings.preMealWindowMinutes ?? DEFAULT_PRE_MEAL_WINDOW_MINUTES) * MINUTE_MS;
  const postMealWindowMs =
    (insulinSettings.postMealWindowMinutes ?? DEFAULT_POST_MEAL_WINDOW_MINUTES) * MINUTE_MS;

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

// ── Per-meal IOB math ─────────────────────────────────────────────────────

// Remaining bolus IOB from a single meal's paired doses at a given time.
export function computePerMealIOBAt(group, atTime) {
  return (group.doses || []).reduce((sum, dose) => {
    if (!isBolusInsulinType(dose.insulin_type)) return sum;
    return sum + getDoseIOB(dose, atTime);
  }, 0);
}

// When this meal's last active bolus dose clears the IOB floor. Returns null
// if no paired dose is currently active.
export function computeMealClearTime(group, now = Date.now()) {
  let clearTime = now;
  let anyActive = false;
  for (const dose of group.doses || []) {
    if (!isBolusInsulinType(dose.insulin_type)) continue;
    const iob = getDoseIOB(dose, now);
    if (iob > IOB_FLOOR) {
      anyActive = true;
      const timing = getDoseTimingInfo(dose, now);
      const doseClear = now + timing.remainingMin * MINUTE_MS;
      if (doseClear > clearTime) clearTime = doseClear;
    }
  }
  return anyActive ? clearTime : null;
}

// ── Concurrency detection ─────────────────────────────────────────────────
// A stack exists when 2+ meals under review share overlapping bolus IOB
// windows. We walk backward from the most recent meal, chaining earlier
// meals whose bolus IOB was still above the floor when the next meal in the
// chain was logged. The result is the cluster of meals transitively
// overlapping the most recent meal, sorted ascending by mealTime.

export function detectConcurrentStack(groups, insulinSettings, now = Date.now()) {
  const maxOutcomeWindowMs =
    Math.max(insulinSettings.outcomeWindowMinutes || DEFAULT_OUTCOME_WINDOW_MINUTES, 360) *
    MINUTE_MS;

  // Meals still under review with at least one paired bolus dose.
  const underReview = groups
    .filter((g) => now - g.mealTime <= maxOutcomeWindowMs && (g.doses || []).some((d) => isBolusInsulinType(d.insulin_type)))
    .sort((a, b) => a.mealTime - b.mealTime);

  if (underReview.length < 2) return null;

  const recent = underReview[underReview.length - 1];
  const stackGroups = [recent];
  for (let i = underReview.length - 2; i >= 0; i--) {
    const later = stackGroups[0];
    const earlier = underReview[i];
    const earlierIOB = computePerMealIOBAt(earlier, later.mealTime);
    if (earlierIOB > IOB_FLOOR) {
      stackGroups.unshift(earlier);
    } else {
      break;
    }
  }

  if (stackGroups.length < 2) return null;
  return stackGroups;
}

// ── Overlap context ───────────────────────────────────────────────────────
// For the active meal, find the earlier meal whose IOB was most active when
// the active meal's dose started. Powers the "What happened" overlap insight.

export function computeOverlapContext(stackGroups, activeIndex) {
  if (activeIndex <= 0) return null;
  const active = stackGroups[activeIndex];
  let best = null;
  for (let i = activeIndex - 1; i >= 0; i--) {
    const earlier = stackGroups[i];
    const iob = computePerMealIOBAt(earlier, active.mealTime);
    if (iob > IOB_FLOOR && (!best || iob > best.earlierIOB)) {
      best = { earlier, earlierIOB: iob };
    }
  }
  if (!best) return null;
  return {
    earlierMealName: best.earlier.carbEntries[0]?.food_name || best.earlier.carbEntries[0]?.name || "an earlier meal",
    earlierMealTime: best.earlier.mealTime,
    activeMealTime: active.mealTime,
    earlierIOB: best.earlierIOB,
  };
}

// ── Chart curves ──────────────────────────────────────────────────────────
// All meals' bolus doses on one shared zero-based axis. Each meal's curve is
// the pointwise sum of its paired doses' IOB. The total envelope is the
// pointwise sum of all meals' curves. The 0.49u floor rule is honored inside
// getDoseIOB, so a dose clips to 0 and drops out of totals once its remaining
// IOB hits the floor.

export function buildStackChartCurves(stackGroups, now = Date.now()) {
  const allDoses = [];
  stackGroups.forEach((group) => {
    (group.doses || []).forEach((dose) => {
      if (isBolusInsulinType(dose.insulin_type)) allDoses.push(dose);
    });
  });
  if (!allDoses.length) return null;

  let windowStart = Infinity;
  let windowEnd = -Infinity;
  allDoses.forEach((dose) => {
    const curve = generateActivityCurve(dose, 5);
    if (curve.length) {
      windowStart = Math.min(windowStart, curve[0].time);
      windowEnd = Math.max(windowEnd, curve[curve.length - 1].time);
    }
  });
  if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return null;

  // Pad and ensure "now" is visible with breathing room.
  windowStart = Math.min(windowStart - 15 * MINUTE_MS, now - 30 * MINUTE_MS);
  windowEnd = Math.max(windowEnd + 15 * MINUTE_MS, now + 30 * MINUTE_MS);

  const step = 5 * MINUTE_MS;
  const sampleTimes = [];
  for (let t = windowStart; t <= windowEnd; t += step) sampleTimes.push(t);

  const mealCurves = stackGroups.map((group) =>
    sampleTimes.map((t) => ({ time: t, iob: computePerMealIOBAt(group, t) }))
  );

  const totalCurve = sampleTimes.map((t, i) => ({
    time: t,
    iob: mealCurves.reduce((sum, mc) => sum + mc[i].iob, 0),
  }));

  return { windowStart, windowEnd, sampleTimes, mealCurves, totalCurve };
}