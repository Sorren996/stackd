// Integration tests for the server-side ingestion → notification hand-off.
//
// These drive the SAME code paths production uses:
//   notifyAfterPersist  (what every CGM ingestion path awaits after bulkCreate)
//     -> evaluateOwnerNotifications (the one canonical evaluator)
//       -> evaluateRecipient -> dispatchNotification -> SendPushNotification
//
// Only two things are faked: the entity store (an isolated in-memory database)
// and the push transport. No real user's readings, settings, preferences or
// device are touched, and no request ever reaches a live app.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  notifyAfterPersist,
  reconcilePendingDispatches,
  dispatchErrorCode,
  MAX_DISPATCH_ATTEMPTS,
} from '../notificationIngest.ts';
import { sweepOwnerIds } from '../notificationEvaluation.ts';

// Fixed instant with a known UTC hour (12), so quiet-hour tests are stable.
const NOW = Date.parse('2026-11-06T12:00:00.000Z');
const MIN = 60_000;
const iso = ms => new Date(ms).toISOString();
const root = fileURLToPath(new URL('../../../', import.meta.url));
const read = path => readFileSync(`${root}${path}`, 'utf8');

// ── Isolated in-memory entity store ────────────────────────────────────────
function makeDb(seed = {}) {
  const tables = structuredClone(seed);
  let seq = 0;
  const list = name => (tables[name] ||= []);

  const match = (row, query) => {
    if (!query) return true;
    return Object.entries(query).every(([key, value]) => {
      if (key === '$or') return value.some(sub => match(row, sub));
      const actual = row[key];
      // The platform materializes optional entity fields as null, not absent.
      if (value === null) return actual == null;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        if ('$in' in value) return value.$in.includes(actual);
        if ('$nin' in value) {
          return Array.isArray(actual)
            ? !value.$nin.some(x => actual.includes(x))
            : !value.$nin.includes(actual);
        }
        if ('$ne' in value) return actual !== value.$ne;
      }
      return actual === value;
    });
  };

  const apply = (row, update) => {
    if (update.$set) Object.assign(row, structuredClone(update.$set));
    if (update.$push) {
      for (const [key, value] of Object.entries(update.$push)) {
        row[key] ||= [];
        if (Array.isArray(value)) row[key].push(...value);
        else row[key].push(value);
      }
    }
    if (update.$pull) {
      for (const [key, value] of Object.entries(update.$pull)) {
        const remove = value?.$in ? new Set(value.$in) : null;
        if (remove && Array.isArray(row[key])) row[key] = row[key].filter(x => !remove.has(x));
      }
    }
  };

  const page = (rows, options) => {
    const sorted = [...rows];
    if (options?.sort) {
      const key = String(options.sort).replace(/^-/, '');
      const dir = String(options.sort).startsWith('-') ? -1 : 1;
      sorted.sort((a, b) => (a[key] > b[key] ? 1 : a[key] < b[key] ? -1 : 0) * dir);
    }
    const items = options?.limit ? sorted.slice(0, options.limit) : sorted;
    return { items: structuredClone(items), next_cursor: null, has_more: false };
  };

  const entity = name => ({
    async filter(query = {}, options) {
      return page(list(name).filter(row => match(row, query)), options);
    },
    async get(id) {
      const row = list(name).find(x => x.id === id);
      if (!row) throw Object.assign(new Error('not_found'), { status: 404 });
      return structuredClone(row);
    },
    async create(row) {
      const created = { id: `${name}_${++seq}`, created_date: iso(NOW), ...structuredClone(row) };
      list(name).push(created);
      return structuredClone(created);
    },
    async update(id, patch) {
      const row = list(name).find(x => x.id === id);
      if (!row) throw Object.assign(new Error('not_found'), { status: 404 });
      Object.assign(row, structuredClone(patch));
      return structuredClone(row);
    },
    async updateMany(query, update) {
      const rows = list(name).filter(row => match(row, query));
      for (const row of rows) apply(row, update);
      return { updated: rows.length, has_more: false };
    },
  });

  return { tables, entity, rows: name => list(name) };
}

