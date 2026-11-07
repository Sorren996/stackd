import { useCallback, useEffect, useRef, useState } from 'react';
import { retryableStartupError } from '@/lib/startupRequest';

// Mounted above the shell, so recovery also works while a startup gate is shown.
export default function useStartupRecovery(scope, error, retry) {
  const current = useRef({ scope, error, retry });
  current.current = { scope, error, retry };
  const flight = useRef(null);
  const mounted = useRef(false);
  const budget = useRef({ scope, count: 0, last: 0 });
  const [busy, setBusy] = useState(false);
  const retryNow = useCallback(() => {
    if (flight.current) return flight.current;
    if (!current.current.error) return Promise.resolve();
    setBusy(true);
    const work = Promise.resolve().then(() => current.current.retry()).finally(() => {
      if (flight.current === work) flight.current = null;
      if (mounted.current) setBusy(false);
    });
    flight.current = work;
    return work;
  }, []);
  useEffect(() => {
    mounted.current = true;
    const resume = () => {
      const state = current.current;
      if (document.visibilityState !== 'visible' || navigator.onLine === false || !retryableStartupError(state.error)) return;
      if (budget.current.scope !== state.scope) budget.current = { scope: state.scope, count: 0, last: 0 };
      const b = budget.current;
      if (flight.current || b.count >= 2 || Date.now() - b.last < 30_000) return;
      b.count++; b.last = Date.now();
      void retryNow();
    };
    window.addEventListener('online', resume);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      mounted.current = false;
      window.removeEventListener('online', resume);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [retryNow]);
  return { retryNow, busy };
}