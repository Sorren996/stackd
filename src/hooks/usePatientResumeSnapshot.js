import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useVisibilityRefresh } from '@/hooks/useVisibilityRefresh';
import { logStartup } from '@/lib/startupDiagnostics';

const ENTRIES = [
  ['latestGlucoseRows', ['latest-glucose']],
  ['glucoseReadings', ['glucose-readings', 'graph']],
  ['doses', ['insulin-doses']],
  ['carbEntries', ['carb-entries']],
  ['graphDosesSource', ['insulin-doses', 'graph']],
  ['graphCarbsSource', ['carb-entries', 'graph']],
];
export default function usePatientResumeSnapshot(userId, values, requestRefresh) {
  const client = useQueryClient();
  const keys = useMemo(() => ENTRIES.map(([, key]) => [...key, userId]), [userId]);
  useIsFetching({ predicate: q => keys.some(key => JSON.stringify(key) === JSON.stringify(q.queryKey)) });
  const [clock, setClock] = useState(() => ({ now: Date.now(), revision: 0 }));
  // Only the newest revalidation round may report or publish; a round retired by
  // a later resume cannot describe the current screen.
  const cycleRef = useRef(0);

  const revalidate = (reason) => {
    const cycle = cycleRef.current + 1;
    cycleRef.current = cycle;
    const startedAt = Date.now();
    setClock(v => ({ now: Date.now(), revision: v.revision + 1 }));
    logStartup('resume', { code: String(reason || 'unknown').toUpperCase() });

    const work = keys.map(async (queryKey) => {
      // A query still marked in flight on resume began before the WebView was
      // suspended. Joining that promise can wait for ever, so it is retired and
      // re-read instead — one bounded read per section, no refresh loop.
      if (reason !== 'mount' && client.getQueryState(queryKey)?.fetchStatus === 'fetching') {
        await client.cancelQueries({ queryKey, exact: true });
      }
      return client.refetchQueries({ queryKey, exact: true }, { cancelRefetch: false });
    });

    // Each read is already bounded by its own queryFn, so this settles even when
    // the network never answers. Only the newest round reports its outcome.
    void Promise.allSettled(work).then((results) => {
      if (cycleRef.current !== cycle) return;
      const failed = results.some(r => r.status === 'rejected');
      logStartup('resume', {
        outcome: failed ? 'error' : 'ok',
        code: failed ? 'PARTIAL' : 'READY',
        durationMs: Date.now() - startedAt,
      });
    });

    // Upstream ingestion never gates saved data: this runs beside the reads.
    requestRefresh(false).catch(() => {});
  };

  useVisibilityRefresh({ onRevalidate: revalidate });

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setClock(v => ({ ...v, now: Date.now() }));
    }, 30000);
    return () => {
      clearInterval(timer);
      cycleRef.current += 1; // Retire an in-flight round on unmount/account change.
      keys.forEach(queryKey => { void client.cancelQueries({ queryKey, exact: true }); });
    };
  }, [client, keys]);

  const states = keys.map(key => client.getQueryState(key));
  const blocked = states.some(q => [401, 403].includes(q?.error?.status || q?.error?.response?.status));
  const snapshot = blocked ? { ...values, ...Object.fromEntries(ENTRIES.map(([name]) => [name, []])) } : values;
  const usableReading = [...snapshot.latestGlucoseRows, ...snapshot.glucoseReadings].some(r =>
    r.source !== 'system' && Number.isFinite(Number(r.value)) && Number(r.value) > 0 &&
    Number.isFinite(Date.parse(r.recorded_at)) && Date.parse(r.recorded_at) <= Date.now());
  return { snapshot, blocked, now: Math.max(clock.now, values.confirmedAt || 0), revision: clock.revision,
    pending: !blocked && !usableReading && states[0]?.fetchStatus === 'fetching',
    refreshing: states.slice(0, 2).some(q => q?.fetchStatus === 'fetching'),
    verified: !blocked && values.verified,
    secondaryVerified: !blocked && states.slice(2).every(q => q?.status === 'success'),
  };
}