const ENTITIES = [
  'GlucoseReading', 'UserSettings', 'NotificationPreference', 'SharedAccess',
  'FollowNotificationPreference', 'DexcomConnection', 'NotificationLedger',
  'NotificationDelivery', 'NotificationDispatchJob',
];

/**
 * One isolated world: one owner, optional follower, one mocked transport.
 * `failures` can break a specific entity call, to prove ingestion survives a
 * dispatch problem.
 */
function world({ prefs = {}, settings = {}, readings = [], follower = null, connection = {}, master = true } = {}) {
  const db = makeDb({
    GlucoseReading: readings,
    UserSettings: [
      { id: 'settings', created_by_id: 'owner', updated_date: iso(NOW), target_range_low: 70, target_range_high: 180, glucose_units: 'mg/dL', timezone: 'UTC', ...settings },
      ...(follower ? [{ id: 'fs', created_by_id: 'follower', updated_date: iso(NOW), glucose_units: 'mg/dL', timezone: 'UTC' }] : []),
    ],
    NotificationPreference: master
      ? [{ id: 'prefs', created_by_id: 'owner', user_id: 'owner', updated_date: iso(NOW), master_enabled: true, categories: { urgent_low: true, below_range: true }, ...structuredClone(prefs) }]
      : [],
    SharedAccess: follower ? [follower.relationship] : [],
    FollowNotificationPreference: follower ? [follower.prefs] : [],
    DexcomConnection: [{ id: 'conn', created_by_id: 'owner', status: 'connected', ...connection }],
    NotificationLedger: [
      { id: 'ledger', user_id: 'owner', scope_key: 'self', claimed_keys: [], created_date: iso(NOW) },
      // The follower's ledger is created when they save their own preferences.
      ...(follower ? [{ id: 'fledger', user_id: 'follower', scope_key: `follow:${follower.relationship.id}`, claimed_keys: [], created_date: iso(NOW) }] : []),
    ],
    NotificationDelivery: [],
    NotificationDispatchJob: [],
  });

  const sends = [];
  const state = { failFilter: null, failSend: false };

  const sr = {
    entities: Object.fromEntries(ENTITIES.map(name => {
      const base = db.entity(name);
      if (name !== 'GlucoseReading') return [name, base];
      return [name, { ...base, filter: async (q, o) => {
        if (state.failFilter) { state.failFilter -= 1; throw Object.assign(new Error('upstream 500'), { status: 500 }); }
        return base.filter(q, o);
      } }];
    })),
    integrations: {
      Core: {
        SendPushNotification: async message => {
          sends.push(message);
          if (state.failSend) throw Object.assign(new Error('push unavailable'), { status: 503 });
          return { delivered: true };
        },
      },
    },
  };

  return {
    db, sr, sends, state,
    /** What ingestion awaits after persisting readings. */
    dispatch: (extra = {}) => notifyAfterPersist({ sr, ownerId: 'owner', nowMs: NOW, ...extra }),
    /** Persist a reading the way a CGM sync would, then hand off. */
    async ingest(value, minutesAgo = 0, source = 'dexcom_share', extra = {}) {
      const row = reading(value, minutesAgo, source);
      db.rows('GlucoseReading').push(row);
      const result = await notifyAfterPersist({ sr, ownerId: 'owner', readingIds: [row.id], nowMs: NOW, ...extra });
      return { row, result };
    },
    readings: () => db.rows('GlucoseReading'),
    deliveries: () => db.rows('NotificationDelivery'),
    jobs: () => db.rows('NotificationDispatchJob'),
    categories: () => db.rows('NotificationDelivery').map(d => d.category),
  };
}

let readingSeq = 0;
const reading = (value, minutesAgo = 0, source = 'dexcom_share') => ({
  id: `reading_${++readingSeq}`,
  user_id: 'owner',
  created_by_id: 'owner',
  value,
  recorded_at: iso(NOW - minutesAgo * MIN),
  source,
});

