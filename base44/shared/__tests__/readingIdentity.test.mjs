import test from 'node:test';
import assert from 'node:assert/strict';
import { upsertReadings, reconcileReadings } from '../readingPersistence.ts';
const time='2026-11-14T09:05:00.000Z';
function sandbox(initial=[]) {
  let rows=initial.map(r=>({...r})), serial=initial.length;
  const reading={
    filter:async(q)=>{ assert.ok(JSON.stringify(q).includes('owner')); return {items:rows.filter(r=>(r.user_id||r.created_by_id)==='owner'),has_more:false}; },
    bulkCreate:async(items)=>{const made=items.map(r=>({...r,id:String(++serial),created_date:time}));rows.push(...made);return made;},
    update:async(id,patch)=>{const row=rows.find(r=>r.id===id);assert.ok(row);Object.assign(row,patch,{updated_date:'2026-11-14T10:00:00Z'});return row;},
    deleteMany:async(q)=>{assert.ok(JSON.stringify(q).includes('owner'));const ids=q.$and.find(x=>x.id).id.$in;rows=rows.filter(r=>!ids.includes(r.id));},
  };
  return {sr:{entities:{DexcomConnection:{filter:async()=>({items:[]})},GlucoseReading:reading,GlucoseProjection:{filter:async()=>({items:[],has_more:false})}}},getRows:()=>rows};
}
test('repeated batches and in-batch corrections keep one user/moment identity',async()=>{
  const s=sandbox();
  await upsertReadings({sr:s.sr,ownerId:'owner',rows:[103,103,104].map(value=>({value,recorded_at:time,source:'dexcom'}))});
  assert.equal(s.getRows().length,1);assert.equal(s.getRows()[0].value,104);
  await upsertReadings({sr:s.sr,ownerId:'owner',rows:[{value:105,recorded_at:time,source:'dexcom'}]});
  assert.equal(s.getRows().length,1);assert.equal(s.getRows()[0].value,105);
});
test('reconciliation removes every duplicate beyond the old fifty-row cap',async()=>{
  const s=sandbox(Array.from({length:80},(_,i)=>({id:String(i),user_id:'owner',recorded_at:time,value:103,source:'dexcom'})));
  const removed=await reconcileReadings({sr:s.sr,ownerId:'owner',sinceIso:time,untilIso:time});
  assert.equal(removed,79);assert.equal(s.getRows().length,1);
});
test('a carry-forward cannot overwrite an observed point',async()=>{
  const s=sandbox([{id:'real',created_by_id:'owner',recorded_at:time,value:103,source:'manual'}]);
  await upsertReadings({sr:s.sr,ownerId:'owner',rows:[{recorded_at:time,value:110,source:'system'}]});
  assert.equal(s.getRows().length,1);assert.equal(s.getRows()[0].value,103);assert.equal(s.getRows()[0].source,'manual');
});