// One wall-clock deadline, including retries. Abort reaches fetch and retires
// the consumer even if an older transport ignores cancellation on iOS.
export function withStartupSignal(operation, parentSignal, ms = 10_000) {
  const controller = new AbortController();
  const cancelled = () => controller.abort(parentSignal.reason || new DOMException('Cancelled', 'AbortError'));
  if (parentSignal?.aborted) cancelled();
  else parentSignal?.addEventListener('abort', cancelled, { once: true });
  const timer = setTimeout(() => controller.abort(Object.assign(new Error('Startup deadline'), { startupCode: 'TIMEOUT' })), ms);
  return new Promise((resolve, reject) => {
    const abort = () => reject(controller.signal.reason);
    controller.signal.addEventListener('abort', abort, { once: true });
    Promise.resolve().then(() => {
      controller.signal.throwIfAborted();
      return operation(controller.signal);
    }).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', abort));
    if (controller.signal.aborted) abort();
  }).finally(() => {
    clearTimeout(timer);
    parentSignal?.removeEventListener('abort', cancelled);
  });
}

export default function startupAwait(promise, signal, ms = 10_000) {
  return withStartupSignal(() => promise, signal, ms);
}