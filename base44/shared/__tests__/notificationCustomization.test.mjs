import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { advanceNotificationEpisodes } from '../notificationEpisodes.ts';
import { fixedLowDecisions } from '../notificationFixedLow.ts';
import { notificationVelocity, episodeSamples, velocityMeets } from '../notificationVelocity.ts';
import { sanitizePersonalPreferences, sanitizeFollowerPreferences, sharerGrants, buildNotificationCopy, isHeldByQuietHours } from '../notificationCore.ts';
import { sanitizeNotificationOptions } from '../notificationOptions.ts';
import { recipientAuthorized, evaluateRecipient } from '../notificationRecipient.ts';
const T = Date.parse('2026-11-06T12:00:00Z');
const row = (m, value, extra = {}) => ({ id: `sample:${m}`, value, recorded_at: new Date(T + m * 60000).toISOString(), source: 'dexcom_share', ...extra });
const preferences = (categories = {}, extra = {}) => ({ master_enabled: true, categories, custom_low_mgdl: 100, custom_high_mgdl: 250, custom_high_minutes: 0, above_range_minutes: 15, ...extra });
function runner(prefs, thresholds = { low: 70, high: 180 }) {
  let state = {}, rows = [];
  const emitted = [], claimed = new Set();
  return { emitted, get state() { return state; },
    step(m, value, options = {}) {
      if (value != null) rows.push(row(m, value, options.row));
      const result = advanceNotificationEpisodes({ rows, state, preferences: prefs, thresholds, nowMs: T + (options.now ?? m) * 60000, allowed: options.allowed });
      state = result.state;
      const fixed = fixedLowDecisions({ rows, preferences: prefs, thresholds, nowMs: T + (options.now ?? m) * 60000 }).filter(item => !claimed.has(item.episodeKey) && (!options.allowed || options.allowed(item.category)));
      const chosen = fixed.at(-1) || result.notification;
      fixed.forEach(item => claimed.add(item.episodeKey));
      if (chosen) emitted.push(chosen);
      return chosen;
    },
  };
}

test('new categories default off; old opt-ins/values survive patches; entering a number never opts in', () => {
  const existing = preferences({ below_range: true, above_range: true, urgent_low: true }, { custom_low_mgdl: 95, show_health_details: true });
  const before = structuredClone(existing);
  const saved = sanitizePersonalPreferences({ custom_high_mgdl: 240, target_range_low: 10, insulin_sensitivity_mgdl_per_unit: 999 }, existing);
  assert.equal(saved.error, null);
  for (const k of ['custom_low', 'custom_high', 'falling_fast', 'rising_fast']) assert.equal(saved.value.categories[k], false);
  assert.equal(saved.value.categories.below_range, true);
  assert.equal(saved.value.custom_low_mgdl, 95);
  assert.equal(saved.value.show_health_details, true);
  assert.equal('target_range_low' in saved.value, false);
  assert.equal('insulin_sensitivity_mgdl_per_unit' in saved.value, false);
  assert.deepEqual(existing, before);
});

test('notification limits, separation and finite integer validation, including exact endpoints', () => {
  for (const value of [60, 150]) assert.equal(sanitizeNotificationOptions({ custom_low_mgdl: value }).error, null);
  for (const value of [100, 400]) assert.equal(sanitizeNotificationOptions({ custom_high_mgdl: value }).error, null);
  for (const value of [59, 151, NaN, Infinity, '100', true, 70.5]) assert.ok(sanitizeNotificationOptions({ custom_low_mgdl: value }).error);
  for (const value of [99, 401]) assert.ok(sanitizeNotificationOptions({ custom_high_mgdl: value }).error);
  assert.equal(sanitizeNotificationOptions({ custom_low_mgdl: 100, custom_high_mgdl: 120 }).error, null);
  assert.equal(sanitizeNotificationOptions({ custom_low_mgdl: 100, custom_high_mgdl: 119 }).error, 'notification_threshold_separation');
  assert.ok(sanitizeNotificationOptions({ falling_fast_rate: 2.5 }).error);
  assert.ok(sanitizeNotificationOptions({ repeat_minutes: { urgent_low: 5 } }).error);
});

