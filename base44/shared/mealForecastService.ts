import { readPages, ownerQuery } from './projectionResidualScoring.ts';
import { learnMealForecast } from './mealForecastLearning.ts';
import { MEAL_FORECAST_VERSION } from './mealForecastContext.ts';
export async function loadMealForecastState(sr, userId, settings, now) {
  let prior = null;
  try {
    const page = await sr.entities.MealForecastState.filter({user_id:userId},{sort:'-learned_at',limit:1});
    prior = page.items[0] || null;
    if (prior?.model_version === MEAL_FORECAST_VERSION && prior.timezone === (settings.timezone || 'UTC') && now-Date.parse(prior.learned_at)<6*3600000) return prior;
    const since = new Date(now-21*86400000).toISOString(), until = new Date(now).toISOString();
    const [meals,readings,doses] = await Promise.all([
      readPages(sr.entities.CarbEntry,{created_by_id:userId,consumed_at:{$gte:since,$lte:until}},'consumed_at'),
      readPages(sr.entities.GlucoseReading,{$and:[ownerQuery(userId),{recorded_at:{$gte:since,$lte:until},source:{$ne:'system'}}]},'recorded_at'),
      readPages(sr.entities.InsulinDose,{created_by_id:userId,administered_at:{$gte:since,$lte:until}},'administered_at')
    ]);
    const fit = learnMealForecast({meals,readings,doses,settings,now});
    const patch = {user_id:userId,...fit,history:[...(prior?.history||[]),{model_version:fit.model_version,learned_at:fit.learned_at,buckets:fit.buckets}].slice(-12)};
    return prior ? await sr.entities.MealForecastState.update(prior.id,patch) : await sr.entities.MealForecastState.create(patch);
  } catch (error) {
    console.warn('Meal forecast learning unavailable',error.name);
    return prior;
  }
}