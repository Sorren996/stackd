import test from 'node:test';
import assert from 'node:assert/strict';
import {completeDoseJoin,expectedPriorDoses} from '../projectionDoseGuard.ts';
const at=Date.parse('2026-11-14T09:45:00Z');
const dose={id:'dose',units:26,insulin_type:'NovoLog',administered_at:'2026-11-14T09:21:00Z'};
function service(count){return {entities:{InsulinDose:{count:async query=>{assert.equal(query.created_by_id,'owner');return count;}}}};}
test('an empty or partial dose join is rejected even without a prior projection',async()=>{
  assert.equal(await completeDoseJoin(service(1),'owner',[],at,at),false);
  assert.equal(await completeDoseJoin(service(2),'owner',[dose],at,at),false);
  assert.equal(await completeDoseJoin(service(1),'owner',[dose],at,at),true);
});
test('an intentional deletion is not resurrected from a previous snapshot',async()=>{
  assert.equal(await completeDoseJoin(service(0),'owner',[dose],at,at),false);
  assert.equal(await completeDoseJoin(service(0),'owner',[],at,at),true);
});
test('the count check cannot silently turn an outage into zero insulin',async()=>{
  const sr={entities:{InsulinDose:{count:async()=>{throw new Error('unavailable');}}}};
  await assert.rejects(()=>completeDoseJoin(sr,'owner',[],at,at),/unavailable/);
});
test('a snapshot dose remains expected only within its own product action window',()=>{
  const prior={input_snapshot:{doses:[dose]}};
  assert.equal(expectedPriorDoses(prior,at).length,1);
  assert.equal(expectedPriorDoses(prior,Date.parse(dose.administered_at)+300*60000).length,0);
});