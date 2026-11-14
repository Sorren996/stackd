import { canonicalGlucoseSeries } from '@/lib/glucoseSeries';
import { mealInPlayWindowMinutes } from '@/lib/mealInPlayWindow';
import { isBasalInsulinType, getDoseIOB } from '@/lib/insulinPharmacology';
export const RISE_TAGS = {stress:'Stress',illness:'Illness',poor_sleep:'Poor sleep',caffeine:'Caffeine',site_sensor_change:'Site or sensor change',coming_up_from_low:'Coming up from a low',nothing:'Nothing'};
export function promptQuiet(preferences, now) {
  if (!preferences?.quiet_hours_enabled) return false;
  const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:preferences.quiet_timezone||'UTC'}).format(now));
  const start=preferences.quiet_start_hour, end=preferences.quiet_end_hour;
  if (start==null || end==null) return true;
  return start===end || (start<end ? hour>=start && hour<end : hour>=start || hour<end);
}
export function detectUnloggedRise(readings, meals, doses, settings, now) {
  const points=canonicalGlucoseSeries(readings,{cgmOnly:true}).filter(r=>!r.is_interpolated && r.time<=now+120000);
  const end=points.at(-1); if(!end || now-end.time>10*60000) return null;
  if(meals.some(m=>{const t=Date.parse(m.consumed_at);return t<=end.time && (end.time-t<=4*3600000 || t+mealInPlayWindowMinutes(m.carbs)*60000>end.time);})) return null;
  let start=null;
  for(const [minutes,rise] of [[20,25],[60,40]]) {
    for(const first of points.filter(r=>r.time>=end.time-63*60000)) {
      const window=points.filter(r=>r.time>=first.time && r.time<=end.time);
      const finish=window.find(r=>r.time-first.time>=(minutes-3)*60000 && r.time-first.time<=(minutes+3)*60000 && r.value-first.value>=rise);
      if(!finish || end.value<Math.max(...window.map(r=>r.value))-5) continue;
      if(window.some((r,i)=>i && r.time-window[i-1].time>8*60000)) continue;
      start=first; break;
    }
    if(start) break;
  }
  if(!start) return null;
  const bolus=doses.filter(d=>!isBasalInsulinType(d.insulin_type) && Date.parse(d.administered_at)>=start.time-45*60000 && Date.parse(d.administered_at)<=end.time).sort((a,b)=>Date.parse(b.administered_at)-Date.parse(a.administered_at))[0];
  const ratio=Number(settings?.meal_insulin_units_per_5g);
  const estimate=settings?.settings_confirmed===true && bolus && ratio>0 ? Math.round((Number(bolus.units)*5/ratio)/5)*5 : null;
  return {window_start:new Date(start.time).toISOString(),window_end:new Date(end.sourceTime??end.time).toISOString(),rise_magnitude:end.value-start.value,peak_value:Math.max(...points.filter(r=>r.time>=start.time).map(r=>r.value)),active_bolus_units:doses.reduce((sum,d)=>sum+(isBasalInsulinType(d.insulin_type)?0:getDoseIOB(d,end.time)),0),estimate_carbs:estimate>0?estimate:null};
}
export function promptDecision(event, context, now, zone) {
  if(!event || !context || promptQuiet(context.preferences,now)) return null;
  const hour=Number(new Intl.DateTimeFormat('en-GB',{hour:'2-digit',hourCycle:'h23',timeZone:zone||'UTC'}).format(Date.parse(event.window_start)));
  const bucket=Math.floor(hour/3), matches=context.patterns.filter(p=>p.time_bucket===bucket);
  const pattern=matches.find(p=>p.tag!=='not_now' && p.count>=3);
  if(pattern) return {kind:'memory',tag:pattern.tag,bucket};
  if(matches.some(p=>p.tag==='not_now' && p.count>=3)) return null;
  const previous=context.recent.find(r=>Date.parse(r.window_start)<=Date.parse(event.window_end) && Date.parse(r.window_end)>=Date.parse(event.window_start));
  if(previous) return previous.tag==='pending' ? {kind:'prompt',id:previous.id,bucket} : null;
  if(context.todayCount>=3 || context.recent.some(r=>now-Date.parse(r.created_date)<3*3600000) || context.recent.some(r=>r.tag==='not_now' && now-Date.parse(r.responded_at)<3600000)) return null;
  return {kind:'prompt',bucket};
}