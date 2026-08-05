import { computeGlucoseTrend } from "@/lib/glucoseTrend";
import {
  getTotalBolusIOB,
  getTotalBasalActivity,
} from "@/lib/insulinPharmacology";

const MINUTE_MS = 60 * 1000;

// A carb entry is treated as a "rescue" (proactive low prevention) when, at
// the moment it was consumed, glucose was trending downward AND there was
// meaningful insulin activity in the background that could be driving the
// descent — even if glucose hasn't crossed below the target low yet.
//
// This lets the app acknowledge supportive nourishment without forcing the
// user to categorize it, and keeps these entries from being judged as
// "under-dosed meals" in the Meal Balance rhythm.
export function isRescueCarbEntry(entry, glucoseReadings = [], doses = [], targetLow = 70) {
  if (!entry?.consumed_at) return false;

  const entryTime = new Date(entry.consumed_at).getTime();
  if (!Number.isFinite(entryTime)) return false;

  // Rescue carbs are small, quick-sugar amounts (typically ≤15g) taken to lift
  // a dipping trend. A substantial carb entry is a meal or snack — never rescue
  // carbs — even if insulin was dosed first and glucose is trending down.
  const carbs = Number(entry.carbs);
  if (Number.isFinite(carbs) && carbs >= 25) return false;

  const readingsBefore = (Array.isArray(glucoseReadings) ? glucoseReadings : [])
    .map((r) => ({ t: new Date(r.recorded_at).getTime(), v: Number(r.value) }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t <= entryTime)
    .sort((a, b) => a.t - b.t);

  if (readingsBefore.length < 2) return false;

  const trend = computeGlucoseTrend(
    readingsBefore
      .slice(-6)
      .map((p) => ({ recorded_at: new Date(p.t).toISOString(), value: p.v }))
  );

  const isTrendingDown = trend.icon === "down" || trend.icon === "down-right";

  const bolusIOB = getTotalBolusIOB(doses, entryTime);
  const basalActive = getTotalBasalActivity(doses, entryTime);
  const hasInsulinActivity = bolusIOB > 0.5 || basalActive > 0.1;

  const closestReading = readingsBefore[readingsBefore.length - 1];
  const glucoseNearLow = closestReading && closestReading.v <= targetLow + 20;

  return hasInsulinActivity && (isTrendingDown || glucoseNearLow);
}