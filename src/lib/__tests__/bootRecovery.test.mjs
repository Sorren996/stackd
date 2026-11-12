import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { withStartupSignal } from '../startupAwait.js';
import { startupSessionRead, startupEntityRead } from '../startupHttp.js';
import { requestModule } from './startupTestModules.mjs';
const html = await readFile(new URL('../../../index.html', import.meta.url), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness(online = true, content = true, store = new Map()) {
  const elements = Object.fromEntries(['root', 'stackd-boot-panel', 'stackd-boot-title', 'stackd-boot-message', 'stackd-boot-retry'].map(id => [id, { hidden: true, textContent: '' }]));
  elements.root.firstElementChild = content ? {} : null;
  const listeners = {}, timers = new Map(), navigations = []; let id = 0, now = 100000;
  const add = (name, fn) => (listeners[name] ||= []).push(fn);
  const document = { visibilityState: 'visible', getElementById: key => elements[key], addEventListener: add };
  const navigator = { onLine: online };
  const window = { addEventListener: add, location: { origin: 'https://example.test', replace: url => navigations.push(url) } };
  const context = { window, document, navigator, URL, Promise, AbortController,
    Date: { now: () => now }, sessionStorage: { getItem: key => store.get(key), setItem: (key, value) => store.set(key, value) },
    setTimeout: (fn, ms) => { const key = ++id; timers.set(key, { fn, ms }); return key; }, clearTimeout: key => timers.delete(key),
    fetch: async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
  };
  vm.runInNewContext(script, context);
  return { window, document, navigator, elements, navigations, store, context,
    emit: async (name, event = {}) => { for (const fn of listeners[name] || []) fn(event); await flush(); },
    el: id => elements[`stackd-boot-${id}`],
    advance: ms => { now += ms; },
    fire: async ms => { for (const [key, timer] of [...timers]) if (timer.ms === ms && timers.delete(key)) timer.fn(); await flush(); },
  };
}

test('offline cold boot blocks app evaluation until online and keeps a cream panel', async () => {
  const h = harness(false, false); let released = false;
  h.window.__stackdBoot.online.then(() => { released = true; }); await flush();
  assert.equal(released, false); assert.equal(h.el('title').textContent, "You're offline");
  h.navigator.onLine = true; await h.emit('online'); assert.equal(released, true);
  assert.match(html, /#stackd-boot-panel[^}]*background: #f7f1e8/);
  assert.ok(html.indexOf(script) < html.indexOf('src="/src/main.jsx"'));
});
test('watchdog and global errors expose recovery without navigating', async () => {
  const h = harness(true, false); await h.fire(8000);
  assert.equal(h.el('title').textContent, "Stackd didn't start properly");
  h.window.__stackdBooted = true; h.window.__stackdBoot.painted(); assert.equal(h.el('panel').hidden, true);
  await h.emit('error', { target: h.window }); assert.equal(h.el('panel').hidden, false);
  await h.emit('unhandledrejection', { reason: new TypeError('Failed to fetch') });
  assert.equal(h.el('title').textContent, 'We could not reach Stackd just now');
  assert.equal(h.navigations.length, 0);
});
test('healthy resume leaves root and refresh UI alone', async () => {
  const h = harness(); let starts = 0; h.window.__stackdRestartBoot = () => { starts++; };
  h.window.__stackdBooted = true;
  await h.emit('pageshow'); await h.emit('online'); await h.emit('visibilitychange');
  assert.equal(starts, 0); assert.equal(h.el('panel').hidden, true);
});
test('blank resume attempts one restart then one reachable replacement per foreground', async () => {
  const store = new Map([['consent', 'yes'], ['settings', 'saved'], ['token', 'session'], ['selection', '6h']]);
  const before = [...store]; const h = harness(true, false, store); let starts = 0;
  h.window.__stackdRestartBoot = () => { starts++; }; h.window.__stackdBooted = true;
  await h.emit('pageshow'); await h.emit('online'); await h.emit('visibilitychange');
  assert.equal(starts, 1); await h.fire(3000);
  assert.deepEqual(h.navigations, ['https://example.test/']);
  await h.emit('pageshow'); await h.fire(3000); assert.equal(h.navigations.length, 1);
  for (const [key, value] of before) assert.equal(store.get(key), value);
  const next = harness(true, false, store); next.window.__stackdBooted = true;
  await next.emit('pageshow'); await next.fire(3000); assert.equal(next.navigations.length, 0);
});
test('failed reachability probe never navigates, and network Retry never reloads', async () => {
  const h = harness(true, false); h.window.__stackdBooted = true;
  h.context.fetch = async () => { throw new TypeError('Failed to fetch'); };
  await h.emit('pageshow'); await h.fire(3000);
  assert.equal(h.navigations.length, 0); assert.equal(h.el('retry').textContent, 'Try again');
  let retries = 0; h.window.__stackdRetryStartup = () => { retries++; };
  h.el('retry').onclick(); await flush(); assert.equal(retries, 1); assert.equal(h.navigations.length, 0);
});
test('stalled startup restarts once; successful repaint cancels last-resort navigation', async () => {
  const h = harness(); let starts = 0;
  h.window.__stackdBoot.pending('profile'); h.advance(11000);
  h.window.__stackdRestartBoot = () => { starts++; h.window.__stackdBoot.pending(null); h.window.__stackdBooted = true; h.window.__stackdBoot.painted(); };
  await h.emit('visibilitychange'); await h.emit('online'); await h.fire(3000);
  assert.equal(starts, 1); assert.equal(h.navigations.length, 0); assert.equal(h.el('panel').hidden, true);
});
test('pending timers and offline transitions never remove existing app content', async () => {
  const h = harness(); const child = h.elements.root.firstElementChild;
  h.window.__stackdBoot.pending('settings'); await h.fire(10500);
  assert.equal(h.el('retry').textContent, 'Try again');
  h.navigator.onLine = false; await h.emit('offline'); assert.equal(h.el('title').textContent, "You're offline");
  assert.equal(h.elements.root.firstElementChild, child);
});
test('startup transport is abortable and only actual reachable HTTP denials expire sessions', async () => {
  let signal;
  const client = { getConfig: () => ({ appId: 'app' }), fetchWithAuth: (_path, init) => { signal = init.signal; return new Promise(() => {}); } };
  await assert.rejects(withStartupSignal(s => startupSessionRead(client, s), undefined, 20), { startupCode: 'TIMEOUT' });
  assert.equal(signal.aborted, true);
  client.fetchWithAuth = async () => new Response('{}', { status: 401 });
  let denial; try { await startupSessionRead(client); } catch (error) { denial = error; }
  assert.equal(requestModule.confirmedSessionRejection(denial), true);
  assert.equal(requestModule.confirmedSessionRejection({ status: 401 }), false);
  assert.equal(requestModule.confirmedSessionRejection(new TypeError('Failed to fetch')), false);
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: false } });
  try { assert.equal(requestModule.confirmedSessionRejection(denial), false); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; }
});
test('entity startup requests retain owner filters and never follow redirects', async () => {
  let requested;
  const client = { getConfig: () => ({ appId: 'app' }), fetchWithAuth: async (path, init) => { requested = { path, init }; return Response.json([]); } };
  const controller = new AbortController();
  await startupEntityRead(client, 'UserSettings', { created_by_id: 'owner' }, '-created_date', 1, controller.signal);
  const url = new URL(requested.path, 'https://example.test');
  assert.deepEqual(JSON.parse(url.searchParams.get('q')), { created_by_id: 'owner' });
  assert.equal(requested.init.signal, controller.signal); assert.equal(requested.init.redirect, 'error');
});