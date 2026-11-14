import profileFor from './projectionInsulinProfiles.ts';
const basal=d=>/lantus|tresiba|toujeo|levemir|basaglar|semglee|glargine|degludec|detemir|nph|humulin n|novolin n/i.test(d?.insulin_type||'');
export function expectedPriorDoses(prior, anchorTime) {
  return (prior?.input_snapshot?.doses||[]).filter(d=>{const at=Date.parse(d.administered_at);return !basal(d) && Number(d.units)>0 && at<=anchorTime && at+profileFor(d.insulin_type).duration*60000>anchorTime;});
}
export async function completeDoseJoin(sr,userId,doses,anchorTime,now) {
  const {items}=await sr.entities.GlucoseProjection.filter({user_id:userId,abstained:false,'input_provenance.doseCount':{$gt:0},generated_at:{$gte:new Date(now-16*3600000).toISOString()}},{sort:'-generated_at',limit:1});
  const missing=expectedPriorDoses(items[0],anchorTime).filter(d=>!doses.some(row=>row.id===d.id));
  for(const d of missing) {
    const saved=await sr.entities.InsulinDose.get(d.id).catch(e=>(e.status===404||e.response?.status===404)?null:Promise.reject(e));
    // A confirmed deletion is intentional, never resurrect it from a snapshot.
    if(saved && saved.created_by_id===userId) return false;
  }
  if(!doses.length) {
    const count=await sr.entities.InsulinDose.count({created_by_id:userId,administered_at:{$gte:new Date(now-16*3600000).toISOString(),$lte:new Date(now).toISOString()}});
    if(count>0) return false;
  }
  return true;
}