import profileFor from './projectionInsulinProfiles.ts';
const basal=d=>/lantus|tresiba|toujeo|levemir|basaglar|semglee|glargine|degludec|detemir|nph|humulin n|novolin n/i.test(d?.insulin_type||'');
export function expectedPriorDoses(prior, anchorTime) {
  return (prior?.input_snapshot?.doses||[]).filter(d=>{const at=Date.parse(d.administered_at);return !basal(d) && Number(d.units)>0 && at<=anchorTime && at+profileFor(d.insulin_type).duration*60000>anchorTime;});
}
export async function completeDoseJoin(sr,userId,doses,anchorTime,now) {
  const since=anchorTime-16*3600000;
  const recent={created_by_id:userId,administered_at:{$gte:new Date(since).toISOString(),$lte:new Date(now).toISOString()}};
  const expectedCount=await sr.entities.InsulinDose.count(recent);
  const loaded=new Set(doses.filter(d=>Date.parse(d.administered_at)>=since && Date.parse(d.administered_at)<=now).map(d=>d.id));
  // Detect both empty and partial joins, including a first projection without a
  // previous snapshot. A deletion also skips this pass, rather than reviving it.
  return expectedCount===loaded.size;
}