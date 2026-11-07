// A startup read gets 45 seconds of foreground time, not time spent suspended
// by iOS. Abort retires the consumer immediately; SDK transport may finish later.
export default function startupAwait(promise, signal, ms = 45_000) {
  return new Promise((resolve, reject) => {
    let timer, started, remaining = ms, done = false;
    const doc = typeof document === 'undefined' ? null : document;
    const finish = (fn, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      doc?.removeEventListener('visibilitychange', visibility);
      signal?.removeEventListener('abort', abort);
      fn(value);
    };
    const abort = () => finish(reject, new DOMException('Cancelled', 'AbortError'));
    const arm = () => {
      started = Date.now();
      timer = setTimeout(() => {
        if (doc?.visibilityState === 'hidden') { visibility(); return; }
        finish(reject, Object.assign(new Error('Startup deadline'), { startupCode: 'TIMEOUT' }));
      }, remaining);
    };
    const visibility = () => {
      if (doc?.visibilityState === 'hidden') {
        if (timer) remaining = Math.max(1, remaining - (Date.now() - started));
        clearTimeout(timer); timer = null;
      } else if (!timer) arm();
    };
    promise.then(value => finish(resolve, value), error => finish(reject, error));
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    doc?.addEventListener('visibilitychange', visibility);
    if (doc?.visibilityState !== 'hidden') arm();
  });
}