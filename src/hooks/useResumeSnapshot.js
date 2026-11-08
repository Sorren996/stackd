import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { useVisibilityRefresh } from '@/hooks/useVisibilityRefresh';
import { needsResumeCover, RESUME_DEADLINE_MS } from '@/lib/resumeFreshness';

// Holds presentation, not authorization. All reads still use the existing RLS
// and shared-view endpoint. A generation retires work on hide/unmount/switch.
export default function useResumeSnapshot({ scope, incoming, refresh, cancel, sourceTime }) {
  const rootRef = useRef(null);
  const options = useRef(null);
  options.current = { scope, incoming, refresh, cancel, sourceTime };
  const control = useRef({ generation: 0, flight: null, hiddenAt: 0, lastStart: 0, held: true });
  const [view, setView] = useState(() => ({ scope, snapshot: incoming, pending: true,
    verified: false, secondaryVerified: false, now: Date.now(), revision: 0, settledAt: 0 }));
  const viewRef = useRef(view);
  viewRef.current = view;

  const background = () => {
    const c = control.current;
    if (c.hiddenAt) return;
    c.hiddenAt = Date.now();
    c.held = true;
    // Prepare the DOM before suspension. OS app-switcher screenshots remain OS-owned.
    if (rootRef.current) rootRef.current.dataset.freshness = 'updating';
    setView(v => ({ ...v, pending: true }));
  };
  const resume = () => {
    const c = control.current;
    if (c.flight) {
      if (Date.now() - c.lastStart <= RESUME_DEADLINE_MS) {
        // Rapid hide/show cycles join the same work, not a second transport.
        c.hiddenAt = 0;
        return;
      }
      // Timers may have been suspended by the OS. Retire that old cycle now.
      c.controller?.abort();
      options.current.cancel?.();
      c.flight = null;
    }
    if (!c.hiddenAt && Date.now() - c.lastStart < 500) return;
    const o = options.current;
    const generation = ++c.generation;
    const controller = new AbortController();
    c.controller = controller;
    const now = Date.now();
    const pending = needsResumeCover({ sourceTime: o.sourceTime, hiddenAt: c.hiddenAt,
      confirmedAt: viewRef.current.settledAt, now });
    c.hiddenAt = 0;
    c.lastStart = now;
    c.held = true;
    if (rootRef.current) rootRef.current.dataset.freshness = pending ? 'updating' : 'ready';
    setView(v => ({ ...v, pending }));
    c.flight = Promise.resolve().then(() => o.refresh({ cold: viewRef.current.revision === 0, signal: controller.signal }))
      .catch(() => ({ snapshot: options.current.incoming, verified: false, secondaryVerified: false }))
      .then(result => {
        if (generation !== c.generation || o.scope !== options.current.scope) return;
        c.flight = null;
        if (c.hiddenAt) return; // Keep the prepared cover until foreground revalidation.
        c.held = false;
        setView(v => ({ ...v, ...result, scope: o.scope, pending: false,
          now: Date.now(), settledAt: Date.now(), revision: v.revision + 1 }));
      });
  };
  useVisibilityRefresh({ onRevalidate: resume, onBackground: background });
  useLayoutEffect(() => {
    const c = control.current;
    if (!c.held && incoming !== view.snapshot && incoming.confirmedAt >= (view.snapshot?.confirmedAt || 0)) {
      setView(v => ({ ...v, snapshot: incoming,
        verified: incoming.confirmedAt > v.settledAt ? incoming.verified !== false : v.verified }));
    }
  }, [incoming, view.snapshot]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !control.current.held) setView(v => ({ ...v, now: Date.now() }));
    }, 30000);
    return () => { clearInterval(timer); control.current.generation += 1; control.current.controller?.abort(); options.current.cancel?.(); };
  }, [scope]);
  return { ...view, rootRef, snapshot: view.scope === scope ? view.snapshot : incoming,
    pending: view.scope !== scope || view.pending };
}