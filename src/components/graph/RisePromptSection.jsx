import { useState } from 'react';
import { format } from 'date-fns';
import useRisePrompt from '@/hooks/useRisePrompt';
import RisePromptCard from '@/components/graph/RisePromptCard';
import LogMealForm from '@/components/forms/LogMealForm';
import { RISE_TAGS } from '@/lib/risePrompt';
export default function RisePromptSection(props) {
  const prompt=useRisePrompt(props), [mealEvent,setMealEvent]=useState(null);
  return <>
    {prompt.kind==='memory' && <p className="mx-3 mt-3 text-xs leading-relaxed text-ink-muted">You’ve often marked rises around this time as “{RISE_TAGS[prompt.tag]?.toLowerCase()}”.</p>}
    {prompt.kind==='prompt' && <RisePromptCard since={format(new Date(prompt.event.window_start),'h:mm a')} busy={prompt.busy||!prompt.canRespond} error={prompt.error} onMeal={()=>setMealEvent(prompt.event)} onTag={prompt.respond} onRetry={prompt.retry}/>}
    {prompt.beginError && <p role="alert" className="mx-3 mt-3 text-xs text-ink-muted">We couldn’t open this check-in just now. <button onClick={prompt.retryBegin} className="underline">Try again</button></p>}
    {prompt.error && prompt.kind!=='prompt' && <p role="alert" className="mx-3 mt-3 text-xs text-ink-muted">Your check-in hasn’t saved yet. <button disabled={prompt.busy} onClick={prompt.retry} className="underline">Try again</button></p>}
    {mealEvent && <LogMealForm open onClose={()=>setMealEvent(null)} initialCarbs={mealEvent.estimate_carbs} initialTime={mealEvent.window_start} estimateNote={mealEvent.estimate_carbs ? 'This amount is an estimate. Adjust it to match what you ate.' : null} onSaved={meal=>prompt.respond('meal',meal.id)}/>}
  </>;
}