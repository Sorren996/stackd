// The six-row notification model: what a new account starts with, how an older
// row is mapped onto it, and what the existing decision engine actually does
// with the result.
//
// Every case here is a decision the owner took on Nov 13 2026, so a change in
// behaviour has to change one of these assertions on purpose.

import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceNotificationEpisodes } from '../notificationEpisodes.ts';
import { lowStreamDecisions } from '../notificationLowStream.ts';
import { decideMissingNotification, sanitizePersonalPreferences } from '../notificationCore.ts';
import { OWNER_DEFAULTS, ownerView, withLegacyMirrors } from '../notificationModel.ts';

const T = Date.parse('2026-11-13T12:00:00Z');
const row = (m, value) => ({ id: `s:${m}`, value, recorded_at: new Date(T + m * 60000).toISOString(), source: 'dexcom_share' });

/** A stored row exactly as the save path writes it: six rows + each mirror. */
const stored = (patch) => withLegacyMirrors(sanitizePersonalPreferences(patch, null).value);

function runner(prefs, thresholds = { low: 70, high: 180 }) {
  let state = {};
  const rows = [];
  const emitted = [];
  const claimed = new Set();
  return {
    emitted,
    step(m, value, options = {}) {
      if (value != null) rows.push(row(m, value));
      const nowMs = T + (options.now ?? m) * 60000;
      const result = advanceNotificationEpisodes({ rows, state, preferences: prefs, thresholds, nowMs, allowed: options.allowed });
      state = result.state;
      const perReading = lowStreamDecisions({ rows, preferences: prefs, thresholds, nowMs, allowed: options.allowed })
        .filter((item) => !claimed.has(item.episodeKey) && (!options.allowed || options.allowed(item.category)));
      const chosen = perReading.at(-1) || result.notification;
      perReading.forEach((item) => claimed.add(item.episodeKey));
      if (chosen) emitted.push(chosen);
      return chosen;
    },
  };
}

// ── What a new account starts with ────────────────────────────────────────

test('a missing preference row is never the same as everything off', () => {
  for (const blank of [null, {}, undefined]) {
    const view = ownerView(blank);
    assert.equal(view.master_enabled, true, 'master is on');
    assert.deepEqual(view.categories, OWNER_DEFAULTS.categories);
    assert.equal(view.low_mgdl, 70);
    assert.equal(view.high_mgdl, 180);
    assert.equal(view.fast_rate, 2);
    assert.equal(view.fast_direction, 'both');
  }
});

test('urgent low cannot be switched off, and always passes quiet hours', () => {
  const saved = stored({ categories: { urgent_low: false } });
  assert.equal(saved.categories.urgent_low, true);
  assert.equal(saved.urgent_during_quiet, true);
  assert.equal(saved.model_version, 2);
});

// ── Mapping an account that already had choices ───────────────────────────

test("this owner's saved row maps to one Low at 100, and keeps every protection", () => {
  const legacy = {
    master_enabled: true,
    categories: { urgent_low: true, custom_low: true, low_glucose: false, below_range: false, custom_high: false, above_range: false, falling_fast: true, rising_fast: false, missing_readings: true },
    custom_low_mgdl: 100,
    custom_high_minutes: 0,
    falling_fast_rate: 2,
    missing_delay_minutes: 20,
  };
  const mapped = withLegacyMirrors(legacy);
  assert.equal(mapped.categories.low, true, 'any low rule on means Low is on');
  assert.equal(mapped.low_mgdl, 100, 'the lowest enabled low level becomes the one level');
  assert.equal(mapped.categories.high, false, 'a high nobody switched on is not invented');
  assert.equal(mapped.categories.changing_fast, true);
  assert.equal(mapped.fast_direction, 'falling');
  assert.equal(mapped.categories.sensor_problems, true);
  assert.equal(mapped.missing_delay_minutes, 20);
  assert.equal(mapped.repeat_minutes.missing_readings, 15);
  // The absorbed choices are gone as choices but their columns still exist.
  assert.equal(mapped.categories.custom_low, true, 'the engine still reads its mirror');
  assert.equal(mapped.custom_low_mgdl, 100);
  assert.equal(mapped.categories.below_range, false);
  assert.equal(mapped.categories.above_range, false);
});

