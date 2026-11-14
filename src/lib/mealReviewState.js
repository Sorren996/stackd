import { base44 } from "@/api/base44Client";

/**
 * A meal's review state lives ON THE MEAL RECORD, not on the device.
 *
 * The review card writes it, the reminder worker reads it on the server while
 * deciding whether to send, and it survives a device change because it was
 * never in localStorage in the first place. Missing or null means the review is
 * still gathering, which is the behaviour every older record already has.
 */
export const LEGACY_RESOLVED_KEY = "resolved_meal_ids";

/** The two settled states. Reviewed and dismissed are never the same thing. */
export const REVIEWED = "reviewed";
export const DISMISSED = "dismissed";

const SETTLED = [REVIEWED, DISMISSED];

/** "reviewed", "dismissed", or null while the review is still gathering. */
export function mealReviewState(entry) {
  const state = entry?.review_state;
  return SETTLED.includes(state) ? state : null;
}

export function isMealReviewSettled(entry) {
  return mealReviewState(entry) !== null;
}

function readLegacyIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_RESOLVED_KEY) || "[]");
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

function writeLegacyIds(ids) {
  try {
    if (!ids.length) localStorage.removeItem(LEGACY_RESOLVED_KEY);
    else localStorage.setItem(LEGACY_RESOLVED_KEY, JSON.stringify(ids));
  } catch {
    /* Device storage is not the record. */
  }
}

/** Drops one meal from the pre-server list so it is never consulted again. */
export function forgetLegacyResolved(mealId) {
  const ids = readLegacyIds();
  if (!ids.length || !mealId) return;
  writeLegacyIds(ids.filter((id) => id !== String(mealId)));
}

/** Settles one meal's review on its own record. */
export async function settleMealReview(mealId, state) {
  if (!mealId || !SETTLED.includes(state)) return null;
  const updated = await base44.entities.CarbEntry.update(mealId, {
    review_state: state,
    reviewed_at: new Date().toISOString(),
  });
  forgetLegacyResolved(mealId);
  return updated;
}

/**
 * Records that this meal's review was opened — once. The record is read first
 * and an existing value is never overwritten, so the first opening stays the
 * one on file whatever device it happened on.
 */
export async function markMealReviewOpened(mealId) {
  if (!mealId) return null;
  try {
    const meal = await base44.entities.CarbEntry.get(mealId);
    if (!meal || meal.review_opened_at) return null;
    return await base44.entities.CarbEntry.update(mealId, {
      review_opened_at: new Date().toISOString(),
    });
  } catch {
    return null;
  }
}

/**
 * One-time move of the pre-server device list onto the meals themselves: each
 * stored id becomes "reviewed" on that meal if the meal has no state yet, then
 * the key is cleared. Returns how many meals were carried over.
 */
export async function migrateLegacyResolvedMeals() {
  const ids = readLegacyIds();
  if (!ids.length) return 0;
  let moved = 0;
  for (const id of ids) {
    try {
      const meal = await base44.entities.CarbEntry.get(id);
      if (meal && !isMealReviewSettled(meal)) {
        await base44.entities.CarbEntry.update(id, {
          review_state: REVIEWED,
          reviewed_at: new Date().toISOString(),
        });
        moved += 1;
      }
    } catch {
      /* Gone or unreachable: nothing to carry over. */
    }
  }
  writeLegacyIds([]);
  return moved;
}