test('100 then exact 70 then below 70 then urgent: each stage independent, urgent stays strictly <55', () => {
  const r = runner(preferences({ custom_low: true, below_range: true, urgent_low: true }));
  assert.equal(r.step(0, 100).category, 'custom_low');
  assert.equal(r.step(5, 70), null);
  assert.equal(r.step(10, 69).category, 'low_glucose');
  assert.equal(r.step(15, 55).category, 'low_glucose');
  assert.equal(r.step(20, 54).category, 'urgent_low');
  assert.equal(r.step(25, 60).category, 'low_glucose');
});

test('simultaneous stages coalesce into one highest-severity push and cover every event', () => {
  const r = runner(preferences({ custom_low: true, below_range: true, urgent_low: true }));
  const n = r.step(0, 54);
  assert.equal(n.category, 'urgent_low');
  assert.deepEqual(n.coveredEvents.map(e => e.category).sort(), ['below_range', 'urgent_low']);
  assert.equal(r.step(5, 60).category, 'low_glucose');
  assert.equal(r.step(10, 53).category, 'urgent_low');
});

test('custom warning at 70 cannot consume the next distinct fixed-low reading', () => {
  const r = runner(preferences({ custom_low: true, below_range: true }, { custom_low_mgdl: 70 }));
  assert.equal(r.step(0, 70).category, 'custom_low');
  assert.equal(r.step(5, 69).category, 'low_glucose');
  assert.equal(r.emitted.length, 2);
});

test('equal high bounds with inclusive custom comparator are covered once', () => {
  const r = runner(preferences({ custom_high: true, above_range: true }, { custom_high_mgdl: 180 }));
  assert.equal(r.step(0, 180).category, 'custom_high');
  for (const t of [5, 10, 15, 20]) assert.equal(r.step(t, 181), null);
});

test('near-boundary oscillation cannot rearm; two fresh samples beyond the 5 mg/dL margin do', () => {
  const r = runner(preferences({ custom_low: true }));
  assert.ok(r.step(0, 100));
  for (const [m, v] of [[5, 101], [10, 99], [15, 104], [20, 100], [25, 105], [30, 104], [35, 99]]) assert.equal(r.step(m, v), null);
  r.step(40, 105); r.step(45, 106);
  assert.ok(r.step(50, 100));
  assert.equal(r.emitted.length, 2);
});

test('gap or stale readings cannot supply recovery samples', () => {
  const r = runner(preferences({ custom_low: true }));
  r.step(0, 99); r.step(5, 105);
  r.step(25, 105);
  assert.equal(r.step(30, 99), null);
  r.step(35, 105, { now: 50 });
  assert.equal(r.step(55, 99), null);
});

test('a first fresh already-low observation starts an episode; historic/backfilled or out-of-order callbacks do not replay', () => {
  const r = runner(preferences({ custom_low: true }));
  assert.equal(r.step(-30, 99, { now: 0 }), null);
  assert.ok(r.step(0, 98));
  assert.equal(r.step(-5, 80, { now: 1 }), null);
  assert.equal(r.step(5, null), null);
  assert.equal(r.emitted.length, 1);
});

test('turning a category on while already beyond its boundary waits for the next fresh sample, not an artificial crossing', () => {
  const p = preferences({ custom_low: false });
  const r = runner(p);
  assert.equal(r.step(0, 90), null);
  p.categories.custom_low = true;
  assert.equal(r.step(1, null), null);
  assert.equal(r.step(5, 90).category, 'custom_low');
});

test('custom high delay is continuous, inclusive, resets on recovery or a gap and never delays low/urgent', () => {
  const r = runner(preferences({ custom_high: true }, { custom_high_minutes: 15 }));
  r.step(0, 250); r.step(5, 250); r.step(10, 249); r.step(15, 250); r.step(20, 250);
  assert.equal(r.step(25, 250), null);
  assert.equal(r.step(30, 250).category, 'custom_high');
  const g = runner(preferences({ custom_high: true }, { custom_high_minutes: 15 }));
  g.step(0, 260); g.step(5, 260); g.step(20, 260); g.step(25, 260); g.step(30, 260);
  assert.equal(g.step(35, 260).category, 'custom_high');
  const low = runner(preferences({ custom_low: true, urgent_low: true }, { custom_high_minutes: 60 }));
  assert.equal(low.step(0, 50).category, 'urgent_low');
});