test('a comfort-zone-only account keeps the boundary it was actually alerted at', () => {
  const mapped = withLegacyMirrors(
    { master_enabled: true, categories: { below_range: true, above_range: true } },
    { targetLow: 80, targetHigh: 200 }
  );
  assert.equal(mapped.low_mgdl, 80);
  assert.equal(mapped.high_mgdl, 200);
  assert.equal(mapped.categories.low, true);
  assert.equal(mapped.categories.high, true);
});

test('the lowest enabled level wins, and a level outside the row is clamped into it', () => {
  const twoLows = withLegacyMirrors({
    master_enabled: true,
    categories: { custom_low: true, low_glucose: true },
    custom_low_mgdl: 95,
  });
  assert.equal(twoLows.low_mgdl, 70, 'the fixed 70 is lower than 95, so it survives');

  const tooLow = withLegacyMirrors({ master_enabled: true, categories: { custom_low: true }, custom_low_mgdl: 40 });
  assert.equal(tooLow.low_mgdl, 55, 'urgent low owns everything below 55');

  const high = withLegacyMirrors({ master_enabled: true, categories: { custom_high: true }, custom_high_mgdl: 120 });
  assert.equal(high.high_mgdl, 140);
});

test('a saved sustained delay becomes the optional fifteen minutes', () => {
  const mapped = withLegacyMirrors({ master_enabled: true, categories: { custom_high: true }, custom_high_mgdl: 200, custom_high_minutes: 30 });
  assert.equal(mapped.high_sustained_minutes, 15);
  assert.equal(mapped.custom_high_minutes, 15, 'the engine reads the same fifteen minutes');
});

test('two directions resolve to the more sensitive pace, and an ambiguous level is dropped', () => {
  const mapped = withLegacyMirrors({
    master_enabled: true,
    categories: { falling_fast: true, rising_fast: true },
    falling_fast_rate: 3,
    rising_fast_rate: 2,
    falling_fast_level_mgdl: 100,
    rising_fast_level_mgdl: 160,
  });
  assert.equal(mapped.fast_direction, 'both');
  assert.equal(mapped.fast_rate, 2, 'the lower pace alerts sooner, so it wins');
  assert.equal(mapped.fast_level_mgdl, null, 'one level cannot describe both directions');

  const single = withLegacyMirrors({
    master_enabled: true,
    categories: { rising_fast: true },
    rising_fast_rate: 3,
    rising_fast_level_mgdl: 160,
  });
  assert.equal(single.fast_direction, 'rising');
  assert.equal(single.fast_level_mgdl, 160);
});

// ── What the engine does with the mapped row ──────────────────────────────

test('Low at 100 speaks on every distinct reading below it, and urgent still wins below 55', () => {
  const r = runner(stored({ low_mgdl: 100 }));
  assert.equal(r.step(0, 100), null, 'on the level is not below it');
  assert.equal(r.step(5, 99).category, 'custom_low');
  assert.equal(r.step(10, 70).category, 'custom_low');
  assert.equal(r.step(15, 54).category, 'urgent_low');
  assert.equal(r.emitted.length, 3);
});

test('High speaks on the first reading at or above it, then not again until it comes back down', () => {
  const r = runner(stored({ high_mgdl: 180 }));
  assert.equal(r.step(0, 185).category, 'custom_high');
  for (const m of [5, 10, 15, 20]) assert.equal(r.step(m, 181), null, 'still the same excursion');
  // Two consecutive readings back under the level (bound minus 5) re-arm it.
  r.step(25, 174);
  r.step(30, 173);
  assert.equal(r.step(35, 185).category, 'custom_high');
});

test('High waits fifteen minutes when that is the chosen row setting', () => {
  const r = runner(stored({ high_mgdl: 180, high_sustained_minutes: 15 }));
  assert.equal(r.step(0, 185), null, 'not yet — it has to last');
  assert.equal(r.step(5, 186), null);
  assert.equal(r.step(10, 187), null);
  assert.equal(r.step(15, 188).category, 'custom_high');
});

