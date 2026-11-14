import { mealContextKey, resolveForecastMeal, MEAL_FORECAST_VERSION } from './mealForecastContext.ts';
import { carbAbsorptionFraction, insulinShapeFor, insulinActionFraction, isBasalInsulinType } from './glucoseSuperposition.ts';
const M = 60000;
const ms = value => Date.parse(value);
const rescue = m => m.is_rescue_carb || m.classification === 'rescue_carbs';
const median = xs => {const a = [...xs].sort((a,b)=>a-b), i = Math.floor(a.length/2); return a.length % 2 ? a[i] : (a[i-1]+a[i])/2;};
export function learnMealForecast({meals, readings, doses, settings, now}) {
  const timezone = settings.timezone || 'UTC';
  const sensitivity = Number(settings.insulin_sensitivity_mgdl_per_unit) * Number(settings.meal_insulin_units_per_5g) / 5;
  const known = row => !row.created_date || ms(row.created_date) <= now;
  const food = meals.filter(m => known(m) && Number(m.carbs)>0 && ms(m.consumed_at)<=now);
  const unique = new Map();
  for (const r of readings.filter(r => known(r) && r.source !== 'system' && r.source !== 'manual' && !r.is_interpolated && ms(r.recorded_at)<=now)) unique.set(ms(r.recorded_at), r);
  const series = [...unique.values()].sort((a,b)=>ms(a.recorded_at)-ms(b.recorded_at));
  const support = doses.filter(d => known(d) && Number(d.units)>0 && !isBasalInsulinType(d.insulin_type));
  const samples = new Map();
  if (sensitivity > 0) for (const meal of food.filter(m => !rescue(m))) {
    const start = ms(meal.consumed_at);
    if (start + 90*M > now || (meal.updated_date && ms(meal.updated_date)>now)) continue;
    const paired = support.filter(d => ms(d.administered_at)>=start-45*M && ms(d.administered_at)<=start+90*M)
      .sort((a,b)=>Math.abs(ms(a.administered_at)-start)-Math.abs(ms(b.administered_at)-start))[0];
    if (!paired) continue;
    // Never assign one combined glucose excursion to two adjacent meals or rescues.
    if (food.some(m => m.id !== meal.id && ms(m.consumed_at)>start-45*M && ms(m.consumed_at)<=start)) continue;
    const next = Math.min(now, start+300*M, ...food.filter(m=>m.id!==meal.id && ms(m.consumed_at)>start).map(m=>ms(m.consumed_at)));
    const baseline = series.filter(r=>ms(r.recorded_at)<=start && ms(r.recorded_at)>=start-15*M).at(-1);
    const window = series.filter(r=>ms(r.recorded_at)>start && ms(r.recorded_at)<next);
    if (!baseline || window.length<18 || ms(window.at(-1).recorded_at)-start<90*M) continue;
    const withBase = [baseline,...window];
    if (withBase.some((r,i)=>i && ms(r.recorded_at)-ms(withBase[i-1].recorded_at)>15*M)) continue;
    const peak = window.reduce((best,r)=>r.value>best.value?r:best, window[0]);
    const peakTime = (ms(peak.recorded_at)-start)/M;
    // A peak still at the right boundary is censored, not a known time to peak.
    if (peakTime<15 || ms(peak.recorded_at)>ms(window.at(-1).recorded_at)-10*M) continue;
    const onset = window.find((r,i)=>Number(r.value)>=Number(baseline.value)+3 && window[i+1] && Number(window[i+1].value)>=Number(baseline.value)+3);
    const theoretical = resolveForecastMeal(meal, null, timezone);
    const fraction = carbAbsorptionFraction(peakTime, theoretical.shape);
    if (fraction<0.1) continue;
    // Reconstruct the positive meal contribution, not the net rise after support.
    // Every existing action term is included once; no support recommendation is produced.
    const lowering = support.reduce((sum,d)=>{
      const shape = insulinShapeFor(d.units,d.insulin_type), at=ms(d.administered_at);
      return sum + Number(d.units)*Number(settings.insulin_sensitivity_mgdl_per_unit)*
        (insulinActionFraction((ms(peak.recorded_at)-at)/M,shape)-insulinActionFraction((start-at)/M,shape));
    },0);
    const netRise = Number(peak.value)-Number(baseline.value);
    const amplitude = (netRise+lowering)/(Number(meal.carbs)*sensitivity*fraction);
    if (!(amplitude>0) || !Number.isFinite(amplitude)) continue;
    const key = mealContextKey(meal,timezone), list=samples.get(key)||[];
    list.push({onset:onset?(ms(onset.recorded_at)-start)/M:10, peak:peakTime,
      amplitude_factor:Math.max(0.5,Math.min(1.5,amplitude)), net_rise:netRise, meal_id:meal.id});
    samples.set(key,list);
  }
  const buckets = {};
  for (const [key,rows] of samples) buckets[key]={sample_count:rows.length,onset:median(rows.map(r=>r.onset)),peak:median(rows.map(r=>r.peak)),
    amplitude_factor:median(rows.map(r=>r.amplitude_factor)), observed_net_rise:median(rows.map(r=>r.net_rise)),meal_ids:rows.map(r=>r.meal_id)};
  return {model_version:MEAL_FORECAST_VERSION,timezone,buckets,learned_at:new Date(now).toISOString()};
}