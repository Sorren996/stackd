import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startupModule } from './startupTestModules.mjs';
import { QueryClient } from '@tanstack/react-query';

const { loadAcknowledgments, acknowledgmentKey, onboardingKey, retryConsent, consentFailureCode } = await startupModule('consentStartup');
const record = { id: 'ack-a', created_by_id: 'account-a', terms_accepted: true };
const httpError = (status) => Object.assign(new Error('private payload must not be logged'), { status });
function mock(answers, identity = { id: 'account-a' }) {
  const calls = [];
  let authCalls = 0;
  return { calls, get authCalls() { return authCalls; },
    entities: { UserAcknowledgment: { filter: async (...args) => {
      calls.push(args);
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      return answer;
    } } },
    auth: { me: async () => { authCalls++; if (identity instanceof Error) throw identity; return identity; } },
  };
}

test('existing acknowledgment is returned unchanged through an explicit immutable-owner filter', async () => {
  const client = mock([[record]]);
  assert.deepEqual(await loadAcknowledgments(client, 'account-a'), [record]);
  assert.deepEqual(client.calls, [[{ created_by_id: 'account-a' }, '-accepted_at', 1]]);
});

test('latest consent and full history never share differently sized responses', async () => {
  let calls = 0;
  const client = { entities: { UserAcknowledgment: { filter: async (_query, _sort, limit) => {
    calls++; return limit === 1 ? [record] : [record, { ...record, id: 'older' }];
  } } } };
  const [latest, history] = await Promise.all([loadAcknowledgments(client, 'account-a'), loadAcknowledgments(client, 'account-a', 50)]);
  assert.equal(latest.length, 1); assert.equal(history.length, 2); assert.equal(calls, 2);
});

test('new account empty result remains a successful empty result', async () => {
  assert.deepEqual(await loadAcknowledgments(mock([[]]), 'account-a'), []);
});

test('malformed response is an error, never invented empty consent', async () => {
  await assert.rejects(loadAcknowledgments(mock([{ items: [] }]), 'account-a'), { consentCode: 'INVALID_RESPONSE' });
});

test('another account record is rejected rather than rendered or treated as empty', async () => {
  await assert.rejects(loadAcknowledgments(mock([[{ ...record, created_by_id: 'account-b' }]]), 'account-a'), { consentCode: 'OWNER_MISMATCH' });
});

test('missing identity cannot issue any consent request', async () => {
  const client = mock([[]]);
  await assert.rejects(loadAcknowledgments(client, null), { consentCode: 'SESSION_REQUIRED' });
  assert.equal(client.calls.length, 0);
});

test('resource 401 is not blindly retried or turned into empty consent', async () => {
  const client = mock([httpError(401)]);
  await assert.rejects(loadAcknowledgments(client, 'account-a'), { status: 401 });
  assert.equal(client.calls.length, 1);
  assert.equal(client.authCalls, 0); // Root session coordinator handles revalidation.
});

test('resource 403 does not request authentication or automatically retry', async () => {
  const client = mock([httpError(403)]);
  await assert.rejects(loadAcknowledgments(client, 'account-a'), { status: 403 });
  assert.equal(client.authCalls, 0);
  assert.equal(retryConsent, false); // The shared runner owns retry/backoff, not React Query.
});

test('failed lookup can be explicitly refetched with the same scoped key', async () => {
  const client = mock([httpError(503), httpError(503), httpError(503), [record]]);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const options = { queryKey: acknowledgmentKey('account-a'), queryFn: () => loadAcknowledgments(client, 'account-a') };
  await assert.rejects(cache.fetchQuery(options), { status: 503 });
  assert.deepEqual(await cache.fetchQuery(options), [record]);
  cache.clear();
});

test('consent and onboarding keys separate accounts in the real query cache', async () => {
  const cache = new QueryClient();
  cache.setQueryData(acknowledgmentKey('account-a'), [record]);
  cache.setQueryData(onboardingKey('account-a'), { needsOnboarding: false });
  assert.equal(cache.getQueryData(acknowledgmentKey('account-b')), undefined);
  assert.equal(cache.getQueryData(onboardingKey('account-b')), undefined);
  cache.clear();
});

test('diagnostics contain only fixed operation, classified code and status, no payload or identity', async () => {
  const lines = [];
  const original = console.log;
  console.log = (line) => lines.push(line);
  try {
    const error = httpError(503);
    error.data = { token: 'SECRET', email: 'private@example.test' };
    await assert.rejects(loadAcknowledgments(mock([error, error, error]), 'account-a'));
    const diagnostic = JSON.parse(lines.at(-1));
    assert.equal(diagnostic.stage, 'consent');
    assert.equal(diagnostic.retryCount, 2);
    assert.equal(diagnostic.code, 'SERVER_ERROR');
    assert.equal(diagnostic.status, 503);
    assert.equal(/SECRET|private|account-a|token|email/.test(lines.join('')), false);
    assert.equal(consentFailureCode({ code: 'PRIVATE_RAW_ERROR' }), 'NETWORK_OR_UNAVAILABLE');
  } finally { console.log = original; }
});