test('Changing fast watches both directions at the chosen pace', () => {
  const rising = runner(stored({ fast_direction: 'both', fast_rate: 2 }));
  [100, 110, 120].forEach((value, i) => rising.step(i * 5, value));
  assert.equal(rising.step(15, 130).category, 'rising_fast');

  const falling = runner(stored({ fast_direction: 'both', fast_rate: 2 }));
  [160, 140, 120].forEach((value, i) => falling.step(i * 5, value));
  assert.equal(falling.step(15, 100).category, 'falling_fast');

  const risingOnly = runner(stored({ fast_direction: 'rising', fast_rate: 2 }));
  [160, 140, 120].forEach((value, i) => risingOnly.step(i * 5, value));
  assert.equal(risingOnly.step(15, 100), null, 'a falling row that was not chosen stays quiet');
});

test('Sensor problems keeps the twenty minute delay and the fifteen minute repeat', () => {
  const prefs = stored({});
  assert.equal(prefs.missing_delay_minutes, 20);
  assert.equal(prefs.repeat_minutes.missing_readings, 15);

  const quiet25 = [row(-25, 120)];
  const decision = decideMissingNotification({ rows: quiet25, nowMs: T, delayMinutes: prefs.missing_delay_minutes, connection: { status: 'connected' } });
  assert.equal(decision?.category, 'missing_readings');
  assert.equal(decision.quietMinutes, 25);

  const quiet15 = [row(-15, 120)];
  assert.equal(
    decideMissingNotification({ rows: quiet15, nowMs: T, delayMinutes: prefs.missing_delay_minutes, connection: { status: 'connected' } }),
    null,
    'fifteen quiet minutes is inside the delay'
  );
});

// ── Validation of the six rows ────────────────────────────────────────────

test('levels, pace, direction and sustained time only accept what the row offers', () => {
  const low = (value) => sanitizePersonalPreferences({ low_mgdl: value }, null);
  for (const value of [55, 70, 100]) assert.equal(low(value).error, null);
  for (const value of [54, 101, 72.5, '80', true]) assert.equal(low(value).error, 'invalid_low_mgdl');

  const high = (value) => sanitizePersonalPreferences({ high_mgdl: value }, null);
  for (const value of [140, 180, 400]) assert.equal(high(value).error, null);
  for (const value of [139, 401, 180.5]) assert.equal(high(value).error, 'invalid_high_mgdl');

  assert.equal(sanitizePersonalPreferences({ fast_rate: 2 }, null).error, null);
  assert.equal(sanitizePersonalPreferences({ fast_rate: 2.5 }, null).error, 'invalid_fast_rate');
  assert.equal(sanitizePersonalPreferences({ fast_direction: 'sideways' }, null).error, 'invalid_fast_direction');
  assert.equal(sanitizePersonalPreferences({ fast_level_mgdl: 39 }, null).error, 'invalid_fast_level_mgdl');
  assert.equal(sanitizePersonalPreferences({ fast_level_mgdl: null }, null).value.fast_level_mgdl, null, 'the level condition is optional');
  assert.equal(sanitizePersonalPreferences({ high_sustained_minutes: 30 }, null).error, 'invalid_high_sustained_minutes');
});

test('a row turns on only when the switch says so', () => {
  const off = stored({ categories: { high: false } });
  assert.equal(off.categories.high, false);
  assert.equal(off.categories.custom_high, false, 'the engine mirror follows the row');
  assert.equal(off.custom_high_mgdl, null);

  const withLevelButOff = stored({ categories: { low: false }, low_mgdl: 95 });
  assert.equal(withLevelButOff.categories.low, false);
  assert.equal(withLevelButOff.low_mgdl, 95);
  assert.equal(withLevelButOff.categories.custom_low, false);
  assert.equal(withLevelButOff.categories.low_glucose, false, 'no low boundary is left armed');
});