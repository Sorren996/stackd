// All CGM writers use the oldest existing connection as their shared CAS lock.
// There is no check-then-create lock row and no assumption about worker affinity.
export async function withReadingLease(sr, ownerId, work) {
  const {items}=await sr.entities.DexcomConnection.filter({created_by_id:ownerId},{sort:'created_date',limit:1});
  const connection=items[0];
  if(!connection) return work(); // manual-only accounts have no sensor writer
  const token=crypto.randomUUID(), now=Date.now();
  const claim=await sr.entities.DexcomConnection.updateMany({id:connection.id,created_by_id:ownerId,$or:[{ingest_lease_until:{$exists:false}},{ingest_lease_until:null},{ingest_lease_until:{$lte:now}}]},{$set:{ingest_lease_token:token,ingest_lease_until:now+310000}});
  if(Number(claim.updated)!==1) throw new Error('reading_ingest_busy');
  try { return await work(); }
  finally { await sr.entities.DexcomConnection.updateMany({id:connection.id,ingest_lease_token:token},{$set:{ingest_lease_token:null,ingest_lease_until:0}}); }
}