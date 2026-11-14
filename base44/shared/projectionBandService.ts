import { readPages } from './projectionResidualScoring.ts';
import { flattenResiduals, fitResidualBand, applyResidualBand } from './residualBandMath.ts';
export async function residualBandForUser(sr,userId,trajectory,volatilitySd,now=Date.now(),persist=true) {
  const [records,states] = await Promise.all([
    readPages(sr.entities.ProjectionResidual,{user_id:userId},'-generated_at'),
    sr.entities.ProjectionBandState.filter({user_id:userId},{sort:'created_date',limit:1})
  ]);
  const rows=flattenResiduals(records,now);
  const state=states.items[0];
  const fit=fitResidualBand(rows,volatilitySd,trajectory,state||{},now);
  const band=applyResidualBand(trajectory,fit);
  if(persist && trajectory.length) {
    const patch={user_id:userId,coverage_scale:fit.guard.scale,coverage_key:fit.guard.key,
      ...(fit.guard.coverage != null ? {coverage:fit.guard.coverage}:{}),coverage_count:fit.guard.count,updated_at:new Date(now).toISOString()};
    if(state) await sr.entities.ProjectionBandState.update(state.id,patch);
    else await sr.entities.ProjectionBandState.create(patch);
  }
  return {...band,fit,excludedCount:records.reduce((n,r)=>n+(r.exclusions?.length||0),0)};
}