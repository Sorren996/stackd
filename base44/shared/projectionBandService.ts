import { readPages } from './projectionResidualScoring.ts';
import { flattenResiduals, fitResidualBand, applyResidualBand } from './residualBandMath.ts';
export async function residualBandForUser(sr,userId,trajectory,volatilitySd,now=Date.now(),persist=true,modelVersion=null) {
  const [records,states] = await Promise.all([
    readPages(sr.entities.ProjectionResidual,{user_id:userId},'-generated_at'),
    sr.entities.ProjectionBandState.filter({user_id:userId},{sort:'created_date',limit:1})
  ]);
  const eligibleRecords = modelVersion ? records.filter(r => r.model_version === modelVersion) : records;
  const rows=flattenResiduals(eligibleRecords,now);
  const state=states.items[0];
  const fit=fitResidualBand(rows,volatilitySd,trajectory,rows.length ? state||{} : {},now);
  const band=applyResidualBand(trajectory,fit);
  const anchorAt=trajectory[0]?.time;
  if (anchorAt != null) {
    const anchorIso=new Date(anchorAt).toISOString();
    const {items:contexts}=await sr.entities.RiseContext.filter({created_by_id:userId,tag:{$in:['stress','illness','poor_sleep','caffeine','site_sensor_change','coming_up_from_low']},window_start:{$lte:anchorIso},window_end:{$gte:anchorIso}},{sort:'-responded_at',limit:1});
    if(contexts[0]) {
      const scale=1.15;
      const widened=band.trajectory.map(p=>({...p,lower:p.value-(p.value-p.lower)*scale,upper:p.value+(p.upper-p.value)*scale}));
      const stop=widened.findIndex(p=>(p.upper-p.lower)/2>45);
      band.trajectory=stop<0?widened:widened.slice(0,Math.max(1,stop));
      band.summary.trajectoryEndsAtMinutes=band.trajectory.at(-1)?.min_offset||0;
      band.summary.contextAdjustment={tag:contexts[0].tag,scale,validated:false};
    }
  }
  if(persist && trajectory.length) {
    const patch={user_id:userId,coverage_scale:fit.guard.scale,coverage_key:fit.guard.key,
      ...(fit.guard.coverage != null ? {coverage:fit.guard.coverage}:{}),coverage_count:fit.guard.count,updated_at:new Date(now).toISOString()};
    if(state) await sr.entities.ProjectionBandState.update(state.id,patch);
    else await sr.entities.ProjectionBandState.create(patch);
  }
  return {...band,fit,excludedCount:records.reduce((n,r)=>n+(r.exclusions?.length||0),0)};
}