import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import useAccessProfile from '@/hooks/useAccessProfile';
import { detectUnloggedRise, promptDecision, promptQuiet } from '@/lib/risePrompt';
import { riseContextKey, loadRiseContext, beginRiseContext, answerRiseContext } from '@/lib/risePromptStore';
import { markProjectionInputsChanged } from '@/lib/projection/projectionStaleness';
export default function useRisePrompt({readings,meals,doses,now,ready}) {
  const {user}=useAuth(), profile=useAccessProfile(), client=useQueryClient();
  const {data:settings}=useQuery({queryKey:['user-settings'],enabled:false});
  const {data:notificationCenter}=useQuery({queryKey:['notification-center',user?.id],enabled:false});
  const allowed=ready && profile.resolved && profile.mode==='patient' && Boolean(user?.id);
  const context=useQuery({queryKey:riseContextKey(user?.id),queryFn:()=>loadRiseContext(user.id,settings?.timezone),enabled:allowed,staleTime:60000,refetchInterval:false});
  const preferences=notificationCenter?.personal || context.data?.preferences;
  const detected=useMemo(()=>allowed?detectUnloggedRise(readings,meals,doses,settings,now):null,[allowed,readings,meals,doses,settings,now]);
  const [active,setActive]=useState(null), [closed,setClosed]=useState(null);
  const pending=useRef(null), attempt=useRef(null);
  const decision=promptDecision(detected,context.data?{...context.data,preferences}:null,now,settings?.timezone);
  const overlapped=closed && detected && Date.parse(detected.window_start)<=Date.parse(closed.window_end) && Date.parse(detected.window_end)>=Date.parse(closed.window_start);
  const begin=useMutation({mutationFn:({event,bucket})=>beginRiseContext(user.id,event,bucket,settings?.timezone),onSuccess:(row,args)=>{setActive({row,event:args.event});client.invalidateQueries({queryKey:riseContextKey(user.id)});}});
  useEffect(()=>{
    if(!allowed || !detected || overlapped || decision?.kind!=='prompt' || active || pending.current) return;
    if(decision.id) {const row=context.data.recent.find(r=>r.id===decision.id);setActive({row,event:{...detected,window_start:row.window_start,window_end:row.window_end}});return;}
    const args={event:detected,bucket:decision.bucket}; pending.current=args;
    begin.mutate(args);
  },[allowed,detected,overlapped,decision?.kind,decision?.id,active,context.data]);
  const answer=useMutation({mutationFn:({tag,mealId})=>answerRiseContext(active.row.id,tag,mealId),onSuccess:(_row,args)=>{setClosed(active.event);setActive(null);pending.current=null;client.invalidateQueries({queryKey:riseContextKey(user.id)});if(args.tag!=='meal' && args.tag!=='not_now') markProjectionInputsChanged();}});
  const respond=(tag,mealId)=>{attempt.current={tag,mealId};answer.mutate(attempt.current);};
  const quiet=promptQuiet(preferences,now);
  return {event:active?.event||detected,kind:!allowed||quiet||overlapped?null:decision?.kind==='memory'?'memory':active&&detected?'prompt':null,tag:decision?.tag,
    busy:answer.isPending, error:answer.isError, beginError:allowed&&!quiet&&begin.isError, retryBegin:()=>begin.mutate(pending.current),
    retry:()=>answer.mutate(attempt.current),respond,canRespond:Boolean(active?.row?.id)};
}