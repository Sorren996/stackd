// One rule for how long a logged meal is still delivering carbohydrate.
// Server-side twin of src/lib/mealInPlayWindow.js — the two must stay identical
// so the forecast, the analysis and the screens agree.
//
// A large mixed meal keeps arriving well past a flat window, and a modest one
// was finishing too early: a 60 g hamburger eaten at 12:39 PM was treated as
// over at 2:39 PM. The window therefore scales with the SIZE of the meal —
// three hours of base absorption, plus an hour for every 60 g above 60 g,
// capped at four and a half hours. A 60 g meal stays in play about three hours,
// a 111 g meal about four.
//
// This window decides ABSORPTION — the forecast tail, the graph's shading and
// the "still in play" wording. It does not decide whether a meal is reviewed:
// Meal Review shows the most recent meal of the day whether or not it is still
// absorbing.

export const MEAL_IN_PLAY_BASE_MIN = 180;
export const MEAL_IN_PLAY_FREE_CARBS_G = 60;
export const MEAL_IN_PLAY_PER_60G_MIN = 60;
export const MEAL_IN_PLAY_MAX_MIN = 270;

// The second parameter is kept so every call site keeps passing the person's
// review-window setting, but it no longer stretches absorption: review display
// is decoupled from this window (see above), so the size-scaled rule alone
// decides when a meal is out of play.
export function mealInPlayWindowMinutes(carbs: unknown, _configuredWindowMin?: unknown): number {
  const grams = Number(carbs);
  const above = Number.isFinite(grams) ? Math.max(0, grams - MEAL_IN_PLAY_FREE_CARBS_G) : 0;
  const scaled = MEAL_IN_PLAY_BASE_MIN + (above / 60) * MEAL_IN_PLAY_PER_60G_MIN;

  return Math.min(MEAL_IN_PLAY_MAX_MIN, scaled);
}