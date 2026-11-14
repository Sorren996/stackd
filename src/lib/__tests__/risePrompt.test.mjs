import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const load=async(name)=>`data:text/javascript;base64,${Buffer.from(await readFile(new URL(`../${name}.js`,import.meta.url),'utf8')).toString('base64')}`;
let source=await readFile(new URL('../risePrompt.js',import.meta.url),'utf8');
for(const name of ['glucoseSeries','mealInPlayWindow','insulinPharmacology']) source=source.replace(`@/lib/${name}`,await load(name));
const {detectUnloggedRise,promptDecision,promptQuiet}=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const at=s=>Date.parse(`2026-11-14T${s}:00Z`);
const readings=[103,112,122,131,139,144,146].map((value,i)=>({value,recorded_at:new Date(at('09:05')+i*300000).toISOString(),source:'dexcom'}));
const doses=[{units:26,insulin_type:'NovoLog',administered_at:new Date(at('09:21')).toISOString()}];
const settings={settings_confirmed:true,meal_insulin_units_per_5g:1.5};
const context={recent:[],todayCount:0,patterns:[],preferences:{}};
test('the morning rise prefills about 85g from one bolus and the personal ratio',()=>{
  const event=detectUnloggedRise(readings,[],doses,settings,at('09:35'));
  assert.equal(event.estimate_carbs,85);assert.equal(event.window_start,new Date(at('09:15')).toISOString());
  assert.equal(promptDecision(event,context,at('09:35'),'UTC').kind,'prompt');
});
test('known food, stale data and interrupted sensor windows do not prompt',()=>{
  assert.equal(detectUnloggedRise(readings,[{carbs:40,consumed_at:new Date(at('08:00')).toISOString()}],doses,settings,at('09:35')),null);
  assert.equal(detectUnloggedRise(readings,[],doses,settings,at('10:00')),null);
  assert.equal(detectUnloggedRise(readings.filter((_,i)=>i%3===0),[],doses,settings,at('09:35')),null);
});
test('quiet hours, rolling cooldowns, daily caps and event dismissal are respected',()=>{
  const event=detectUnloggedRise(readings,[],doses,settings,at('09:35'));
  assert.equal(promptQuiet({quiet_hours_enabled:true,quiet_start_hour:21,quiet_end_hour:10,quiet_timezone:'UTC'},at('09:35')),true);
  assert.equal(promptDecision(event,{...context,preferences:{quiet_hours_enabled:true,quiet_start_hour:9,quiet_end_hour:10,quiet_timezone:'UTC'}},at('09:35'),'UTC'),null);
  assert.equal(promptDecision(event,{...context,todayCount:3},at('09:35'),'UTC'),null);
  assert.equal(promptDecision(event,{...context,recent:[{created_date:new Date(at('08:00')).toISOString()}]},at('09:35'),'UTC'),null);
  assert.equal(promptDecision(event,{...context,recent:[{...event,tag:'not_now'}]},at('09:35'),'UTC'),null);
});
test('three repeated tags become one annotation; repeated unanswered dismissals stop asking',()=>{
  const event=detectUnloggedRise(readings,[],doses,settings,at('09:35'));
  assert.equal(promptDecision(event,{...context,patterns:[{tag:'stress',time_bucket:3,count:3}]},at('09:35'),'UTC').kind,'memory');
  assert.equal(promptDecision(event,{...context,patterns:[{tag:'not_now',time_bucket:3,count:3}]},at('09:35'),'UTC'),null);
});