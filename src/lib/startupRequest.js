import { withStartupSignal } from '@/lib/startupAwait';
import startupTransport from '@/lib/startupTransport';
import { logStartup } from '@/lib/startupDiagnostics';

export const requestStatus = (error) => {
  const status = Number(error?.status ?? error?.response?.status ?? error?.originalError?.response?.status);
  return status >= 400 && status <= 599 ? status : null;
};
export function retryAfterMs(error, now = Date.now()) {
  const headers = error?.response?.headers || error?.originalError?.response?.headers;
  const raw = headers?.get?.('retry-after') ?? headers?.['retry-after'];
  if (raw == null) return requestStatus(error) === 429 ? 30_000 : 0;
  const seconds = Number(raw);
  return Math.max(0, Number.isFinite(seconds) ? seconds * 1000 : (Date.parse(raw) || now) - now);
}
export const retryableStartupError = (error) => {
  if (!error || error.name === 'AbortError' || error.consentCode || error.startupInvalid) return false;
  const status = requestStatus(error);
  return status == null || status === 408 || status === 429 || status >= 500;
};
export const startupCode = (error) => error?.name === 'AbortError' ? 'CANCELLED'
  : error?.startupCode === 'TIMEOUT' ? 'TIMEOUT' : error?.startupCode === 'OFFLINE' ? 'OFFLINE' : error?.startupInvalid || error?.consentCode ? 'INVALID_RESPONSE'
  : requestStatus(error) === 401 ? 'UNAUTHORIZED' : requestStatus(error) === 403 ? 'FORBIDDEN'
  : requestStatus(error) === 429 ? 'RATE_LIMITED' : requestStatus(error) >= 500 ? 'SERVER_ERROR' : 'UNAVAILABLE';
const cooldowns = new Map();
const wait = (ms, signal) => new Promise((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelled', 'AbortError')); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', abort); resolve(); }, ms);
  signal?.addEventListener('abort', abort, { once: true });
});

// QueryClient deduplicates by account/stage. Only retries reads; no writes or auth defaults.
export function runStartupCheck(key, stage, read, signal) {
  return withStartupSignal(deadlineSignal => executeStartupCheck(key, stage, read, deadlineSignal), signal);
}

export const confirmedSessionRejection = error => error?.httpResponse === true
  && [401, 403].includes(requestStatus(error))
  && (typeof navigator === 'undefined' || navigator.onLine !== false);

async function executeStartupCheck(key, stage, read, signal) {
  const started = Date.now();
  for (let retryCount = 0; ; retryCount++) {
    signal?.throwIfAborted();
    const cooldown = cooldowns.get(key);
    if (cooldown?.until > Date.now()) throw cooldown.error;
    cooldowns.delete(key);
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw Object.assign(new Error('Offline'), { startupCode: 'OFFLINE' });
      const result = await startupTransport(key, () => read(signal), signal);
      signal?.throwIfAborted();
      logStartup(stage, { outcome: 'ok', status: null, durationMs: Date.now() - started, retryCount });
      return result;
    } catch (error) {
      signal?.throwIfAborted();
      const delay = Math.max(1000 * 2 ** retryCount, retryAfterMs(error));
      if (requestStatus(error) === 429 || retryAfterMs(error) > 0) cooldowns.set(key, { until: Date.now() + delay, error });
      const retry = retryCount < 2 && retryableStartupError(error) && delay <= 60_000;
      logStartup(stage, { outcome: retry ? 'retry' : 'error', status: requestStatus(error), code: startupCode(error), durationMs: Date.now() - started, retryCount });
      if (!retry) throw error;
      await wait(delay, signal);
    }
  }
}