const followerWorld = ({ relationship = {}, prefs = {}, readings = [] } = {}) => world({
  readings,
  follower: {
    relationship: {
      id: 'access', status: 'active', sharer_user_id: 'owner', follower_user_id: 'follower',
      scopes: { glucose: true }, permission_version: 1, push: { urgent_low: true, below_range: true },
      ...relationship,
    },
    prefs: {
      id: 'fprefs', created_by_id: 'follower', user_id: 'follower', shared_access_id: 'access',
      updated_date: iso(NOW), master_enabled: true,
      categories: { urgent_low: true, below_range: true }, ...prefs,
    },
  },
});

// ── The incident: 70 → 65 → 60 → 57 → 54 ───────────────────────────────────

test('the verified incident shape now alerts: below-zone first, then urgent at 54', async () => {
  const w = world({ readings: [reading(70, 8), reading(65, 1)] });
  await w.dispatch();
  assert.deepEqual(w.categories(), ['below_range'], 'a fresh sub-zone reading must notify');

  await w.ingest(54, 0);
  assert.equal(w.categories().at(-1), 'urgent_low', 'the later, more severe crossing is not suppressed');
  assert.equal(w.deliveries().length, 2);
  assert.equal(w.sends.length, 2);
});

test('a single 54 reading is urgent_low immediately, without any client open', async () => {
  const w = world({ readings: [reading(70, 8), reading(65, 6), reading(60, 4), reading(57, 2), reading(54, 0)] });
  const result = await w.dispatch();
  assert.equal(result.dispatched, true);
  assert.equal(w.categories().join(), 'urgent_low');
  assert.equal(w.deliveries()[0].status, 'submitted');
  assert.equal(w.deliveries()[0].covered_events.length, 2, 'below-zone and urgent-low coalesce into one push');
  assert.equal(w.sends.length, 1);
});

// ── Independent thresholds ─────────────────────────────────────────────────

test('each independent custom threshold fires on its own, with no comfort-zone change', async () => {
  const customLow = world({ prefs: { categories: { custom_low: true }, custom_low_mgdl: 100 }, readings: [reading(120, 8), reading(95, 0)] });
  await customLow.dispatch();
  assert.deepEqual(customLow.categories(), ['custom_low']);

  const customHigh = world({ prefs: { categories: { custom_high: true }, custom_high_mgdl: 200, custom_high_minutes: 0 }, readings: [reading(150, 8), reading(240, 0)] });
  await customHigh.dispatch();
  assert.deepEqual(customHigh.categories(), ['custom_high']);

  const settingsRow = customLow.db.rows('UserSettings')[0];
  assert.equal(settingsRow.target_range_low, 70, 'comfort bounds are untouched by a notification threshold');
});

test('rapid fall and rise fire from real timed sequences, and honour the optional level gate', async () => {
  // The optional level gate means "only once glucose is at or below this".
  const fall = world({
    prefs: { categories: { falling_fast: true }, falling_fast_rate: 2, falling_fast_level_mgdl: 200 },
    readings: [reading(200, 15), reading(190, 11), reading(180, 7), reading(168, 0)],
  });
  await fall.dispatch();
  assert.deepEqual(fall.categories(), ['falling_fast']);

  const rise = world({
    prefs: { categories: { rising_fast: true }, rising_fast_rate: 2 },
    readings: [reading(90, 15), reading(100, 11), reading(112, 7), reading(126, 0)],
  });
  await rise.dispatch();
  assert.deepEqual(rise.categories(), ['rising_fast']);

  // Same fall, but the gate is set below the current value, so it holds back.
  const gated = world({
    prefs: { categories: { falling_fast: true }, falling_fast_rate: 2, falling_fast_level_mgdl: 60 },
    readings: [reading(200, 15), reading(190, 11), reading(180, 7), reading(168, 0)],
  });
  await gated.dispatch();
  assert.deepEqual(gated.categories(), [], 'the level gate is respected, not ignored');
});

