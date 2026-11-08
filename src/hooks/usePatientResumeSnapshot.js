import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import useResumeSnapshot from '@/hooks/useResumeSnapshot';
import { refreshSnapshotQueries } from '@/lib/resumeFreshness';

const ENTRIES = [
  ['latestGlucoseRows', ['latest-glucose']],
  ['glucoseReadings', ['glucose-readings', 'graph']],
  ['doses', ['insulin-doses']],
  ['carbEntries', ['carb-entries']],
  ['graphDosesSource', ['insulin-doses', 'graph']],
  ['graphCarbsSource', ['carb-entries', 'graph']],
];
const EMPTY = [];
export default function usePatientResumeSnapshot(userId, values, requestRefresh) {
  const client = useQueryClient();
  const keys = useMemo(() => ENTRIES.map(([, key]) => [...key, userId]), [userId]);
  const incoming = useMemo(() => ({ ...values }), Object.values(values));
  const read = () => ({
    ...Object.fromEntries(ENTRIES.map(([name], i) => [name, client.getQueryData(keys[i]) || EMPTY])),
    confirmedAt: client.getQueryState(keys[0])?.dataUpdatedAt || 0,
    verified: client.getQueryState(keys[0])?.status === 'success',
  });
  return useResumeSnapshot({
    scope: userId, incoming,
    sourceTime: incoming.latestGlucoseRows[0]?.recorded_at,
    cancel: () => Promise.all(keys.map(queryKey => client.cancelQueries({ queryKey, exact: true }))),
    refresh: (options) => {
      // Ingestion is independent; do not hold a saved reading behind Dexcom.
      requestRefresh(false).catch(() => {});
      return refreshSnapshotQueries(client, keys, read, options);
    },
  });
}