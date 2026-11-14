import { base44 } from '@/api/base44Client';
export const riseContextKey=userId=>['rise-prompt-context',userId];
export function localDayKey(at,zone='UTC') {
  return new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(at);
}
export async function loadRiseContext(userId,zone) {
  const now=Date.now(), owner={created_by_id:userId};
  const [recent,todayCount,patterns,preferences]=await Promise.all([
    base44.entities.RiseContext.filter({...owner,created_date:{$gte:new Date(now-24*3600000).toISOString()}},{sort:'-created_date',limit:80}),
    base44.entities.RiseContext.count({...owner,calendar_day:localDayKey(now,zone)}),
    base44.entities.RiseContext.aggregate({query:{...owner,responded_at:{$gte:new Date(now-14*86400000).toISOString()},tag:{$nin:['pending','meal']}},groupBy:['tag','time_bucket'],limit:80}),
    base44.entities.NotificationPreference.filter(owner,{sort:'-updated_date',limit:1}),
  ]);
  return {recent:recent.items,todayCount,patterns:patterns.rows,preferences:preferences.items[0]||{}};
}
export async function beginRiseContext(userId,event,bucket,zone) {
  const {estimate_carbs,...fields}=event;
  return base44.entities.RiseContext.create({...fields,time_bucket:bucket,calendar_day:localDayKey(Date.now(),zone),event_key:`${userId}:${event.window_start}`,tag:'pending',meal_confirmed:false});
}
export async function answerRiseContext(id,tag,mealId) {
  return base44.entities.RiseContext.update(id,{tag,meal_confirmed:tag==='meal',...(mealId?{meal_id:mealId}:{}),responded_at:new Date().toISOString()});
}