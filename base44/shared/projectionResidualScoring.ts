import { RESIDUAL_HORIZONS, BAND_VERSION } from './residualBandMath.ts';
const MINUTE = 60000;
export const ownerQuery = userId => ({ $or:[{user_id:userId},{created_by_id:userId}] });
export async function readPages(entity, query, sort = 'created_date') {
  const items = [];
  let cursor;
  do {
    const page = await entity.filter(query,{sort,limit:250,...(cursor ? {cursor} : {})});
    items.push(...page.items);
    cursor = page.has_more ? page.next_cursor : null;
  } while(cursor);
  return items;
}
const ms = s => Date.parse(s);
const rescue = m => m.is_rescue_carb === true || m.classification === 'rescue_carbs';
const mealFields = ['consumed_at','carbs','fat_grams','protein_grams','glycemic_index','absorption_profile','is_rescue_carb'];
const doseFields = ['administered_at','insulin_type','units'];
const fieldValue = (r,k) => k === 'is_rescue_carb' ? rescue(r) : (r[k] ?? (['carbs','fat_grams','protein_grams','glycemic_index','units'].includes(k) ? 0 : ''));
export const meaningfulInputChange = (name,oldRow,row) => (name === 'CarbEntry' ? mealFields : [...doseFields,'meal_units','correction_units']).some(k=>fieldValue(oldRow||{},k)!==fieldValue(row||{},k));
function changedBefore(projection, target, meals, doses, changes) {
  const generated = ms(projection.generated_at), snapshot = projection.input_snapshot;
  if (changes.some(c => ms(c.changed_at) > generated && ms(c.changed_at) <= target)) return 'input_change_event';
  for (const [rows, saved, fields, timeField, lookback] of [
    [meals,snapshot?.meals,mealFields,'consumed_at',12*60*MINUTE],
    [doses,snapshot?.doses,doseFields,'administered_at',48*60*MINUTE]
  ]) {
    for (const row of rows) {
      const event = ms(row[timeField]), created = ms(row.created_date);
      // Both a newly occurring event and a late log of a past event change the available inputs.
      if ((event > generated && event <= target) || (created > generated && created <= target && event <= target)) return 'new_input_after_generation';
    }
    if (!Array.isArray(saved)) {
      if (rows.some(r => ms(r.updated_date)>generated && ms(r.updated_date)<=target)) return 'legacy_edit_unverifiable';
      continue;
    }
    for (const old of saved.filter(r => ms(r[timeField]) >= generated-lookback && ms(r[timeField]) <= target)) {
      const current = rows.find(r => old.id ? r.id === old.id : ms(r[timeField]) === ms(old[timeField]));
      // A historical deletion or an overwritten edit has no reconstructible timestamp.
      // Exclude rather than attribute that unknowable error to the model.
      if (!current) return 'historical_deleted_or_moved_input';
      if (fields.some(k=>fieldValue(old,k)!==fieldValue(current,k))) return 'historical_edited_input';
    }
  }
  return null;
}
export function scoreStoredProjection(p, readings, meals, doses, changes, now) {
  const generated = ms(p.generated_at), anchor = ms(p.anchor_time) || generated;
  const points = [...(p.trajectory||[]),...(p.uncertainty_summary?.shadowForecastPoints||[])];
  const scores = [], exclusions = [];
  for (const h of RESIDUAL_HORIZONS) {
    const point = points.find(t=>t.min_offset === h);
    if (!point || !Number.isFinite(point.value)) continue;
    const target = ms(point.time) || anchor+h*MINUTE;
    if (target > now) continue;
    const actual = readings.filter(r=>r.source !== 'system' && !r.is_interpolated && Number.isFinite(r.value) && ms(r.recorded_at)>generated && ms(r.recorded_at)<=now && Math.abs(ms(r.recorded_at)-target)<=2.5*MINUTE)
      .sort((a,b)=>Math.abs(ms(a.recorded_at)-target)-Math.abs(ms(b.recorded_at)-target) || ms(b.updated_date)-ms(a.updated_date))[0];
    if (!actual) continue;
    const changed = changedBefore(p,Math.max(target,ms(actual.recorded_at)),meals,doses,changes);
    if (changed) { exclusions.push({horizon:h,reason:changed}); continue; }
    const residual = actual.value-point.value;
    const shown = (p.trajectory||[]).some(t=>t.min_offset===h);
    const low = point.lower == null ? null : point.lower-point.value;
    const high = point.upper == null ? null : point.upper-point.value;
    const audit = p.uncertainty_summary?.bandAudit?.find(t=>t.horizon===h);
    scores.push({horizon:h,residual,actual_at:actual.recorded_at,reading_id:actual.id,scored_at:new Date(now).toISOString(),
      shown,covered:shown && low!=null && high!=null ? residual>=low && residual<=high : null,
      shown_lower:low,shown_upper:high,
      base_lower:audit?.baseLower ?? low,base_upper:audit?.baseUpper ?? high,
      match_offset_minutes:Math.abs(ms(actual.recorded_at)-target)/MINUTE});
  }
  const dq=p.data_quality||{};
  return {user_id:p.user_id||p.created_by_id,projection_id:p.id,generated_at:p.generated_at,model_version:p.model_version,
    context:{meal_in_play:(dq.activeMealCount||0)>0,insulin_only:(dq.activeDoseCount||0)>0 && !(dq.activeMealCount>0) && !(dq.activeRescueCarbCount>0),rescue_carbs:(dq.activeRescueCarbCount||0)>0},
    ...(Number.isFinite(dq.volatilitySd) ? {volatility_sd:dq.volatilitySd}:{}),scores,exclusions,scoring_version:BAND_VERSION};
}
export async function scoreProjectionPage(sr,userId,projections,now=Date.now()) {
  const valid = projections.filter(p=>!p.abstained && p.trajectory?.length);
  if (!valid.length) return {scored:0,excluded:0,projections:projections.length};
  const start = Math.min(...valid.map(p=>ms(p.generated_at)));
  const end = Math.min(now,Math.max(...valid.map(p=>(ms(p.anchor_time)||ms(p.generated_at))+123*MINUTE)));
  const lo=new Date(start).toISOString(),hi=new Date(end).toISOString();
  const [readings,meals,doses,changes,existing] = await Promise.all([
    readPages(sr.entities.GlucoseReading,{$and:[ownerQuery(userId),{recorded_at:{$gte:new Date(start-3*MINUTE).toISOString(),$lte:hi},source:{$ne:'system'}}]},'recorded_at'),
    readPages(sr.entities.CarbEntry,{created_by_id:userId,$or:[{consumed_at:{$gte:new Date(start-12*60*MINUTE).toISOString(),$lte:hi}},{updated_date:{$gte:lo,$lte:hi}}]}),
    readPages(sr.entities.InsulinDose,{created_by_id:userId,$or:[{administered_at:{$gte:new Date(start-48*60*MINUTE).toISOString(),$lte:hi}},{updated_date:{$gte:lo,$lte:hi}}]}),
    readPages(sr.entities.ProjectionInputChange,{user_id:userId,changed_at:{$gte:lo,$lte:hi}}),
    readPages(sr.entities.ProjectionResidual,{user_id:userId,projection_id:{$in:valid.map(p=>p.id)}})
  ]);
  const byId=new Map(existing.map(r=>[r.projection_id,r]));
  const creates=[],updates=[];
  let scored=0,excluded=0;
  for(const p of valid) {
    const next=scoreStoredProjection(p,readings,meals,doses,changes,now),old=byId.get(p.id);
    scored+=next.scores.length; excluded+=next.exclusions.length;
    if(old) updates.push({id:old.id,...next}); else creates.push(next);
  }
  if(creates.length) await sr.entities.ProjectionResidual.bulkCreate(creates);
  if(updates.length) await sr.entities.ProjectionResidual.bulkUpdate(updates);
  return {scored,excluded,projections:projections.length};
}
export async function scoreReadingWindow(sr,userId,firstReadingMs,lastReadingMs,now=Date.now()) {
  const query={$and:[ownerQuery(userId),{generated_at:{$gte:new Date(firstReadingMs-130*MINUTE).toISOString(),$lte:new Date(Math.min(now,lastReadingMs+3*MINUTE)).toISOString()}}]};
  let cursor,scored=0;
  do {
    const page=await sr.entities.GlucoseProjection.filter(query,{sort:'generated_at',limit:100,...(cursor?{cursor}:{})});
    const result=await scoreProjectionPage(sr,userId,page.items,now);
    scored+=result.scored;
    cursor=page.has_more?page.next_cursor:null;
  } while(cursor);
  return {scored};
}
export async function scoreRecentProjections(sr,userId,now=Date.now(),readingAt=null) {
  const end = readingAt ? ms(readingAt) : now;
  const projections=await readPages(sr.entities.GlucoseProjection,{$and:[ownerQuery(userId),{generated_at:{$gte:new Date(end-130*MINUTE).toISOString(),$lte:new Date(Math.min(now,end)).toISOString()}}]},'generated_at');
  return scoreProjectionPage(sr,userId,projections,now);
}