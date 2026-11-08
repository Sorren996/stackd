// Presentation/request bounds only; never changes sensor cadence or alert rules.
export const RESUME_DEADLINE_MS = 8000;
export const SECONDARY_GRACE_MS = 1500;
export function needsResumeCover({ sourceTime, hiddenAt, confirmedAt, now = Date.now() }) {
  const time = Date.parse(sourceTime);
  return !confirmedAt || !Number.isFinite(time) || time > now || now - time >= 8 * 60000 ||
    (hiddenAt > 0 && now - hiddenAt >= 60000);
}

// Even when the SDK transport cannot abort, its late result cannot reach a cache.
export function boundedRead(read, signal, ms = RESUME_DEADLINE_MS) {
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (callback, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      callback(value);
    };
    const abort = () => finish(reject, new DOMException('Retired request', 'AbortError'));
    const timer = setTimeout(() => finish(reject, new Error('Refresh timed out')), ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) return abort();
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return finish(reject, new Error('Offline'));
    }
    Promise.resolve().then(() => done ? undefined : read()).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

export async function refreshSnapshotQueries(client, keys, read, { cold = false, signal } = {}) {
  const check = () => { if (signal?.aborted) throw new DOMException('Retired refresh', 'AbortError'); };
  check();
  // On cold mount, join the queries React Query has just started.
  if (!cold) await Promise.all(keys.map(queryKey => client.cancelQueries({ queryKey, exact: true })));
  check();
  const startedAt = Date.now();
  const requests = keys.map(queryKey => client.refetchQueries(
    { queryKey, exact: true, type: 'all' }, { cancelRefetch: false, throwOnError: true }
  ));
  // Observe rejections immediately. Latest glucose is never held indefinitely
  // behind a slow graph or log request; retain those sections' previous data.
  const secondary = Promise.allSettled(requests.slice(1));
  await Promise.allSettled(requests.slice(0, 1));
  let timer;
  await Promise.race([secondary, new Promise(resolve => { timer = setTimeout(resolve, SECONDARY_GRACE_MS); })]);
  clearTimeout(timer);
  check(); // A retired cycle cannot cancel or commit a newer cycle's requests.
  const complete = keys.map(queryKey => {
    const q = client.getQueryState(queryKey);
    return q?.status === 'success' && q.fetchStatus === 'idle' && q.dataUpdatedAt >= startedAt;
  });
  await Promise.all(keys.map(queryKey => client.cancelQueries({ queryKey, exact: true })));
  return { snapshot: read(), verified: complete[0], secondaryVerified: complete.slice(1).every(Boolean) };
}