import { useEffect, useMemo, useState } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useVisibilityRefresh } from '@/hooks/useVisibilityRefresh';

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
  useVisibilityRefresh({ onRevalidate: () => {
    setClock(v => ({ now: Date.now(), revision: v.revision + 1 }));
    // Independent requests; join existing work, never cancel usable history or
    // wait for Dexcom, the latest row, or another section before publishing data.
    keys.forEach(queryKey => { void client.refetchQueries({ queryKey, exact: true }, { cancelRefetch: false }); });
    requestRefresh(false).catch(() => {}); // Upstream ingestion never gates saved data.
  } });
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') setClock(v => ({ ...v, now: Date.now() }));
    }, 30000);
    return () => {
      clearInterval(timer);
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