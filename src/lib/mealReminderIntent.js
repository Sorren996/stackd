// The meal review reminder a person asked for, remembered from the moment they
// tapped it.
//
// The tap happens inside a form, before the meal record exists. Holding it only
// in component state meant a save that ran while the Meal review settings row
// was still loading could drop it silently, leaving reminder_at null. The tap is
// therefore kept here too, and applied to the meal as soon as it is created,
// using the saved meal's own time plus the delay that was shown on the row.

import { base44 } from "@/api/base44Client";

let pendingDelayMinutes = null;

export function armMealReminder(delayMinutes) {
  const delay = Number(delayMinutes);
  pendingDelayMinutes = Number.isFinite(delay) && delay > 0 ? delay : 120;
}

export function clearMealReminder() {
  pendingDelayMinutes = null;
}

export function takeMealReminder() {
  const delay = pendingDelayMinutes;
  pendingDelayMinutes = null;
  return delay;
}

/**
 * Applies an armed reminder to the meals a create just saved. A meal that
 * already carries its reminder, or one that is a rescue carb, is left exactly
 * as saved.
 */
export async function applyMealReminderToSaved(saved) {
  const delay = takeMealReminder();
  const entries = Array.isArray(saved) ? saved : [];
  if (!delay || !entries.length) return saved;

  return await Promise.all(
    entries.map(async (entry) => {
      if (!entry?.id || entry.reminder_at || entry.is_rescue_carb) return entry;
      const mealAtMs = Date.parse(String(entry.consumed_at ?? ""));
      if (!Number.isFinite(mealAtMs)) return entry;
      const patch = {
        reminder_at: new Date(mealAtMs + delay * 60000).toISOString(),
        reminder_state: "scheduled",
      };
      const updated = await base44.entities.CarbEntry.update(entry.id, patch);
      return { ...entry, ...(updated || patch) };
    })
  );
}