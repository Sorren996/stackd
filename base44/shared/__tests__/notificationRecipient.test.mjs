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
    User: { get: async () => ({ health_data_consent_active: true }) },
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
    NotificationDelivery: {
      filter: async (query = {}) => ({ items: deliveries.filter(d => d.event_key === query.event_key && (query.status?.$in || []).includes(d.status)) }),
      create: async row => { const r = { ...row, id: `delivery:${deliveries.length}` }; deliveries.push(r); return r; },
      update: async (id, patch) => Object.assign(deliveries.find(d => d.id === id), patch),
    },
  }, integrations: { Core: { SendPushNotification: async message => { sends.push(message); if (failSend) throw Object.assign(new Error('timeout'), { status: 504 }); } } } };
  const invoke = (extra = {}) => evaluateRecipient({ sr, ownerId: 'owner', prefs: structuredClone(preferences), relationship: relationship && structuredClone(relationship), settings, rows: readings, nowMs: now, absoluteUrl: path => `https://stackdinsight.base44.app${path}`, ...extra });
  return { sr, ledger, deliveries, sends, preferences, relationship, invoke };
}

test('concurrent server evaluations serialize state and send one push with all covered events', async () => {
  const f = fixture();
  await Promise.all(Array.from({ length: 5 }, () => f.invoke()));
  assert.equal(f.sends.length, 1);
  assert.equal(f.deliveries.length, 1);
  assert.equal(f.deliveries[0].category, 'urgent_low');
  assert.equal(f.deliveries[0].covered_events.length, 3, 'urgent, custom low and the comfort-zone low all matched this one reading');
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

test('changing an optional early-warning grant cannot veto the authorized fixed low stream', async () => {
  const f = fixture({ follower: true, beforeRecheck: (_, relation) => { relation.push.custom_low = false; relation.permission_version += 1; } });
  await f.invoke();
  assert.equal(f.sends.length, 1);
});

test('a privacy edit while queued cancels the stale configuration', async () => {
  const f = fixture({ beforeRecheck: pref => { pref.updated_date = 'edited'; pref.show_health_details = true; } });
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
  assert.match(f.sends[0].title, /3\.0 mmol\/L/);
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

test('69, 68, 54, 53 submit four times, urgent at escalation, duplicate callbacks and timer sweeps submit nothing else', async () => {
  for (const urgent of [false, true]) {
    const f = fixture();
    f.preferences.categories = { low_glucose: true, urgent_low: urgent };
    f.preferences.show_health_details = true;
    f.preferences.repeat_minutes = { low_glucose: 120, below_range: 120, urgent_low: 120 };
    const rows = [];
    for (const [index, value] of [69, 68, 54, 53].entries()) {
      const at = now + index * 5 * 60000;
      rows.push({ id: `reading-${index}`, source: 'dexcom_share', value, recorded_at: new Date(at).toISOString() });
      await f.invoke({ rows, nowMs: at });
      await f.invoke({ rows, nowMs: at });
    }
    assert.equal(f.sends.length, 4);
    assert.equal(f.sends[0].title, '69 mg/dL');
    assert.equal(f.sends[0].content, 'New reading');
    // The urgent presentation is used only when urgent low was opted into.
    assert.equal(f.sends[2].title, '54 mg/dL');
    assert.equal(f.sends[2].content, urgent ? 'Urgent low, act now.' : 'New reading');
    assert.deepEqual(f.deliveries.map(d => d.status), Array(4).fill('submitted'));
    await f.invoke({ rows, nowMs: now + 16 * 60000 });
    assert.equal(f.sends.length, 4);
    assert.equal(new Set(f.deliveries.map(d => d.event_key)).size, 4);
  }
});
test('urgent alone submits for each distinct reading below 55; neither enabled and exact 70 submit nothing', async () => {
  for (const low of [false, true]) for (const urgent of [false, true]) {
    const f = fixture(); f.preferences.categories = { low_glucose: low, urgent_low: urgent };
    for (const [index, value] of [70, 69, 54, 53].entries()) await f.invoke({ rows: [{ ...readings[0], id: `${index}`, value, recorded_at: new Date(now + index * 5 * 60000).toISOString() }], nowMs: now + index * 5 * 60000 });
    assert.equal(f.sends.length, low ? 3 : urgent ? 2 : 0, `${low}/${urgent}`);
  }
});
test('concurrent workers and duplicate row IDs share one source-measurement claim', async () => {
  const f = fixture(); f.preferences.categories = { low_glucose: true, urgent_low: true };
  await Promise.all(Array.from({ length: 8 }, (_, i) => f.invoke({ rows: [{ ...readings[0], id: `different-db-id-${i}` }] })));
  assert.equal(f.sends.length, 1); assert.equal(f.deliveries.length, 1);
});
test('changing optional custom warning settings cannot suppress fixed low', async () => {
  const f = fixture({ beforeRecheck: pref => { pref.updated_date = 'new-custom-value'; pref.custom_low_mgdl = 110; pref.categories.custom_low = false; } });
  f.preferences.categories = { low_glucose: true, custom_low: true };
  await f.invoke(); assert.equal(f.sends.length, 1);
});
test('owner consent withdrawal and low/urgent scope removal before submission stop transport', async () => {
  const f = fixture();
  f.sr.entities.User.get = async () => ({ health_data_consent_active: false });
  await f.invoke(); assert.equal(f.sends.length, 0); assert.equal(f.deliveries[0].reason, 'consent_changed');
  const follower = fixture({ follower: true, beforeRecheck: (_, relation) => { relation.push.below_range = false; relation.push.urgent_low = false; } });
  await follower.invoke(); assert.equal(follower.sends.length, 0);
});
test('stale and backfilled readings cannot produce a fixed-low flood', async () => {
  const f = fixture(); f.preferences.categories = { low_glucose: true };
  const old = Array.from({ length: 20 }, (_, i) => ({ ...readings[0], id: String(i), recorded_at: new Date(now - (i + 9) * 60000).toISOString(), created_date: new Date(now).toISOString() }));
  await f.invoke({ rows: old }); assert.equal(f.sends.length, 0);
});
test('legacy processed samples do not replay at cutover; the next distinct measurement submits', async () => {
  const f = fixture(); f.ledger.episode_state = { lastAt: now };
  f.preferences.categories = { low_glucose: true };
  await f.invoke(); await f.invoke(); assert.equal(f.sends.length, 0);
  await f.invoke({ rows: [{ ...readings[0], recorded_at: new Date(now + 5 * 60000).toISOString() }], nowMs: now + 5 * 60000 });
  assert.equal(f.sends.length, 1);
});
test('an explicit service refusal is failed, never submitted, and is not resent on callback retry', async () => {
  const f = fixture(); f.sr.integrations.Core.SendPushNotification = async message => { f.sends.push(message); return { success: false }; };
  await f.invoke(); await f.invoke();
  assert.equal(f.sends.length, 1); assert.equal(f.deliveries[0].status, 'failed'); assert.equal(f.deliveries[0].submitted_at, undefined);
});

test('all_readings dispatches the "{value} {unit} {arrow}" title and capitalised trend body', async () => {
  const f = fixture();
  f.preferences.categories = {};
  f.preferences.all_readings_enabled = true;
  f.preferences.show_health_details = true;
  await f.invoke({
    rows: [{ id: 'r-124', source: 'dexcom_share', value: 124, trend: 'Flat', recorded_at: new Date(now).toISOString() }],
    settings: { target_range_low: 70, target_range_high: 180, glucose_units: 'mg/dL' },
  });
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].title, '124 mg/dL →');
  assert.equal(f.sends[0].content, 'Holding steady');
});

test('a custom-low 97 with a Flat trend sends "97 mg/dL →" / "Holding steady"', async () => {
  const f = fixture();
  f.preferences.categories = { custom_low: true };
  f.preferences.custom_low_mgdl = 100;
  f.preferences.show_health_details = true;
  await f.invoke({ rows: [{ id: 'r-97', source: 'dexcom_share', value: 97, trend: 'Flat', recorded_at: new Date(now).toISOString() }] });
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].title, '97 mg/dL →');
  assert.equal(f.sends[0].content, 'Holding steady');
  assert.equal(f.deliveries[0].category, 'custom_low');
});

