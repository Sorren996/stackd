import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryClient, QueryObserver, onlineManager } from '@tanstack/react-query';
import startupAwait from '../startupAwait.js';
import startupTransport from '../startupTransport.js';
import { requestModule, startupModule } from './startupTestModules.mjs';
const { runStartupCheck, retryAfterMs, retryableStartupError } = requestModule;
const { loadStartupSetup } = await startupModule('startupSetup');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const error = status => Object.assign(new Error('SECRET payload'), { status });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

test('bootstrap and session revalidation share one read, then retry freshly', async () => {
  const { default: createSession } = await startupModule('startupSession');
  const d = deferred(); let calls = 0;
  const session = createSession({ auth: { me: () => { calls++; return calls === 1 ? d.promise : Promise.resolve({ id: 'a' }); } } });
  const first = session.read(); const second = session.read();
  assert.equal(first, second); d.resolve({ id: 'a' });
  await Promise.all([first, second]); assert.equal(calls, 1);
  await session.read(); assert.equal(calls, 2);
});
test('session retirement cannot apply a late identity or keep a rejected promise', async () => {
  const { default: createSession } = await startupModule('startupSession');
  const d = deferred(); let calls = 0;
  const session = createSession({ auth: { me: () => { calls++; return calls === 1 ? d.promise : Promise.resolve({ id: 'b' }); } } });
  const old = session.read(); const rejected = assert.rejects(old, { name: 'AbortError' });
  await Promise.resolve(); session.retire(); await rejected;
  assert.deepEqual(await session.read(), { id: 'b' });
  d.resolve({ id: 'a' }); await sleep(5);
  assert.deepEqual(await session.read(), { id: 'b' });
});
test('an expired wait window reattaches to a slow live transport without duplicate reads', async () => {
  const d = deferred(); let calls = 0;
  const read = () => { calls++; return d.promise; };
  await assert.rejects(startupAwait(startupTransport('slow-transport', read), undefined, 10), { startupCode: 'TIMEOUT' });
  const resumed = startupAwait(startupTransport('slow-transport', read), undefined, 50);
  d.resolve('late-valid'); assert.equal(await resumed, 'late-valid'); assert.equal(calls, 1);
});
test('offline failures are bounded and reconnect uses a fresh read', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  let calls = 0;
  try {
    const read = () => { calls++; return 'online'; };
    await assert.rejects(runStartupCheck('offline', 'test', read), { startupCode: 'OFFLINE' });
    assert.equal(calls, 0); globalThis.navigator.onLine = true;
    assert.equal(await runStartupCheck('offline', 'test', read), 'online'); assert.equal(calls, 1);
  } finally { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; }
});

