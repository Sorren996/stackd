import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRecipient } from '../notificationRecipient.ts';
const now = Date.now();
const readings = [{ id: 'reading', source: 'dexcom_share', value: 54, recorded_at: new Date(now).toISOString() }];
const prefs = { id: 'prefs', user_id: 'owner', master_enabled: true, categories: { custom_low: true, below_range: true, urgent_low: true }, custom_low_mgdl: 100, show_health_details: false, updated_date: 'unchanged' };
const settings = { target_range_low: 70, target_range_high: 180, glucose_units: 'mg/dL' };
function fixture({ follower = false, beforeRecheck, failSend = false } = {}) {
  const relationship = follower ? { id: 'access', status: 'active', sharer_user_id: 'owner', follower_user_id: 'follower', scopes: { glucose: true }, permission_version: 1, push: { custom_low: true, below_range: true, urgent_low: true } } : null;
  const preferences = { ...structuredClone(prefs), ...(follower ? { user_id: 'follower', shared_access_id: 'access' } : {}) };
  const ledger = { id: 'ledger', user_id: preferences.user_id, scope_key: follower ? 'follow:access' : 'self', claimed_keys: [] };
  const deliveries = [], sends = [];
  const sr = { entities: {
    NotificationLedger: {
      filter: async query => ({ items: query.user_id === ledger.user_id && query.scope_key === ledger.scope_key ? [structuredClone(ledger)] : [] }),
      updateMany: async (query, update) => {
        if (query.user_id && query.user_id !== ledger.user_id) return { updated: 0 };
        if ('episode_revision' in query) {
          const v = query.episode_revision;
          if (v == null ? ledger.episode_revision != null : v !== ledger.episode_revision) return { updated: 0 };
          Object.assign(ledger, structuredClone(update.$set));
          return { updated: 1 };
        }
        const key = query.claimed_keys?.$nin?.[0];
        if (key) {
          if (ledger.claimed_keys.includes(key)) return { updated: 0 };
          assert.equal(update.$push.claimed_keys, key, 'claim appends a scalar, never a nested array');
          ledger.claimed_keys.push(key);
          return { updated: 1 };
        }
        return { updated: 0 };
      },
    },
    NotificationPreference: { get: async () => { beforeRecheck?.(preferences, relationship); return preferences; } },
    FollowNotificationPreference: { get: async () => { beforeRecheck?.(preferences, relationship); return preferences; } },
    SharedAccess: { get: async () => relationship },
    NotificationDelivery: { create: async row => { const r = { ...row, id: `delivery:${deliveries.length}` }; deliveries.push(r); return r; }, update: async (id, patch) => Object.assign(deliveries.find(d => d.id === id), patch) },
  }, integrations: { Core: { SendPushNotification: async message => { sends.push(message); if (failSend) throw Object.assign(new Error('timeout'), { status: 504 }); } } } };
  const invoke = (extra = {}) => evaluateRecipient({ sr, ownerId: 'owner', prefs: structuredClone(preferences), relationship: relationship && structuredClone(relationship), settings, rows: readings, nowMs: now, absoluteUrl: path => `https://stackdinsight.base44.app${path}`, ...extra });
  return { ledger, deliveries, sends, preferences, relationship, invoke };
}

test('concurrent server evaluations serialize state and send one push with all covered events', async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 5 }, () => f.invoke()));
  assert.equal(f.sends.length, 1);
  assert.equal(f.deliveries.length, 1);
  assert.equal(f.deliveries[0].category, 'urgent_low');
  assert.equal(f.deliveries[0].covered_events.length, 3);
  assert.equal(f.deliveries[0].status, 'submitted');
  await f.invoke();
  assert.equal(f.sends.length, 1);
  assert.equal(JSON.stringify(f.ledger.episode_state).includes('"value"'), false);
});

test('follower consent is rechecked at the last send boundary; revoke blocks transport', async () => {
  const f = fixture({ follower: true, beforeRecheck: (_, relation) => { relation.status = 'revoked'; } });
  await f.invoke();
  assert.equal(f.sends.length, 0);
  assert.equal(f.deliveries[0].status, 'skipped');
});

test('removing just a covered grant cancels stale coalesced transport', async () => {
  const f = fixture({ follower: true, beforeRecheck: (_, relation) => { relation.push.custom_low = false; } });
  await f.invoke();
  assert.equal(f.sends.length, 0);
});

test('a privacy/threshold edit while queued cancels the stale configuration', async () => {
  const f = fixture({ beforeRecheck: pref => { pref.updated_date = 'edited'; pref.show_health_details = false; } });
  await f.invoke();
  assert.equal(f.sends.length, 0);
  assert.equal(f.deliveries[0].reason, 'configuration_changed');
});

test('a changed follower identity or lost glucose scope cannot send', async () => {
  for (const change of [relation => { relation.follower_user_id = 'different'; }, relation => { relation.scopes.glucose = false; }]) {
    const f = fixture({ follower: true, beforeRecheck: (_, relation) => change(relation) });
    await f.invoke();
    assert.equal(f.sends.length, 0);
  }
});

test('cross-account evaluation cannot reuse another recipient ledger', async () => {
  const f = fixture();
  await f.invoke({ prefs: { ...f.preferences, user_id: 'other' }, ownerId: 'other' });
  assert.equal(f.sends.length, 0);
  assert.equal(f.ledger.episode_revision, undefined);
});

test('an ambiguous native response remains unknown and is never replayed', async () => {
  const f = fixture({ failSend: true });
  await f.invoke(); await f.invoke();
  assert.equal(f.sends.length, 1);
  assert.equal(f.deliveries[0].status, 'unknown');
});

test('follower previews use the recipient’s own units, without changing owner thresholds', async () => {
  const f = fixture({ follower: true });
  f.preferences.show_health_details = true;
  await f.invoke({ recipientSettings: { glucose_units: 'mmol/L', timezone: 'UTC' } });
  assert.match(f.sends[0].content, /3\.0 mmol\/L/);
  assert.equal(settings.target_range_low, 70);
});

test('missing episode stays once per gap by default; repeats require an explicit interval', async () => {
  const f = fixture();
  f.preferences.categories = { missing_readings: true };
  f.preferences.missing_delay_minutes = 20;
  const old = [{ ...readings[0], recorded_at: new Date(now - 20 * 60000).toISOString() }];
  const options = { rows: old, connection: { status: 'connected' } };
  await f.invoke(options);
  await f.invoke({ ...options, nowMs: now + 15 * 60000 });
  assert.equal(f.sends.length, 1);
  f.preferences.repeat_minutes = { missing_readings: 15 };
  await f.invoke({ ...options, nowMs: now + 15 * 60000 });
  assert.equal(f.sends.length, 2);
});