test('a released claim can never re-send a push that was already accepted', async () => {
  const f = fixture();
  f.preferences.show_health_details = true;
  await f.invoke();
  await f.invoke({ nowMs: now + 5_000 });
  assert.equal(f.sends.length, 1, 'two builds of the same reading send one banner');
  // The claim was handed back while the push had already gone out: the delivery
  // row is the durable record, so a later pass still cannot send it again.
  f.ledger.claimed_keys = [];
  f.ledger.episode_state = {};
  await f.invoke({ nowMs: now + 60_000 });
  assert.equal(f.sends.length, 1);
  assert.equal(f.deliveries.length, 1);
});

test('a Flat sensor reading four seconds ahead dispatches its arrow and word exactly once', async () => {
  const f = fixture();
  f.preferences.categories = {};
  f.preferences.all_readings_enabled = true;
  f.preferences.show_health_details = true;
  const row = { id: 'skew-flat', source: 'dexcom_share', value: 131, trend: 'Flat', recorded_at: new Date(now + 4000).toISOString() };
  await f.invoke({ rows: [row] });
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].title, '131 mg/dL →');
  assert.equal(f.sends[0].content, 'Holding steady');
  await f.invoke({ rows: [row], nowMs: now + 5000 });
  assert.equal(f.sends.length, 1);
});

test('urgent low four seconds ahead keeps its arrow and exact action copy', async () => {
  const f = fixture();
  f.preferences.show_health_details = true;
  await f.invoke({ rows: [{ ...readings[0], trend: 'SingleDown', recorded_at: new Date(now + 4000).toISOString() }] });
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].title, '54 mg/dL ↓');
  assert.equal(f.sends[0].content, 'Urgent low, act now.');
});

test('custom_high dispatches the "{value} {unit} {arrow}" title and the capitalised trend body', async () => {
  const f = fixture();
  f.preferences.categories = { custom_high: true };
  f.preferences.custom_high_mgdl = 180;
  f.preferences.custom_high_minutes = 0;
  f.preferences.show_health_details = true;
  await f.invoke({
    rows: [{ id: 'r-185', source: 'dexcom_share', value: 185, trend: 'SingleUp', recorded_at: new Date(now).toISOString() }],
    settings: { target_range_low: 70, target_range_high: 180, glucose_units: 'mg/dL' },
  });
  assert.equal(f.sends.length, 1);
  assert.equal(f.sends[0].title, '185 mg/dL ↑');
  assert.equal(f.sends[0].content, 'Climbing');
});