test('sustained high waits for its configured duration and then fires once', async () => {
  const w = world({ prefs: { categories: { above_range: true }, above_range_minutes: 15 } });
  // Each sync evaluates once, as the newest reading becomes available, four
  // minutes apart. The high must have lasted the whole delay before it alerts.
  const sequence = [[220, 20], [225, 16], [230, 12], [234, 8], [238, 4], [241, 0]];
  for (const [value, minutesAgo] of sequence) {
    w.db.rows('GlucoseReading').push(reading(value, minutesAgo));
    await w.dispatch({ nowMs: NOW - minutesAgo * MIN });
    if (minutesAgo > 4) assert.deepEqual(w.categories(), [], `no alert before the 15-minute delay (${minutesAgo}m ago)`);
  }
  assert.deepEqual(w.categories(), ['above_range'], 'fires once the high has persisted the full delay');
  assert.equal(w.deliveries().length, 1);
});

// ── Missing readings, quiet hours, opt-outs ─────────────────────────────────

test('missing readings are noticed on a timer, with no new reading at all', async () => {
  const w = world({
    prefs: { categories: { missing_readings: true }, missing_delay_minutes: 20 },
    readings: [reading(120, 25)],
  });
  await w.dispatch();
  assert.deepEqual(w.categories(), ['missing_readings']);
  assert.equal(w.deliveries()[0].audience, 'self');
});

test('opted-out categories and quiet hours never send', async () => {
  const off = world({ prefs: { categories: { urgent_low: false, below_range: false } }, readings: [reading(54, 0)] });
  await off.dispatch();
  assert.equal(off.sends.length, 0);
  assert.deepEqual(off.categories(), []);

  const quiet = world({
    prefs: { quiet_hours_enabled: true, quiet_start_hour: 11, quiet_end_hour: 13, quiet_timezone: 'UTC' },
    readings: [reading(54, 0)],
  });
  await quiet.dispatch();
  assert.equal(quiet.sends.length, 0, 'held by quiet hours');

  const quietUrgent = world({
    prefs: { quiet_hours_enabled: true, quiet_start_hour: 11, quiet_end_hour: 13, quiet_timezone: 'UTC', urgent_during_quiet: true },
    readings: [reading(54, 0)],
  });
  await quietUrgent.dispatch();
  assert.equal(quietUrgent.sends.length, 1, 'an explicitly permitted urgent low still sends');
});

test('nothing was opted in by default', async () => {
  const w = world({ prefs: { categories: {} }, readings: [reading(54, 0)] });
  await w.dispatch();
  assert.equal(w.sends.length, 0);
});

// ── Never replay history ───────────────────────────────────────────────────

test('stale, system, future and backfilled readings cannot become current alerts', async () => {
  for (const rows of [
    [reading(54, 40)],                          // stale historical low
    [reading(54, 0, 'system')],                 // carry-forward, not a measurement
    [reading(120, 8), reading(54, 30)],         // backfilled older low
  ]) {
    const w = world({ readings: rows });
    await w.dispatch();
    assert.equal(w.sends.length, 0, `no alert for ${JSON.stringify(rows.map(r => [r.value, r.source]))}`);
  }

  const future = world({ readings: [reading(120, 8)] });
  future.db.rows('GlucoseReading').push({ ...reading(54, 0), recorded_at: iso(NOW + 10 * MIN) });
  await future.dispatch();
  assert.equal(future.sends.length, 0, 'a future-dated row is ignored');
});

test('the 54 mg/dL incident is not replayed once newer readings exist', async () => {
  const w = world({ readings: [reading(54, 0)] });
  await w.dispatch();
  assert.equal(w.sends.length, 1);

  // The same owner, later, with ordinary readings: no second urgent low.
  const later = world({ readings: [reading(54, 30), reading(120, 4), reading(118, 0)] });
  await later.dispatch();
  assert.equal(later.sends.length, 0);
});

// ── Repeats and recovery ───────────────────────────────────────────────────

