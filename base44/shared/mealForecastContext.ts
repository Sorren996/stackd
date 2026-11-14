import { carbShapeFor } from './glucoseSuperposition.ts';
export const MEAL_FORECAST_VERSION = '1.0.0-contextual-meal';
export function mealContextKey(meal, timezone = 'UTC') {
  const hour = Number(new Intl.DateTimeFormat('en-US', {timeZone: timezone, hour: 'numeric', hourCycle: 'h23'}).format(new Date(meal.consumed_at)));
  const grams = Number(meal.carbs);
  return `${Math.floor(hour / 3)}:${grams < 30 ? 'small' : grams < 75 ? 'medium' : 'large'}`;
}
export function resolveForecastMeal(meal, state = null, timezone = 'UTC', speedClass = 'mixed') {
  const slow = meal.speed_class === 'high_fat' || ['slow','long','high_fat','delayed'].includes(meal.absorption_profile);
  const cls = slow ? 'high_fat' : meal.speed_class === 'fast' || meal.absorption_profile === 'fast' ? 'fast' : speedClass;
  const shape = carbShapeFor(cls), key = mealContextKey(meal, timezone);
  const fit = state?.model_version === MEAL_FORECAST_VERSION && state.timezone === timezone ? state.buckets?.[key] : null;
  const n = Math.max(0, Number(fit?.sample_count) || 0), weight = n / (n + 5);
  const blend = (base, observed) => base * (1 - weight) + observed * weight;
  if (n > 0) {
    shape.onsetMin = Math.max(5, Math.min(45, blend(shape.onsetMin, fit.onset)));
    shape.firstPeakMin = Math.max(shape.onsetMin + 5, Math.min(shape.durationMin - 10, 120, blend(shape.firstPeakMin, fit.peak)));
    if (shape.secondPeakMin) shape.secondPeakMin = Math.max(shape.firstPeakMin + 40, shape.secondPeakMin);
  }
  return {id: meal.id, carbs: Number(meal.carbs), consumedAt: Date.parse(meal.consumed_at), speedClass: cls, shape,
    amplitudeFactor: n ? Math.max(0.5, Math.min(1.5, blend(1, fit.amplitude_factor))) : 1,
    source: n ? 'learned' : 'theoretical', sampleCount: n, learningWeight: weight, bucket: key};
}