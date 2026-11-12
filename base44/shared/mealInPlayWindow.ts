// One rule for how long a logged meal is still delivering carbohydrate.
// Server-side twin of src/lib/mealInPlayWindow.js — the two must stay identical
// so the forecast, the analysis and the screens agree.
//
// A large mixed meal keeps arriving well past a flat window: a 111 g meal was
// being treated as finished about 1h45m later, which cut the forecast off
// mid-absorption. The window therefore scales with the SIZE of the meal — two
// hours of base absorption, plus about an hour for every 60 g above 60 g,
// capped at four and a half hours — and is never shorter than the review window
// the person chose in Settings.

export const MEAL_IN_PLAY_BASE_MIN = 120;
export const MEAL_IN_PLAY_FREE_CARBS_G = 60;
export const MEAL_IN_PLAY_PER_60G_MIN = 60;
export const MEAL_IN_PLAY_MAX_MIN = 270;

export function mealInPlayWindowMinutes(carbs: unknown, configuredWindowMin: unknown): number {
  const grams = Number(carbs);
  const above = Number.isFinite(grams) ? Math.max(0, grams - MEAL_IN_PLAY_FREE_CARBS_G) : 0;
  const scaled = MEAL_IN_PLAY_BASE_MIN + (above / 60) * MEAL_IN_PLAY_PER_60G_MIN;

  const configured = Number(configuredWindowMin);
  const floor = Number.isFinite(configured) && configured > 0 ? configured : MEAL_IN_PLAY_BASE_MIN;

  return Math.min(MEAL_IN_PLAY_MAX_MIN, Math.max(floor, scaled));
}