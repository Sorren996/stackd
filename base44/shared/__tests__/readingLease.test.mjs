import test from 'node:test';
import assert from 'node:assert/strict';
import {withReadingLease} from '../readingLease.ts';
function service(){
  let token=null;
  return {entities:{DexcomConnection:{filter:async()=>({items:[{id:'stable-connection'}]}),updateMany:async(q,change)=>{
    if(q.$or){if(token)return {updated:0};token=change.$set.ingest_lease_token;return {updated:1};}
    if(q.ingest_lease_token!==token)return {updated:0};token=change.$set.ingest_lease_token;return {updated:1};
  }}}};
}
test('different workers cannot enter the same owner ingestion critical section',async()=>{
  const sr=service();let release;
  const hold=new Promise(resolve=>release=resolve);
  const first=withReadingLease(sr,'owner',()=>hold);
  await new Promise(resolve=>setImmediate(resolve));
  await assert.rejects(()=>withReadingLease(sr,'owner',async()=>{throw new Error('must not enter');}),/reading_ingest_busy/);
  release('saved');assert.equal(await first,'saved');
  assert.equal(await withReadingLease(sr,'owner',async()=>42),42);
});
test('a failed write releases its own claim',async()=>{
  const sr=service();await assert.rejects(()=>withReadingLease(sr,'owner',async()=>{throw new Error('write failed');}),/write failed/);
  assert.equal(await withReadingLease(sr,'owner',async()=>true),true);
});