test('repeats fire only when explicitly configured, and recovery re-arms the category', async () => {
  const w = world({ prefs: { categories: { urgent_low: true }, repeat_minutes: { urgent_low: 15 } } });
  // Four-minute cadence, each reading evaluated as it becomes the newest one.
  const step = async (value, minutesAgo) => {
    w.db.rows('GlucoseReading').push(reading(value, minutesAgo));
    return w.dispatch({ nowMs: NOW - minutesAgo * MIN });
  };

  await step(52, 16);
  assert.equal(w.sends.length, 1, 'the first low alerts');

  await step(51, 12);
  assert.equal(w.sends.length, 1, 'still low, below the repeat interval');

  // Two fresh recovery readings 4 minutes apart clear the episode.
  await step(70, 8);
  await step(75, 4);
  assert.equal(w.sends.length, 1, 'recovery itself is not a notification');

  await step(50, 0);
  assert.equal(w.sends.length, 2, 'a new episode alerts again after recovery');
});

test('repeat intervals are honoured when explicitly set', async () => {
  const w = world({ prefs: { categories: { urgent_low: true }, repeat_minutes: { urgent_low: 15 } } });
  const step = async (value, minutesAgo) => {
    w.db.rows('GlucoseReading').push(reading(value, minutesAgo));
    await w.dispatch({ nowMs: NOW - minutesAgo * MIN });
  };
  await step(52, 16);
  await step(51, 12);
  await step(50, 8);
  await step(49, 4);
  await step(48, 0);
  const repeats = w.deliveries().filter(d => d.category === 'urgent_low');
  assert.ok(repeats.length >= 2, 'an explicit repeat re-notifies while the episode persists');
  assert.ok(repeats.length <= 3, 'and only at the configured interval, never on every reading');
});

// ── Concurrency, failure, retry ────────────────────────────────────────────

test('concurrent duplicate hand-offs send exactly one notification', async () => {
  const w = world({ readings: [reading(54, 0)] });
  await Promise.all(Array.from({ length: 5 }, () => w.dispatch()));
  assert.equal(w.sends.length, 1);
  assert.equal(w.deliveries().length, 1);
});

test('ingestion succeeds when dispatch fails, records a recoverable job, and later recovers', async () => {
  const w = world({ readings: [reading(54, 0)] });
  w.state.failFilter = 1;

  const result = await w.dispatch({ readingIds: ['reading_x'] });
  assert.equal(result.dispatched, false);
  assert.equal(result.reason, 'dispatch_deferred');
  assert.equal(result.code, 'dispatch_upstream_error');
  assert.equal(w.jobs().length, 1, 'a durable job is retained');
  assert.equal(w.jobs()[0].status, 'pending');
  assert.equal(w.sends.length, 0);

  // Before the backoff elapses nothing is retried.
  const early = await reconcilePendingDispatches({ sr: w.sr, nowMs: NOW + MIN });
  assert.equal(early.attempted, 0);

  // The sweep retries and the alert finally lands, from current state.
  const later = await reconcilePendingDispatches({ sr: w.sr, nowMs: NOW + 5 * MIN });
  assert.equal(later.recovered, 1);
  assert.equal(w.jobs()[0].status, 'done');
  assert.equal(w.sends.length, 1);
});

test('a permanently failing dispatch is bounded, not an infinite retry loop', async () => {
  const w = world({ readings: [reading(54, 0)] });
  await reconcilePendingDispatches({
    sr: w.sr,
    nowMs: NOW,
    // Seed a job that has already used almost all of its attempts.
  });
  await w.dispatch({ readingIds: ['reading_y'] }).catch(() => {});
  const job = w.jobs()[0];
  if (job) {
    w.db.rows('NotificationDispatchJob')[0].attempts = MAX_DISPATCH_ATTEMPTS - 1;
    w.db.rows('NotificationDispatchJob')[0].next_attempt_at = iso(NOW);
    w.state.failFilter = 99;
    const res = await reconcilePendingDispatches({ sr: w.sr, nowMs: NOW + MIN });
    assert.equal(res.exhausted, 1);
    assert.equal(w.jobs()[0].status, 'failed');
  }
  assert.ok(Object.keys({ dispatch_upstream_error: 1 }).includes(dispatchErrorCode({ status: 500 })));
});

