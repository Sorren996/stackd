import test from 'node:test';
import assert from 'node:assert/strict';
import { projectSuperposition, insulinShapeFor, insulinActivityRate } from '../glucoseSuperposition.ts';
import { normalizeInputs, projectGlucose } from '../insightEngine.ts';
import { projectionOpening } from '../projectionOpening.ts';
const at = time => Date.parse(`2026-11-14T${time}:00Z`);
const values = [103,112,122,131,139,144,146,145,140];
const readings = values.map((value,i) => ({time:at('09:05')+i*300000,value,source:'dexcom'}));
const dose = { units:26, atTime:at('09:21'), insulinType:'NovoLog' };
const args = { doses:[dose], isf:10, mgPerGram:3, horizonMin:120 };
test('registry-timed NovoLog has fixed onset/peak/end and area-normalised activity',()=>{
  const shape=insulinShapeFor(26,'NovoLog');
  assert.deepEqual([shape.onsetMin,shape.peakMin,shape.durationMin],[15,75,300]);
  assert.equal(insulinActivityRate(14,shape),0);
  let area=0; for(let t=0;t<300;t++) area+=(insulinActivityRate(t,shape)+insulinActivityRate(t+1,shape))/2;
  assert.ok(Math.abs(area-1)<0.001);
  assert.ok(insulinActivityRate(75,shape)*260>2 && insulinActivityRate(75,shape)*260<3);
});
test('morning case remains activity-led across consecutive anchors',()=>{
  const first=projectSuperposition({...args,anchorTime:at('09:40'),anchorValue:145,readings:readings.slice(0,-1)});
  const next=projectSuperposition({...args,anchorTime:at('09:45'),anchorValue:140,readings,previousProjection:first.diagnostics.momentum});
  assert.ok(first.points[0].rate<0); assert.ok(next.points[0].rate<0);
  assert.ok(Math.abs(next.points[0].rate-first.points[0].rate)<=0.801);
  assert.ok(next.points.every(p=>Math.abs(p.rate)<=4.5));
  assert.ok(next.diagnostics.lowCrossingMinutes>0);
  const mechanism=projectSuperposition({...args,anchorTime:dose.atTime+16*60000,anchorValue:145,readings:[]});
  assert.ok(mechanism.points[0].rate<0);
});
test('momentum is short lived and cannot displace more than about twenty',()=>{
  const p=projectSuperposition({anchorTime:at('09:15'),anchorValue:150,readings:[120,130,140,150].map((value,i)=>({time:at('09:00')+i*300000,value,source:'dexcom'}))});
  assert.equal(p.diagnostics.momentum.tauMin,12);
  assert.ok(p.points.at(-1).value<=171);
});
test('a single opposite sample cannot flip the accepted momentum sign',()=>{
  const p=projectionOpening({readings:[100,110,105].map((value,i)=>({time:i*300000,value})),anchorTime:600000,velocity:-1,activeUnits:0,insulinRate:0,mechanism:0,previous:{acceptedSign:1,openingRate:1}});
  assert.equal(p.heldSign,true); assert.equal(p.acceptedSign,1); assert.equal(p.momentum,0);
});
test('duplicate timestamps including corrections count once in projection inputs',()=>{
  const raw=readings.flatMap(r=>Array.from({length:3},()=>({value:r.value,recorded_at:new Date(r.time).toISOString(),source:r.source})));
  raw.push({...raw[0],value:104,updated_date:'2026-11-14T09:50:00Z'});
  const snapshot=normalizeInputs(raw,[],[],{},at('09:45'));
  assert.equal(snapshot.dataQuality.readingCount,9);
  assert.equal(snapshot.readings[0].value,104);
});
test('stored model label and split-rate diagnostics describe the actual engine',()=>{
  const result=projectGlucose(normalizeInputs(readings.map(r=>({...r,recorded_at:new Date(r.time).toISOString()})),[],[{units:26,administered_at:new Date(dose.atTime).toISOString(),insulin_type:'NovoLog'}],{insulin_sensitivity_mgdl_per_unit:10,meal_insulin_units_per_5g:1.5},at('09:45')));
  assert.equal(result.modelVersion,'2.2.0-activity-led');
  assert.equal(result.effectiveParameters.shapeEngine.splitRates.length,25);
});