import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { ownerQuery, scoreProjectionPage, scoreRecentProjections, meaningfulInputChange } from '../../shared/projectionResidualScoring.ts';
import { residualBandForUser } from '../../shared/projectionBandService.ts';
const halfWidths = points => Object.fromEntries([30,60,90,120].map(h=> {const p=points.find(p=>p.min_offset===h);return [h,p ? (p.upper-p.lower)/2:null];}));
export default async function(req) {
  try {
    const base44=createClientFromRequest(req);
    const caller=await base44.auth.me().catch(e=>e.status===401?null:Promise.reject(e));
    if(!caller) return Response.json({error:'Unauthorized'},{status:401});
    if(caller.role!=='admin') return Response.json({error:'Forbidden'},{status:403});
    const body=await req.json().catch(()=>({}));
    const sr=base44.asServiceRole, now=Date.now();
    let userId=caller.id;
    if(body.action==='input_change') {
      if(!['CarbEntry','InsulinDose'].includes(body.entity_name) || !['create','update','delete'].includes(body.event_type)) return Response.json({error:'Invalid input event'},{status:400});
      const data=body.data||body.old_data||{},old=body.old_data||{};
      userId=data.created_by_id || old.created_by_id;
      if(!userId) return Response.json({error:'Missing event owner'},{status:400});
      if(body.event_type==='update' && !meaningfulInputChange(body.entity_name,old,data)) return Response.json({ok:true,skipped:'non_model_fields'});
      const changedAt=body.event_type==='delete' ? new Date(now).toISOString() : data.updated_date||data.created_date||new Date(now).toISOString();
      const eventKey=`${body.entity_name}:${body.entity_id}:${body.event_type}:${changedAt}`;
      const found=await sr.entities.ProjectionInputChange.filter({user_id:userId,event_key:eventKey},{limit:1});
      if(!found.items.length) await sr.entities.ProjectionInputChange.create({user_id:userId,entity_id:body.entity_id,entity_name:body.entity_name,event_type:body.event_type,changed_at:changedAt,event_at:data.consumed_at||data.administered_at||old.consumed_at||old.administered_at,event_key:eventKey});
      return Response.json({ok:true,...await scoreRecentProjections(sr,userId,now)});
    }
    if(body.action==='score_reading') {
      if(typeof body.reading_id!=='string') return Response.json({error:'reading_id required'},{status:400});
      const reading=await sr.entities.GlucoseReading.get(body.reading_id).catch(e=>e.status===404?null:Promise.reject(e));
      if(!reading) return Response.json({ok:true,skipped:'reading_removed'});
      if(reading.source==='system') return Response.json({ok:true,skipped:'not_observed'});
      userId=reading.user_id||reading.created_by_id;
      return Response.json({ok:true,...await scoreRecentProjections(sr,userId,now,reading.recorded_at)});
    }
    // Maintenance and reports are deliberately limited to the signed-in owner's account.
    if(body.action==='backfill') {
      const limit=Math.max(1,Math.min(100,Number(body.limit)||100));
      if(body.cursor!=null && typeof body.cursor!=='string') return Response.json({error:'Invalid cursor'},{status:400});
      const page=await sr.entities.GlucoseProjection.filter(ownerQuery(userId),{sort:'generated_at',limit,...(body.cursor?{cursor:body.cursor}:{})});
      const scored=await scoreProjectionPage(sr,userId,page.items,now);
      return Response.json({ok:true,...scored,next_cursor:page.next_cursor,has_more:page.has_more});
    }
    if(body.action==='report') {
      const latest=await sr.entities.GlucoseProjection.filter(ownerQuery(userId),{sort:'-generated_at',limit:1});
      const p=body.projection_id ? await sr.entities.GlucoseProjection.get(body.projection_id).catch(e=>e.status===404?null:Promise.reject(e)) : latest.items[0];
      if(!p || (p.user_id||p.created_by_id)!==userId) return Response.json({error:'Projection not found'},{status:404});
      const band=await residualBandForUser(sr,userId,p.trajectory,Number(p.data_quality?.volatilitySd),now,false);
      const h=band.summary.horizons;
      return Response.json({ok:true,asOf:new Date(now).toISOString(),comparisonProjection:p.id,comparisonGeneratedAt:p.generated_at,
        counts:Object.fromEntries(Object.entries(h).map(([k,v])=>[k,v.sampleCount])),horizons:h,
        halfWidthsBefore:halfWidths(p.trajectory),halfWidthsAfterBeforeTruncation:halfWidths(band.fullTrajectory),endsAtMinutes:band.summary.trajectoryEndsAtMinutes,
        coverage:band.summary.coverage,coverageCount:band.summary.coverageSampleCount,coverageScale:band.summary.coverageScale,coverageAction:band.summary.coverageAction,
        defaultBlend:band.summary.defaultBlend,excludedCount:band.excludedCount,
        liveProjection:latest.items.map(r=>({id:r.id,generated_at:r.generated_at,method:r.uncertainty_summary?.method,horizon:r.trajectory?.at(-1)?.min_offset,halfWidths:halfWidths(r.trajectory)})),
        medianUnchanged:band.fullTrajectory.every((r,i)=>r.value===p.trajectory[i]?.value),volatilityThreshold:band.summary.volatilityThreshold});
    }
    return Response.json({error:'Unknown action'},{status:400});
  } catch(error) {
    console.error('Projection band calibration failed',error.name,error.message);
    return Response.json({error:error.message},{status:500});
  }
}