test('a transport refusal is recorded, never silently reported as delivered', async () => {
  const w = world({ readings: [reading(54, 0)] });
  w.state.failSend = true;
  await w.dispatch();
  assert.equal(w.deliveries().length, 1);
  assert.notEqual(w.deliveries()[0].status, 'submitted');
  assert.equal(w.deliveries()[0].detail_shown !== undefined, true);
});

// ── Permissions and isolation ──────────────────────────────────────────────

test('a follower is notified only while the sharer still grants it', async () => {
  const allowed = followerWorld({ readings: [reading(54, 0)] });
  await allowed.dispatch();
  assert.equal(allowed.deliveries().length, 2, 'owner and permitted follower');
  assert.deepEqual(allowed.deliveries().map(d => d.audience).sort(), ['follower', 'self']);

  const revoked = followerWorld({ relationship: { status: 'revoked' }, readings: [reading(54, 0)] });
  await revoked.dispatch();
  assert.equal(revoked.deliveries().filter(d => d.audience === 'follower').length, 0);

  const noGrant = followerWorld({ relationship: { push: {} }, readings: [reading(54, 0)] });
  await noGrant.dispatch();
  assert.equal(noGrant.deliveries().filter(d => d.audience === 'follower').length, 0);
});

test('one account’s reading cannot notify another account’s followers', async () => {
  const w = followerWorld({ readings: [reading(54, 0)] });
  w.db.rows('GlucoseReading')[0].user_id = 'someone_else';
  w.db.rows('GlucoseReading')[0].created_by_id = 'someone_else';
  await w.dispatch();
  assert.equal(w.sends.length, 0);
});

test('the sweep discovers owners from stored preferences only', async () => {
  const w = followerWorld({ readings: [reading(120, 2)] });
  const owners = await sweepOwnerIds(w.sr, NOW);
  assert.ok(owners.includes('owner'));
  assert.equal(owners.includes('follower'), false, 'a follower is not a sensor owner');
});

// ── The wiring itself ──────────────────────────────────────────────────────

test('every real ingestion path awaits the hand-off after persisting', () => {
  for (const path of [
    'base44/shared/dexcomShareSync.ts',
    'base44/shared/dexcomApiSync.ts',
    'base44/functions/fetchDexcomReadings/entry.ts',
  ]) {
    const source = read(path);
    assert.match(source, /notifyAfterPersist/, `${path} must hand off after persistence`);
    assert.ok(
      source.indexOf('bulkCreate') < source.lastIndexOf('await notifyAfterPersist'),
      `${path} must persist before it evaluates`
    );
    assert.match(source, /await notifyAfterPersist/, `${path} must await it, never fire-and-forget`);
  }
  // System carry-forward generation is deliberately not a notification source.
  assert.doesNotMatch(read('base44/functions/generateSystemGlucoseLogs/entry.ts'), /notifyAfterPersist/);
});

test('the entity trigger reads the runtime payload keys the workflow actually receives', () => {
  const workflow = read('base44/workflows/Evaluate notifications on new reading.jsonc');
  assert.match(workflow, /\.trigger\.data\.id/, 'the record id lives under .trigger.data, not .trigger.entity_id alone');
  assert.match(workflow, /\.trigger\.data\.source/, 'the condition reads the stored record field');
  assert.doesNotMatch(workflow, /"reading_id": "\$\{ \.trigger\.entity_id \}"/);
});

test('the evaluator has one implementation, and the sweep reconciles deferred work', () => {
  const entry = read('base44/functions/evaluateNotifications/entry.ts');
  assert.match(entry, /from "\.\.\/\.\.\/shared\/notificationEvaluation\.ts"/);
  assert.match(entry, /reconcilePendingDispatches/);
  assert.doesNotMatch(entry, /evaluateRecipient\(/, 'no second rule implementation in the entry point');
  const entity = read('base44/entities/NotificationDispatchJob.jsonc');
  assert.match(entity, /__server_only__/, 'the retry ledger is server-only');
});