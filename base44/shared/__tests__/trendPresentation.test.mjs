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