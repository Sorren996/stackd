import test from 'node:test';
import assert from 'node:assert/strict';
import { createNotificationSaveQueue } from '../notifications/notificationSaveQueue.js';
import { mergeNotificationPatch } from '../notifications/notificationPresentation.js';
const initial = { master_enabled: true, categories: { low_glucose: false, urgent_low: false }, repeat_minutes: {} };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
test('optimistic feedback appears before transport settles; only affected keys are pending', async () => {
  const response = deferred(); let state;
  const queue = createNotificationSaveQueue(initial, () => response.promise, value => { state = value; });
  const done = queue.apply({ categories: { low_glucose: true } });
  assert.equal(state.draft.categories.low_glucose, true); assert.deepEqual(state.pendingKeys, ['categories.low_glucose']);
  response.resolve(mergeNotificationPatch(initial, { categories: { low_glucose: true } }));
  assert.equal((await done).ok, true); assert.equal(state.pending, false);
});
test('failure rolls back only failed intent, preserves later optimistic choice and shows error', async () => {
  const responses = [deferred(), deferred()]; let index = 0, state;
  const queue = createNotificationSaveQueue(initial, () => responses[index++].promise, value => { state = value; });
  const a = queue.apply({ categories: { low_glucose: true } });
  const b = queue.apply({ categories: { urgent_low: true } });
  responses[0].reject(new Error('Connection unavailable'));
  assert.equal((await a).ok, false);
  assert.equal(state.draft.categories.low_glucose, false); assert.equal(state.draft.categories.urgent_low, true); assert.match(state.error, /Connection/);
  responses[1].resolve(mergeNotificationPatch(initial, { categories: { urgent_low: true } })); await b;
  assert.equal(state.draft.categories.urgent_low, true);
});
test('rapid opposing intentions serialize; older confirmation never replaces newer intent; reload restores last confirmed state', async () => {
  const responses = [deferred(), deferred()]; const writes = []; let state;
  const queue = createNotificationSaveQueue(initial, patch => { writes.push(patch); return responses[writes.length - 1].promise; }, value => { state = value; });
  const a = queue.apply({ categories: { low_glucose: true } });
  const b = queue.apply({ categories: { low_glucose: false } });
  assert.equal(writes.length, 1); assert.equal(state.draft.categories.low_glucose, false);
  responses[0].resolve(mergeNotificationPatch(initial, { categories: { low_glucose: true } })); await a;
  assert.equal(writes.length, 2); assert.equal(state.draft.categories.low_glucose, false);
  queue.replace(mergeNotificationPatch(initial, { categories: { low_glucose: true } }));
  assert.equal(state.draft.categories.low_glucose, false);
  responses[1].resolve(initial); await b;
  const reloaded = createNotificationSaveQueue(state.draft, () => {}, () => {});
  assert.equal(reloaded.snapshot().draft.categories.low_glucose, false);
});
test('invalid save never reaches transport; an unsaved editor draft has no side effects', async () => {
  let calls = 0; const queue = createNotificationSaveQueue(initial, () => { calls++; }, () => {});
  const edit = mergeNotificationPatch(queue.snapshot().draft, { custom_low_mgdl: 100 });
  assert.equal(edit.custom_low_mgdl, 100); assert.equal(queue.snapshot().draft.custom_low_mgdl, undefined); assert.equal(calls, 0);
  assert.equal((await queue.apply({ custom_low_mgdl: 5 })).ok, false); assert.equal(calls, 0);
});
test('server denial is not presented as saved and keeps the confirmed off state', async () => {
  let state; const queue = createNotificationSaveQueue(initial, async () => initial, value => { state = value; });
  assert.equal((await queue.apply({ categories: { low_glucose: true } })).ok, false);
  assert.equal(state.draft.categories.low_glucose, false); assert.match(state.error, /permissions/);
});