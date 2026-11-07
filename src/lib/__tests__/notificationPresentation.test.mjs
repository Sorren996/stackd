import test from 'node:test';
import assert from 'node:assert/strict';
import { ALERT_GROUPS, alertSummary, alertTimingSummary, needsAlertSetup, mergeNotificationPatch, savedPatchMatches } from '../notifications/notificationPresentation.js';
const thresholds = { units: 'mg/dL', target_low: 70, target_high: 180 };
test('all prior categories remain alongside fixed low, urgent first', () => {
  const keys = ALERT_GROUPS.flatMap(group => group.keys);
  assert.equal(keys.length, 9); assert.equal(new Set(keys).size, 9); assert.equal(keys[0], 'urgent_low');
});
test('saved summaries use actual operators, units, bounds and delay', () => {
  assert.equal(alertSummary('custom_high', {}, thresholds), 'Choose a level');
  assert.equal(alertSummary('custom_low', { custom_low_mgdl: 100 }, thresholds), 'At or below 100 mg/dL');
  assert.equal(alertSummary('custom_high', { custom_high_mgdl: 180 }, thresholds), 'At or above 180 mg/dL');
  assert.equal(alertSummary('above_range', {}, thresholds), 'Above 180 mg/dL');
  assert.equal(alertSummary('below_range', {}, thresholds), 'Below 70 mg/dL');
  assert.equal(alertSummary('urgent_low', {}, thresholds), 'Every new reading below 55 mg/dL');
  assert.equal(alertSummary('missing_readings', { missing_delay_minutes: 20 }, thresholds), 'No new readings for 20 minutes');
  assert.equal(alertSummary('falling_fast', { falling_fast_rate: 3 }, thresholds), 'Falling by 3 mg/dL per minute or faster');
  assert.equal(alertSummary('custom_low', { custom_low_mgdl: 100 }, { units: 'mmol/L' }), 'At or below 5.6 mmol/L');
});
test('timing and optional conditions stay visible outside the editor', () => {
  assert.equal(alertTimingSummary('custom_high', { custom_high_minutes: 30, repeat_minutes: { custom_high: 120 } }), 'After 30 minutes · Remind every 120 minutes');
  assert.equal(alertTimingSummary('falling_fast', { falling_fast_level_mgdl: 100 }), 'Only at or below 100 mg/dL');
  assert.equal(alertTimingSummary('custom_high', { custom_high_minutes: 0 }), '');
});
test('unset custom levels, pace and required timings require explicit setup', () => {
  for (const key of ['custom_low', 'custom_high', 'falling_fast', 'rising_fast', 'above_range', 'missing_readings']) assert.equal(needsAlertSetup(key, {}), true);
  assert.equal(needsAlertSetup('custom_low', { custom_low_mgdl: 100 }), false);
  assert.equal(needsAlertSetup('above_range', { above_range_minutes: 30 }), false);
  assert.equal(needsAlertSetup('urgent_low', {}), false);
});
test('editing does not opt in; only an explicit category patch enables', () => {
  const saved = { categories: { custom_low: false, urgent_low: true }, repeat_minutes: { urgent_low: 30 }, custom_low_mgdl: 90 };
  const changed = mergeNotificationPatch(saved, { custom_low_mgdl: 100, repeat_minutes: { custom_low: 15 } });
  assert.deepEqual(changed.categories, saved.categories);
  assert.deepEqual(changed.repeat_minutes, { urgent_low: 30, custom_low: 15 });
  assert.equal(saved.custom_low_mgdl, 90);
  assert.equal(mergeNotificationPatch(changed, { categories: { custom_low: true } }).categories.custom_low, true);
});
test('persisted confirmation detects denied opt-in, failed value persistence and null repeat normalization', () => {
  assert.equal(savedPatchMatches({ categories: { custom_low: false } }, { categories: { custom_low: true } }), false);
  assert.equal(savedPatchMatches({ custom_low_mgdl: 90 }, { custom_low_mgdl: 100 }), false);
  assert.equal(savedPatchMatches({ repeat_minutes: {} }, { repeat_minutes: { custom_low: null } }), true);
  assert.equal(savedPatchMatches(null, {}), false);
});