test('Retry-After supports SDK originalError headers, seconds and HTTP dates', () => {
  assert.equal(retryAfterMs({ originalError: { response: { headers: { 'retry-after': '12' } } } }), 12000);
  const now = Date.parse('2026-01-01T00:00:00Z');
  assert.equal(retryAfterMs({ response: { headers: new Headers({ 'retry-after': 'Thu, 01 Jan 2026 00:00:20 GMT' }) } }, now), 20000);
  assert.equal(retryAfterMs(error(429)), 30000);
});
test('real denials and invalid results never retry', async () => {
  for (const e of [error(401), error(403), Object.assign(error(500), { startupInvalid: true })]) {
    let calls = 0;
    assert.equal(retryableStartupError(e), false);
    await assert.rejects(runStartupCheck('deny', 'test', () => { calls++; throw e; }));
    assert.equal(calls, 1);
  }
});
test('429 waits before a successful retry', async () => {
  let calls = 0; const started = Date.now();
  const result = await runStartupCheck('rate-short', 'test', () => {
    if (++calls === 1) throw Object.assign(error(429), { response: { headers: { 'retry-after': '1' } } });
    return 'ok';
  });
  assert.equal(result, 'ok'); assert.equal(calls, 2); assert.ok(Date.now() - started >= 990);
});
test('long Retry-After fails boundedly and suppresses premature manual attempts', async () => {
  let calls = 0;
  const read = () => { calls++; throw Object.assign(error(429), { response: { headers: { 'retry-after': '120' } } }); };
  await assert.rejects(runStartupCheck('rate-long', 'test', read));
  await assert.rejects(runStartupCheck('rate-long', 'test', read));
  assert.equal(calls, 1);
});
test('network/5xx retries are bounded and a subsequent call is fresh', async () => {
  let calls = 0;
  await assert.rejects(runStartupCheck('network', 'test', () => { calls++; throw error(503); }));
  assert.equal(calls, 3);
  assert.equal(await runStartupCheck('network', 'test', () => 'fresh'), 'fresh');
});
test('valid 13-second response is not discarded by the former 12-second deadline', async () => {
  let calls = 0;
  assert.equal(await runStartupCheck('slow', 'test', async () => { calls++; await sleep(13000); return 'verified'; }), 'verified');
  assert.equal(calls, 1);
});
test('background time does not consume the foreground deadline', async () => {
  const doc = new EventTarget(); doc.visibilityState = 'visible';
  const previous = globalThis.document; globalThis.document = doc;
  try {
    const d = deferred(); const pending = startupAwait(d.promise, undefined, 50);
    doc.visibilityState = 'hidden'; doc.dispatchEvent(new Event('visibilitychange'));
    await sleep(70);
    doc.visibilityState = 'visible'; doc.dispatchEvent(new Event('visibilitychange'));
    d.resolve('resumed'); assert.equal(await pending, 'resumed');
  } finally { if (previous) globalThis.document = previous; else delete globalThis.document; }
});
test('aborted consumer ignores late failure and cannot replace a fresh query result', async () => {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const d = deferred();
  const first = cache.fetchQuery({ queryKey: ['gate', 'a'], queryFn: ({ signal }) => runStartupCheck('cancel-a', 'test', () => d.promise, signal) });
  const rejection = assert.rejects(first);
  await Promise.resolve(); // Let the underlying read start before unmount/cancel.
  await cache.cancelQueries({ queryKey: ['gate', 'a'] }); await rejection;
  await cache.fetchQuery({ queryKey: ['gate', 'a'], queryFn: () => 'fresh' });
  d.reject(error(503)); await sleep(5);
  assert.equal(cache.getQueryData(['gate', 'a']), 'fresh');
  assert.equal(cache.getQueryData(['gate', 'b']), undefined); cache.clear();
});
test('overlapping retry requests join the same query and verified resume stays quiet', async () => {
  const cache = new QueryClient(); cache.mount();
  let calls = 0; const d = deferred();
  const observer = new QueryObserver(cache, { queryKey: ['gate'], queryFn: async () => { calls++; return d.promise; }, retry: false, staleTime: Infinity, refetchOnReconnect: false });
  const unsub = observer.subscribe(() => {});
  const one = observer.refetch({ cancelRefetch: false }); const two = observer.refetch({ cancelRefetch: false });
  d.resolve('verified'); await Promise.all([one, two]);
  onlineManager.setOnline(false); onlineManager.setOnline(true); await sleep(5);
  assert.equal(calls, 1); assert.equal(observer.getCurrentResult().data, 'verified');
  unsub(); cache.unmount(); cache.clear();
});
function setupClient(results) {
  const calls = [];
  const entities = Object.fromEntries(['UserSettings', 'GlucoseReading', 'CarbEntry', 'InsulinDose'].map(name => [name, {
    filter: async () => { calls.push(name); const value = results[name]; if (value instanceof Error) throw value; return value ?? []; },
    create: () => { throw new Error('No writes allowed'); }, update: () => { throw new Error('No writes allowed'); },
  }]));
  return { entities, calls };
}
test('confirmed setup reads settings once; new user still needs onboarding', async () => {
  const established = setupClient({ UserSettings: [{ id: 's', created_by_id: 'a', onboarding_completed: true, settings_confirmed: false }] });
  const result = await loadStartupSetup(established, 'a');
  assert.equal(result.needsOnboarding, false); assert.equal(result.settings.settings_confirmed, false);
  assert.deepEqual(established.calls, ['UserSettings']);
  const fresh = setupClient({}); assert.equal((await loadStartupSetup(fresh, 'a')).needsOnboarding, true);
  assert.deepEqual(fresh.calls, ['UserSettings', 'GlucoseReading', 'CarbEntry', 'InsulinDose']);
});
test('legacy eligibility remains read-only and short circuits unnecessary requests', async () => {
  const client = setupClient({ GlucoseReading: [{ user_id: 'a' }], CarbEntry: error(503) });
  assert.equal((await loadStartupSetup(client, 'a')).needsOnboarding, false);
  assert.deepEqual(client.calls, ['UserSettings', 'GlucoseReading']);
});
test('unknown/denied setup never becomes completed or new-user state', async () => {
  await assert.rejects(loadStartupSetup(setupClient({ UserSettings: error(403) }), 'a'), { status: 403 });
  await assert.rejects(loadStartupSetup(setupClient({ UserSettings: {} }), 'a'), { startupInvalid: true });
  await assert.rejects(loadStartupSetup(setupClient({ UserSettings: [{ created_by_id: 'b' }] }), 'a'), { startupInvalid: true });
});