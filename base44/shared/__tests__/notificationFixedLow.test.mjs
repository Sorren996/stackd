import test from 'node:test';
import assert from 'node:assert/strict';
import { fixedLowDecisions, fixedLowKey } from '../notificationFixedLow.ts';
import { sanitizePersonalPreferences, sanitizeFollowerPreferences } from '../notificationCore.ts';
const now = Date.now();
const reading = (value, extra = {}) => ({ id: 'row', source: 'dexcom_share', recorded_at: new Date(now).toISOString(), value, ...extra });
const prefs = categories => ({ master_enabled: true, categories });
const decide = (categories, rows, extra = {}) => fixedLowDecisions({ rows, preferences: prefs(categories), nowMs: now, thresholds: { low: 85 }, ...extra });
test('four distinct low readings have four eligible events, urgent severity below 55', () => {
  const items = [69, 68, 54, 53].flatMap((value, i) => decide({ low_glucose: true, urgent_low: true }, [reading(value, { id: String(i), recorded_at: new Date(now - (3 - i) * 60000).toISOString() })]));
  assert.deepEqual(items.map(item => item.category), ['low_glucose', 'low_glucose', 'urgent_low', 'urgent_low']);
  assert.equal(new Set(items.map(item => item.episodeKey)).size, 4);
  assert.equal(items[2].coveredEvents.length, 2);
});
test('all low/urgent combinations, strict bounds and master off', () => {
  for (const low of [false, true]) for (const urgent of [false, true]) {
    for (const value of [70, 69, 55, 54]) {
      const items = decide({ low_glucose: low, urgent_low: urgent }, [reading(value)]);
      assert.equal(items.length, value < 70 && (low || (urgent && value < 55)) ? 1 : 0, `${low}/${urgent}/${value}`);
      if (items.length) assert.equal(items[0].category, value < 55 ? 'urgent_low' : 'low_glucose');
    }
  }
  assert.equal(decide({ low_glucose: true }, [reading(54)], { preferences: { master_enabled: false, categories: { low_glucose: true } } }).length, 0);
});
test('stale, future, synthetic and historical backfill never create low events', () => {
  for (const row of [reading(69, { recorded_at: new Date(now - 9 * 60000).toISOString() }), reading(69, { recorded_at: new Date(now + 1).toISOString() }), reading(69, { source: 'system' }), reading(69, { created_date: new Date(now).toISOString(), recorded_at: new Date(now - 9 * 60000).toISOString() })]) assert.equal(decide({ low_glucose: true }, [row]).length, 0);
  assert.equal(decide({ low_glucose: true }, [reading(69), reading(69, { id: 'duplicate' })]).length, 1);
});
test('old repeat/delay values and invalid custom configuration do not affect fixed eligibility', () => {
  for (const repeat of [null, 15, 120, 999]) {
    const preferences = { ...prefs({ low_glucose: true, urgent_low: true, custom_low: true }), custom_low_mgdl: NaN, above_range_minutes: 60, repeat_minutes: { low_glucose: repeat, below_range: repeat, urgent_low: repeat } };
    assert.equal(decide({}, [reading(54)], { preferences })[0].category, 'urgent_low');
  }
});
test('legacy 70 choices survive; a different comfort boundary is never remapped or changed', () => {
  assert.equal(fixedLowKey(prefs({ below_range: true }), { low: 70 }), 'below_range');
  assert.equal(decide({ below_range: true }, [reading(69)]).length, 0);
  assert.equal(decide({ below_range: true }, [reading(69)], { thresholds: { low: 70 } }).length, 1);
  assert.equal(decide({ low_glucose: false, below_range: true }, [reading(69)], { thresholds: { low: 70 } }).length, 0);
  const existing = prefs({ below_range: true });
  const saved = sanitizePersonalPreferences({ categories: { low_glucose: false } }, existing);
  assert.equal(saved.value.categories.below_range, true); assert.equal(saved.value.categories.low_glucose, false);
});
test('a follower cannot opt into the new stream without its own explicit grant', () => {
  const relation = { push: { below_range: true }, scopes: { glucose: true } };
  const result = sanitizeFollowerPreferences({ categories: { low_glucose: true } }, null, relation);
  assert.equal(result.value.categories.low_glucose, false);
});
test('an opt-in cannot replay a reading measured before it', () => {
  const preferences = { ...prefs({ low_glucose: true }), category_activation: { low_glucose: `${new Date(now + 100).toISOString()}|activation` } };
  assert.equal(decide({}, [reading(69)], { preferences }).length, 0);
});