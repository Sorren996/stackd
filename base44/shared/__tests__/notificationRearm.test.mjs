import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceNotificationEpisodes } from '../notificationEpisodes.ts';
import { legacyEpisodeState } from '../notificationLegacyEpisodes.ts';
import { categoryActivation } from '../notificationOptions.ts';
import { fixedLowDecisions } from '../notificationFixedLow.ts';
const T = Date.parse('2026-11-06T12:00:00Z');
const row = (m, value) => ({ id: `r${m}`, source: 'dexcom_share', value, recorded_at: new Date(T + m * 60000).toISOString() });
const thresholds = { low: 70, high: 180 };
const preferences = { master_enabled: true, custom_low_mgdl: 100, categories: { custom_low: true, urgent_low: true } };

test('an explicit re-enable creates a server-owned activation, while value/privacy edits do not', () => {
  const initial = { ...preferences, category_activation: { custom_low: 'old' } };
  assert.deepEqual(categoryActivation(initial, { ...initial, show_health_details: true }, () => 'new'), { custom_low: 'old' });
  const off = { ...initial, categories: { ...initial.categories, custom_low: false } };
  assert.match(categoryActivation(off, initial, () => 'new').custom_low, /\|new$/);
  assert.match(categoryActivation({ ...initial, master_enabled: false }, initial, () => 'master-new').urgent_low, /\|master-new$/);
});

test('re-enable while already low waits for a fresh sample and then starts exactly one new episode', () => {
  let state = {}, rows = [row(0, 90)];
  const evaluate = (now, prefs) => {
    const result = advanceNotificationEpisodes({ state, rows, nowMs: T + now * 60000, preferences: prefs, thresholds });
    state = result.state; return result.notification;
  };
  assert.equal(evaluate(0, preferences).category, 'custom_low');
  const enabled = { ...preferences, category_activation: { custom_low: 'new-explicit-activation' } };
  assert.equal(evaluate(1, enabled), null);
  rows.push(row(5, 90));
  assert.equal(evaluate(5, enabled).category, 'custom_low');
  rows.push(row(10, 89));
  assert.equal(evaluate(10, enabled), null);
});

test('pace episodes need two fresh recovery windows and cannot be rearmed by an unknown gap', () => {
  let state = {}, rows = [];
  const prefs = { master_enabled: true, categories: { rising_fast: true }, rising_fast_rate: 2 };
  const step = (m, value) => { rows.push(row(m, value)); const result = advanceNotificationEpisodes({ state, rows, nowMs: T + m * 60000, preferences: prefs, thresholds }); state = result.state; return result.notification; };
  [100, 110, 120].forEach((v, i) => step(i * 5, v));
  assert.equal(step(15, 130).category, 'rising_fast');
  for (const m of [20, 25, 30, 35]) assert.equal(step(m, 130), null);
  step(40, 140); step(45, 150);
  assert.equal(step(50, 160).category, 'rising_fast');
  step(70, 170); step(75, 180); step(80, 190);
  assert.equal(step(85, 200), null);
});

test('legacy spent low stages survive upgrade without migrating opt-in to custom categories', () => {
  const rows = [row(0, 65), row(5, 64)];
  const ledger = { claimed_keys: ['below_range|owner|recipient|low:r0|push'] };
  const state = legacyEpisodeState(ledger, rows, { target_range_low: 70, target_range_high: 180 }, 'owner', 'recipient', T + 5 * 60000);
  assert.equal(state.legacyConsumed.below_range, true);
  assert.equal(state.legacyConsumed.custom_low, undefined);
  const result = advanceNotificationEpisodes({ state, rows, nowMs: T + 5 * 60000, thresholds, preferences: { master_enabled: true, categories: { below_range: true, urgent_low: true } } });
  assert.equal(result.notification, null);
  rows.push(row(10, 54));
  assert.equal(fixedLowDecisions({ rows, nowMs: T + 10 * 60000, thresholds, preferences: { master_enabled: true, categories: { below_range: true, urgent_low: true } } }).at(-1).category, 'urgent_low');
});

test('legacy urgent consumption cannot suppress a new urgent escalation that was not reached in this episode', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(i * 5, 65));
  const state = legacyEpisodeState({ claimed_keys: ['urgent_low|owner|recipient|low:ancient|push'] }, rows, { target_range_low: 70, target_range_high: 180 }, 'owner', 'recipient', T + 55 * 60000);
  assert.notEqual(state.legacyConsumed.urgent_low, true);
});

test('an unprocessed recovery sample between observed highs resets persistence', () => {
  const prefs = { master_enabled: true, categories: { custom_high: true }, custom_high_mgdl: 200, custom_high_minutes: 15 };
  let rows = [row(0, 210)];
  let result = advanceNotificationEpisodes({ state: {}, rows, nowMs: T, preferences: prefs, thresholds });
  rows.push(row(5, 210));
  result = advanceNotificationEpisodes({ state: result.state, rows, nowMs: T + 5 * 60000, preferences: prefs, thresholds });
  rows.push(row(7, 190), row(10, 210));
  result = advanceNotificationEpisodes({ state: result.state, rows, nowMs: T + 10 * 60000, preferences: prefs, thresholds });
  assert.equal(result.state.stages.custom_high.highSince, T + 10 * 60000);
  assert.equal(result.notification, null);
});