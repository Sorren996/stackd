// One rule for how long a logged meal is still delivering carbohydrate.
//
// A large mixed meal keeps arriving well past the old flat window: a 111 g
// meal logged at 15:45 was being treated as finished about 1h45m later, which
// cut the forecast off mid-absorption. The window therefore scales with the
// SIZE of the meal — two hours of base absorption, plus about an hour for every
// 60 g above 60 g, capped at four and a half hours — and never shorter than the
// review window the person chose in Settings.
//
// The projection engine, the graph's meal shading and the "still in play" copy
// all read this same function, so they cannot disagree about whether a meal is
// over. (base44/shared/mealInPlayWindow.ts is the server-side twin; the two must
// stay identical.)

export const MEAL_IN_PLAY_BASE_MIN = 120;      // two hours of base absorption
export const MEAL_IN_PLAY_FREE_CARBS_G = 60;   // grams covered by the base window
export const MEAL_IN_PLAY_PER_60G_MIN = 60;    // +1 hour per 60 g above that
export const MEAL_IN_PLAY_MAX_MIN = 270;       // ~4.5 hours, the ceiling

export function mealInPlayWindowMinutes(carbs, configuredWindowMin) {
  const grams = Number(carbs);
  const above = Number.isFinite(grams) ? Math.max(0, grams - MEAL_IN_PLAY_FREE_CARBS_G) : 0;
  const scaled = MEAL_IN_PLAY_BASE_MIN + (above / 60) * MEAL_IN_PLAY_PER_60G_MIN;

  const configured = Number(configuredWindowMin);
  const floor = Number.isFinite(configured) && configured > 0 ? configured : MEAL_IN_PLAY_BASE_MIN;

  return Math.min(MEAL_IN_PLAY_MAX_MIN, Math.max(floor, scaled));
}