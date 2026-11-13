import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGlucoseTrend } from '../glucoseTrend.ts';
import { buildNotificationCopy } from '../notificationCore.ts';
const now = Date.parse('2026-11-13T12:00:00Z');
const rows = [149, 154, 162, 166].map((value, i) => ({ value, source: 'dexcom_share', trend: 'Flat', recorded_at: new Date(now - (3 - i) * 300000).toISOString() }));
const categories = ['low_glucose', 'urgent_low', 'custom_low', 'below_range', 'above_range', 'custom_high', 'rising_fast', 'falling_fast', 'all_readings'];
const levels = [['Flat', '→', 'holding steady'], ['FortyFiveUp', '↗', 'drifting up'], ['SingleUp', '↑', 'climbing'], ['DoubleUp', '↑↑', 'climbing fast'], ['FortyFiveDown', '↘', 'easing down'], ['SingleDown', '↓', 'falling'], ['DoubleDown', '↓↓', 'falling fast']];
for (const [trend, glyph, word] of levels) test(`${trend} in every detailed push category`, () => {
  const resolvedTrend = resolveGlucoseTrend({ ...rows.at(-1), trend }, rows, { now });
  for (const category of categories) {
    const copy = buildNotificationCopy({ category, value: 166, showDetails: true, resolvedTrend, nowMs: now, readingAt: now });
    assert.ok(copy.title.endsWith(`${glyph} ${word}`));
  }
});
test('stale pushes keep the value without any trend', () => {
  const resolvedTrend = resolveGlucoseTrend(rows.at(-1), rows, { now: now + 8 * 60000 });
  assert.equal(resolvedTrend, null);
  for (const category of categories) assert.ok(buildNotificationCopy({ category, value: 166, showDetails: true, resolvedTrend }).title.endsWith('166 mg/dL'));
});
test('below-zone override is the same in push; private previews remain private', () => {
  const resolvedTrend = resolveGlucoseTrend({ ...rows.at(-1), trend: 'DoubleUp', value: 60 }, rows, { now, below: true });
  const input = { category: 'custom_low', value: 60, resolvedTrend, showDetails: true, thresholdMgdl: 70 };
  assert.ok(buildNotificationCopy(input).title.endsWith('↑↑ coming back up'));
  const hidden = buildNotificationCopy({ ...input, showDetails: false });
  assert.ok(!hidden.title.includes('↑'));
  assert.ok(!hidden.body.includes('coming back up'));
});

test('all_readings drops Glucose: prefix and states comfort-zone status without repeating the reading', () => {
  const flatRows = [122, 123, 124, 124].map((value, i) => ({
    value,
    source: 'dexcom_share',
    trend: 'Flat',
    recorded_at: new Date(now - (3 - i) * 300000).toISOString(),
  }));
  const resolvedTrend = resolveGlucoseTrend(flatRows.at(-1), flatRows, { now });

  const inZone = buildNotificationCopy({
    category: 'all_readings',
    value: 124,
    units: 'mg/dL',
    showDetails: true,
    resolvedTrend,
    targetLow: 70,
    targetHigh: 180,
    nowMs: now,
    readingAt: now,
  });
  assert.equal(inZone.title, '124 mg/dL → holding steady');
  assert.equal(inZone.body, 'In your comfort zone');

  const noTrend = buildNotificationCopy({
    category: 'all_readings',
    value: 124,
    units: 'mg/dL',
    showDetails: true,
    resolvedTrend: null,
    trend: null,
    targetLow: 70,
    targetHigh: 180,
  });
  assert.equal(noTrend.title, '124 mg/dL');
  assert.equal(noTrend.body, 'In your comfort zone');

  const aboveZone = buildNotificationCopy({
    category: 'all_readings',
    value: 165,
    units: 'mg/dL',
    showDetails: true,
    resolvedTrend,
    targetLow: 80,
    targetHigh: 160,
  });
  assert.equal(aboveZone.body, 'Above your comfort zone');

  const belowZone = buildNotificationCopy({
    category: 'all_readings',
    value: 75,
    units: 'mg/dL',
    showDetails: true,
    resolvedTrend,
    targetLow: 80,
    targetHigh: 160,
  });
  assert.equal(belowZone.body, 'Below your comfort zone');

  const privatePreview = buildNotificationCopy({
    category: 'all_readings',
    value: 124,
    units: 'mg/dL',
    showDetails: false,
    resolvedTrend,
    targetLow: 70,
    targetHigh: 180,
  });
  assert.equal(privatePreview.title, 'Stackd update');
  assert.equal(privatePreview.body, 'Open Stackd to review.');

  // Low glucose alert copy remains untouched.
  const lowAlert = buildNotificationCopy({
    category: 'low_glucose',
    value: 66,
    units: 'mg/dL',
    showDetails: true,
    thresholdMgdl: 70,
  });
  assert.equal(lowAlert.title, 'Low glucose: 66 mg/dL');
  assert.equal(lowAlert.body, 'Your glucose is below 70 mg/dL.');
});