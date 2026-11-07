import test from 'node:test';
import assert from 'node:assert/strict';

import { dispatchNotification, PUSH_MESSAGE_FIELDS } from '../notificationDispatch.ts';
import { runTestPushNotification, TEST_PUSH_MESSAGE, TEST_PUSH_TITLE } from '../testPushNotification.ts';

// Serialized payloads only: every transport here is a mock, so nothing is sent
// to a real device and no production push is generated.

const NOW = Date.parse('2026-11-06T12:00:00.000Z');

function dispatchDeps(sends) {
  return {
    claim: async () => true,
    createRecord: async (row) => ({ id: 'delivery-1', ...row }),
    updateRecord: async () => {},
    recheck: async () => ({ ok: true }),
    send: async (message) => { sends.push(message); return { success: true }; },
    nowMs: NOW,
    absoluteUrl: (path) => `https://stackdinsight.base44.app${path}`,
  };
}

function alertInput(overrides = {}) {
  return {
    enabled: true,
    category: 'custom_low',
    ownerUserId: 'owner',
    recipientUserId: 'recipient',
    sharedAccessId: null,
    audience: 'self',
    episodeKey: 'low-stream:v1:dexcom_share:1',
    eventKey: 'push:owner:recipient:self:low-stream:v1:dexcom_share:1',
    occurredAtMs: NOW - 60_000,
    expiresAtMs: NOW + 5 * 60_000,
    copy: { title: 'Low glucose: 95 mg/dL', body: 'Your glucose is below 100 mg/dL.' },
    detailShown: true,
    destination: '/',
    quiet: null,
    permissionVersion: null,
    ...overrides,
  };
}

test('an automatic alert sends exactly the documented push fields, and no sound key at all', async () => {
  const sends = [];
  await dispatchNotification(alertInput(), dispatchDeps(sends));
  assert.equal(sends.length, 1);
  assert.deepEqual(Object.keys(sends[0]).sort(), [...PUSH_MESSAGE_FIELDS].sort());
  // The integration schema has no sound/interruption/APNs field, so inventing
  // one would be silently ignored by the provider — never do it.
  for (const key of ['sound', 'aps', 'apns', 'interruptionLevel', 'critical', 'vibrate']) {
    assert.equal(key in sends[0], false, `${key} is not a supported field`);
  }
  assert.equal(sends[0].action_url, 'https://stackdinsight.base44.app/');
});

test('the test push uses the same documented field set as a real alert', async () => {
  const sends = [];
  const base44 = {
    asServiceRole: { integrations: { Core: { SendPushNotification: async (message) => { sends.push(message); } } } },
  };
  const result = await runTestPushNotification(base44, { id: 'admin-1', role: 'admin' });
  assert.equal(result.status, 200);
  assert.deepEqual(
    Object.keys(sends[0]).sort(),
    PUSH_MESSAGE_FIELDS.slice().sort(),
    'the test push is field-for-field identical to a real alert, action link included'
  );
  assert.equal(sends[0].action_url, 'https://stackdinsight.base44.app/');
  assert.equal(sends[0].title, TEST_PUSH_TITLE);
  assert.equal(sends[0].content, TEST_PUSH_MESSAGE);
  for (const key of ['sound', 'aps', 'apns', 'interruptionLevel', 'critical']) assert.equal(key in sends[0], false);
});

test('a non-admin cannot reach the test push transport at all', async () => {
  const sends = [];
  const base44 = {
    asServiceRole: { integrations: { Core: { SendPushNotification: async (message) => { sends.push(message); } } } },
  };
  const result = await runTestPushNotification(base44, { id: 'user-1', role: 'user' });
  assert.equal(result.status, 403);
  assert.equal(sends.length, 0);
});