test('above comfort remains strictly > its own boundary and separate from custom high', () => {
  const r = runner(preferences({ above_range: true, custom_high: true }, { custom_high_mgdl: 250 }));
  assert.equal(r.step(0, 180), null);
  r.step(5, 181); r.step(10, 181); r.step(15, 181);
  assert.equal(r.step(20, 181).category, 'above_range');
  assert.equal(r.step(25, 250).category, 'custom_high');
});

test('no implicit repeats; explicit repeats stay per stage and cannot suppress urgent escalation', () => {
  const p = preferences({ custom_low: true, urgent_low: true }, { repeat_minutes: { custom_low: 15 } });
  const r = runner(p);
  r.step(0, 100); assert.equal(r.step(5, 99), null); r.step(10, 99);
  assert.equal(r.step(15, 99).repeatIndex, 1);
  assert.equal(r.step(20, 54).category, 'urgent_low');
  assert.equal(r.step(25, 54).category, 'urgent_low');
});

test('urgent quiet-hours opt-in is independent and lower stages are covered, not sent later', () => {
  const quiet = { enabled: true, startHour: 0, endHour: 23, timeZone: 'UTC', urgentDuringQuiet: true };
  const r = runner(preferences({ custom_low: true, below_range: true, urgent_low: true }));
  const n = r.step(0, 54, { allowed: k => !isHeldByQuietHours(k, quiet, T) });
  assert.equal(n.category, 'urgent_low');
  assert.equal(n.coveredEvents.length, 2);
  assert.equal(r.step(5, 60, { allowed: k => !isHeldByQuietHours(k, quiet, T + 5 * 60000) }), null);
});

const velocityFor = (values, extra = {}) => notificationVelocity(episodeSamples(values.map((v, i) => row(i * 5, v, extra)), T + 15 * 60000).samples, T + 15 * 60000);
test('least squares rate uses actual minutes and includes exact 2/3 boundaries and faster changes', () => {
  assert.equal(velocityMeets(velocityFor([100, 110, 120, 130]), 'rising_fast', 2), true);
  assert.equal(velocityMeets(velocityFor([100, 110, 120, 130]), 'rising_fast', 3), false);
  assert.equal(velocityMeets(velocityFor([100, 115, 130, 145]), 'rising_fast', 3), true);
  assert.equal(velocityMeets(velocityFor([160, 140, 120, 100]), 'falling_fast', 2), true);
  const rows = [row(0, 100), row(4, 108), row(10, 120), row(15, 130)];
  const fit = notificationVelocity(episodeSamples(rows, T + 15 * 60000).samples, T + 15 * 60000);
  assert.ok(Math.abs(fit.slope - 2) < 1e-9);
});

test('isolated spikes and inconsistent directions cannot produce a pace notification', () => {
  for (const values of [[100, 100, 100, 145], [100, 120, 110, 145], [100, 150, 100, 150]]) assert.equal(velocityMeets(velocityFor(values), 'rising_fast', 2), false);
});

test('velocity never mixes sources, manual, synthetic, missing, future, or stale samples', () => {
  const current = T + 15 * 60000;
  const rows = [0, 5, 10, 15].map((t, i) => row(t, 100 + i * 15));
  for (const source of ['manual', 'system', 'projected', 'dexcom']) {
    const changed = rows.map((r, i) => i === 2 ? { ...r, source } : r);
    assert.equal(notificationVelocity(episodeSamples(changed, current).samples, current), null);
  }
  assert.equal(notificationVelocity(episodeSamples(rows, current).samples, current + 11 * 60000), null);
  const gap = [row(0, 100), row(3, 110), row(11, 130), row(15, 145)];
  assert.equal(notificationVelocity(episodeSamples(gap, current).samples, current), null);
  assert.equal(notificationVelocity(episodeSamples(rows, current - 1).samples, current - 1), null);
});

