const pending = new Map();

// Share in-flight startup reads only. Deadlines abort their fetch and retire
// this slot immediately, so Try again cannot reattach to a hung transport.
// Never retain a settled promise or share one across account changes.
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