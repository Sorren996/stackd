import test from 'node:test';
import assert from 'node:assert/strict';
import { carbShapeFor, carbAbsorptionRate, projectSuperposition } from '../glucoseSuperposition.ts';
import { normalizeInputs, projectGlucose } from '../insightEngine.ts';
import { resolveForecastMeal, mealContextKey } from '../mealForecastContext.ts';
import { learnMealForecast } from '../mealForecastLearning.ts';
const M=60000, at=s=>Date.parse(`2026-11-14T${s}:00Z`);
const settings={timezone:'America/Chicago',insulin_sensitivity_mgdl_per_unit:10,meal_insulin_units_per_5g:1.5};
const meal={id:'meal',carbs:105,consumed_at:new Date(at('16:10')).toISOString(),fat_grams:20,speed_class:'high_fat'};
const readings=[117,119,122,126,133].map((value,i)=>({value,recorded_at:new Date(at('16:45')+i*5*M).toISOString(),time:at('16:45')+i*5*M,source:'dexcom_share'}));
const doses=[{units:26,administered_at:new Date(at('15:21')).toISOString(),insulin_type:'NovoLog'},{units:12,administered_at:meal.consumed_at,insulin_type:'NovoLog'}];
test('existing gamma profile has exact mass, explicit onset, and the requested timing',()=>{
 for(const cls of ['mixed','fast','high_fat']) {
  const shape=carbShapeFor(cls);let area=0;
  for(let t=0;t<shape.durationMin;t+=0.1)area+=(carbAbsorptionRate(t,shape)+carbAbsorptionRate(t+0.1,shape))*0.05;
  assert.ok(Math.abs(area-1)<0.002,`${cls}: ${area}`);
  assert.equal(carbAbsorptionRate(shape.onsetMin,shape),0);
  assert.equal(carbAbsorptionRate(shape.durationMin,shape),0);
  assert.ok(shape.durationMin<=300);
 }
 assert.deepEqual([carbShapeFor('mixed').firstPeakMin,carbShapeFor('fast').durationMin],[55,75]);
});
test('the saved 105g meal opens upward, then turns down, without cancelling the action term',()=>{
 const snapshot=normalizeInputs(readings,[meal],doses,settings,at('17:05'));
 const p=projectGlucose(snapshot,{horizonMin:120});const d=p.effectiveParameters.shapeEngine;
 assert.equal(p.modelVersion,'2.3.0-meal-context');
 assert.equal(d.mealComponents[0].amplitude,315);assert.equal(d.carbSensitivity,3);
 assert.ok(d.carbRateAtAnchor>2.5);assert.ok(p.momentum.openingRate>=0,JSON.stringify(p.momentum));
 assert.ok(p.trajectory[1].value>=133);
 const rates=d.splitRates;assert.ok(rates.some(r=>r.total<0));
 assert.ok(Math.max(...p.trajectory.map(p=>p.value))>p.trajectory.at(-1).value);
 assert.ok(rates.every(r=>Math.abs(r.total)<=4.5));
 console.log(JSON.stringify({mealRegression:{carbRate:d.carbRateAtAnchor,opening:p.momentum.openingRate,active:d.activeCarbs,peak:Math.max(...p.trajectory.map(p=>p.value)),last:p.trajectory.at(-1).value}}));
 const empty=projectGlucose(normalizeInputs(readings,[],doses,settings,at('17:05')));
 assert.ok(empty.momentum.openingRate<0);
});
function history() {
 const meals=[],readings=[],doses=[];
 for(let day=10;day<=12;day++){
  const start=Date.parse(`2026-11-${day}T16:10:00Z`);meals.push({...meal,id:`m${day}`,consumed_at:new Date(start).toISOString()});
  doses.push({units:12,insulin_type:'NovoLog',administered_at:new Date(start).toISOString()});
  for(let m=0;m<=125;m+=5)readings.push({recorded_at:new Date(start+m*M).toISOString(),source:'dexcom',value:m<20?100:m<=75?100+(m-20):155-(m-75)*0.6});
 }
 return {meals,readings,doses,settings,now:at('17:05')};
}
test('three similar meals fit onset, peak, amplitude and blend at n/(n+5), without changing settings',()=>{
 const args=history(),before=JSON.stringify(args.settings),state=learnMealForecast(args),key=mealContextKey(meal,settings.timezone);
 assert.equal(state.buckets[key].sample_count,3);assert.equal(JSON.stringify(args.settings),before);
 const personal=resolveForecastMeal(meal,state,settings.timezone,'high_fat');
 assert.equal(personal.source,'learned');assert.equal(personal.learningWeight,3/8);assert.notEqual(personal.shape.firstPeakMin,55);
 assert.equal(resolveForecastMeal({...meal,carbs:15},state,settings.timezone).source,'theoretical');
 assert.equal(resolveForecastMeal(meal,state,'UTC').source,'theoretical');
 assert.deepEqual(learnMealForecast({...args,now:Date.parse('2026-11-10T17:00:00Z')}).buckets,{});
});
test('insufficient follow-up, missing paired support and rescue entries cannot train a fit',()=>{
 const args=history();
 assert.deepEqual(learnMealForecast({...args,doses:[]}).buckets,{});
 assert.deepEqual(learnMealForecast({...args,meals:args.meals.map(m=>({...m,is_rescue_carb:true}))}).buckets,{});
 assert.deepEqual(learnMealForecast({...args,readings:args.readings.filter((_,i)=>i%4===0)}).buckets,{});
});