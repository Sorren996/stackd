const pending = new Map();

// SDK read methods do not expose AbortSignal. Keep a timed-out but still-live
// transport shared across retry windows, instead of sending duplicate requests.
// Never retain a settled promise. Cancellation retires its slot, so an account
// change cannot attach to the prior identity's auth read.
export default function startupTransport(key, read, signal) {
  if (pending.has(key)) return pending.get(key);
  const work = Promise.resolve().then(() => { signal?.throwIfAborted(); return read(); });
  const retire = () => { if (pending.get(key) === work) pending.delete(key); };
  const cleanup = () => { retire(); signal?.removeEventListener('abort', retire); };
  pending.set(key, work);
  signal?.addEventListener('abort', retire, { once: true });
  work.then(cleanup, cleanup);
  return work;
}