test('velocity sample ids/timestamps deduplicate and conflicting duplicates make pace unknown', () => {
  const rows = [0, 5, 10, 15].map((t, i) => row(t, 100 + i * 15));
  assert.equal(episodeSamples([...rows, rows[1]], T + 15 * 60000).samples.length, 4);
  assert.equal(episodeSamples([...rows, { ...rows[1], id: 'other', value: 999 }], T + 15 * 60000).conflict, true);
});

test('pace and optional level must BOTH hold; falling/rising opt-ins are independent', () => {
  const p = preferences({ rising_fast: true }, { rising_fast_rate: 2, rising_fast_level_mgdl: 135 });
  const r = runner(p);
  [100, 110, 120].forEach((v, i) => r.step(i * 5, v));
  assert.equal(r.step(15, 130), null);
  assert.equal(r.step(20, 140).category, 'rising_fast');
  assert.equal(r.step(25, 150), null);
  const f = runner(preferences({ falling_fast: true }, { falling_fast_rate: 3, falling_fast_level_mgdl: 100 }));
  [145, 130, 115].forEach((v, i) => f.step(i * 5, v));
  assert.equal(f.step(15, 100).category, 'falling_fast');
});

test('urgent takes precedence over rapid fall in one evaluation', () => {
  const r = runner(preferences({ falling_fast: true, urgent_low: true }, { falling_fast_rate: 2 }));
  [100, 85, 70].forEach((v, i) => r.step(i * 5, v));
  assert.equal(r.step(15, 54).category, 'urgent_low');
});

const relationship = { id: 'access', sharer_user_id: 'owner', follower_user_id: 'follower', status: 'active', scopes: { glucose: true }, push: { custom_low: true, urgent_low: true }, permission_version: 1 };
const follow = preferences({ custom_low: true, rising_fast: true }, { user_id: 'follower', shared_access_id: 'access' });
test('new grants default off; follower opt-ins cannot widen granted scope, direction or identity', () => {
  assert.equal(sharerGrants({ push: { below_range: true } }).custom_low, false);
  const result = sanitizeFollowerPreferences(follow, null, relationship);
  assert.equal(result.value.categories.custom_low, true);
  assert.equal(result.value.categories.rising_fast, false);
  assert.equal(recipientAuthorized(follow, relationship, 'owner', 'other', ['custom_low'], T), false);
  assert.equal(recipientAuthorized(follow, { ...relationship, status: 'revoked' }, 'owner', 'follower', ['custom_low'], T), false);
  assert.equal(recipientAuthorized(follow, { ...relationship, scopes: {} }, 'owner', 'follower', ['custom_low'], T), false);
  assert.equal(recipientAuthorized(follow, relationship, 'owner', 'follower', ['rising_fast'], T), false);
  assert.equal(recipientAuthorized(follow, relationship, 'other-owner', 'follower', ['custom_low'], T), false);
});

test('all new category previews remain generic, with no value/person leaking', () => {
  for (const category of ['custom_low', 'custom_high', 'falling_fast', 'rising_fast']) {
    const generic = buildNotificationCopy({ category, value: 50, showDetails: false, personName: 'Private Name' });
    assert.deepEqual(generic, { title: 'Stackd update', body: 'Open Stackd to review.' });
    const detailed = buildNotificationCopy({ category, value: 50, showDetails: true });
    assert.match(detailed.title, /50 mg\/dL/);
    assert.ok(!detailed.body.includes('Private Name'));
  }
});

test('notification settings have no Recent UI/fetch and no comfort-zone write or calculation import', async () => {
  const page = await readFile(new URL('../../../src/pages/NotificationsPage.jsx', import.meta.url), 'utf8');
  const center = await readFile(new URL('../../functions/getNotificationCenter/entry.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /RecentNotifications|markNotificationRead|data\.recent/);
  assert.doesNotMatch(center, /NotificationDelivery\.filter|\brecent,/);
  for (const name of ['updateNotificationPreferences', 'updateFollowNotificationPreferences']) {
    const source = await readFile(new URL(`../../functions/${name}/entry.ts`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /UserSettings\.(update|create)|insulin|projection|dailyBalance/i);
  }
});