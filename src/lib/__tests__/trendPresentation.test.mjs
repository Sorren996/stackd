import test from 'node:test';
import assert from 'node:assert/strict';
import { trendPresentation, trendLevelFromRate } from '../trendPresentation.js';
import { resolveGlucoseTrend } from '../glucoseTrend.js';
const now = Date.parse('2026-11-13T12:00:00Z');
const rows = [149, 154, 162, 166].map((value, i) => ({ value, source: 'dexcom_share', trend: 'Flat', recorded_at: new Date(now - (3 - i) * 300000).toISOString() }));
const levels = [['Flat', 'right', 'holding steady'], ['FortyFiveUp', 'up-right', 'drifting up'], ['SingleUp', 'up', 'climbing'], ['DoubleUp', 'double_up', 'climbing fast'], ['FortyFiveDown', 'down-right', 'easing down'], ['SingleDown', 'down', 'falling'], ['DoubleDown', 'double_down', 'falling fast']];
for (const [raw, icon, word] of levels) test(raw, () => {
  const result = resolveGlucoseTrend({ ...rows.at(-1), trend: raw }, rows, { now });
  assert.deepEqual(trendPresentation(result), { icon, word });
  assert.equal(result.label, word);
});
test('Flat is authoritative despite a 17 mg/dL rise', () => {
  assert.equal(resolveGlucoseTrend(rows.at(-1), rows, { now }).word, 'holding steady');
});
test('stale and unusable sensor trends omit both arrow and word', () => {
  assert.equal(resolveGlucoseTrend(rows.at(-1), rows, { now: now + 8 * 60000 }), null);
  for (const trend of [null, '', 'NotComputable', 'RateOutOfRange', 'None']) assert.equal(resolveGlucoseTrend({ ...rows.at(-1), trend }, rows, { now }), null);
});
test('seven derived tiers, symmetric boundaries and below-zone override', () => {
  for (const [rate, icon] of [[0, 'right'], [.999, 'right'], [-.999, 'right'], [1, 'up-right'], [1.999, 'up-right'], [2, 'up'], [2.999, 'up'], [3, 'double_up'], [-1, 'down-right'], [-2, 'down'], [-3, 'double_down']]) assert.equal(trendLevelFromRate(rate).icon, icon);
  assert.equal(trendLevelFromRate(null), null);
  for (const trend of ['FortyFiveUp', 'SingleUp', 'DoubleUp']) assert.equal(resolveGlucoseTrend({ ...rows.at(-1), trend }, rows, { now, below: true }).word, 'coming back up');
});