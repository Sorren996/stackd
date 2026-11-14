import { useState } from 'react';
import { RISE_TAGS } from '@/lib/risePrompt';
export default function RisePromptCard({since,busy,error,onMeal,onTag,onRetry}) {
  const [expanded,setExpanded]=useState(false);
  return <section className="rise-prompt mx-3 mt-3 rounded-[14px] border bg-paper px-[18px] py-4 text-ink" aria-labelledby="rise-prompt-title">
    <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-ink-muted">Since {since}</p>
    <h3 id="rise-prompt-title" className="mt-2 font-display text-xl font-normal leading-tight">This rise doesn't match anything you logged.</h3>
    <p className="mt-2 text-xs leading-relaxed text-ink-muted">A little context can help your flow feel more familiar.</p>
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3">
      <button type="button" disabled={busy} onClick={onMeal} className="rounded-full bg-brand px-4 py-2 text-xs font-semibold text-brand-ink disabled:opacity-50">I ate and didn't log it</button>
      <button type="button" disabled={busy} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)} className="text-xs text-ink-muted underline-offset-4 hover:underline">Something else</button>
    </div>
    {expanded && <div className="mt-3 flex flex-wrap gap-2">{Object.entries(RISE_TAGS).map(([tag,label])=><button key={tag} type="button" disabled={busy} onClick={()=>onTag(tag)} className="rounded-full border border-ink/20 px-3 py-1.5 text-xs text-ink disabled:opacity-50">{label}</button>)}</div>}
    <button type="button" disabled={busy} onClick={()=>onTag('not_now')} className="mt-3 text-xs text-ink-muted underline-offset-4 hover:underline">Not now</button>
    {error && <p role="alert" className="mt-2 text-xs text-red-text">Your answer hasn't saved yet. <button type="button" disabled={busy} onClick={onRetry} className="underline">Try again</button></p>}
  </section>;
}