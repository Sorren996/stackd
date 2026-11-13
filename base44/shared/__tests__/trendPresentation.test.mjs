import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveGlucoseTrend } from '../glucoseTrend.ts';
import { buildNotificationCopy } from '../notificationCore.ts';

const now = Date.parse('2026-11-13T12:00:00Z');
const rows = [149, 154, 162, 166].map((value, i) => ({
  value,
  source: 'dexcom_share',
  trend: 'Flat',
  recorded_at: new Date(now - (3 - i) * 300000).toISOString(),
}));
const categories = [
  'low_glucose',
  'urgent_low',
  'custom_low',
  'below_range',
  'above_range',
  'custom_high',
  'rising_fast',
  'falling_fast',
  'all_readings',
];
const levels = [
  ['Flat', '→', 'Holding steady'],
  ['FortyFiveUp', '↗', 'Drifting up'],
  ['SingleUp', '↑', 'Climbing'],
  ['DoubleUp', '↑↑', 'Climbing fast'],
  ['FortyFiveDown', '↘', 'Easing down'],
  ['SingleDown', '↓', 'Falling'],
  ['DoubleDown', '↓↓', 'Falling fast'],
];

for (const [trend, glyph, capWord] of levels) {
  test(`${trend} in every detailed push category uses "{value} {unit} {arrow}" title and capitalised trend body on all_readings`, () => {
    const resolvedTrend = resolveGlucoseTrend({ ...rows.at(-1), trend }, rows, { now });
    for (const category of categories) {
      const copy = buildNotificationCopy({
        category,
        value: 166,
        units: 'mg/dL',
        showDetails: true,
        resolvedTrend,
        thresholdMgdl: category === 'custom_low' ? 100 : category === 'custom_high' ? 180 : 70,
        nowMs: now,
        readingAt: now,
      });
      assert.equal(copy.title, `166 mg/dL ${glyph}`);
      if (category === 'all_readings') {
        assert.equal(copy.body, capWord);
      }
    }
  });
}

test('stale pushes keep "{value} {unit}" with no arrow, and all_readings falls back to comfort zone body', () => {
  const resolvedTrend = resolveGlucoseTrend(rows.at(-1), rows, { now: now + 8 * 60000 });
  assert.equal(resolvedTrend, null);
  for (const category of categories) {
    const copy = buildNotificationCopy({
      category,
      value: 166,
      units: 'mg/dL',
      showDetails: true,
      resolvedTrend,
      targetLow: 70,
      targetHigh: 180,
      thresholdMgdl: category === 'custom_low' ? 100 : category === 'custom_high' ? 180 : 70,
    });
    assert.equal(copy.title, '166 mg/dL');
  }
});

test('below-zone override keeps arrow-only title; private previews remain private', () => {
  const resolvedTrend = resolveGlucoseTrend(
    { ...rows.at(-1), trend: 'DoubleUp', value: 60 },
    rows,
    { now, below: true }
  );
  const input = { category: 'custom_low', value: 60, units: 'mg/dL', resolvedTrend, showDetails: true, thresholdMgdl: 100 };
  const shown = buildNotificationCopy(input);
  assert.equal(shown.title, '60 mg/dL ↑↑');
  assert.equal(shown.body, 'Below 100');

  const hidden = buildNotificationCopy({ ...input, showDetails: false });
  assert.ok(!hidden.title.includes('↑'));
  assert.ok(!hidden.body.includes('100'));
});

test('all_readings uses capitalised trend word when trend exists, and comfort-zone status when trend is absent', () => {
  const flatRows = [122, 123, 124, 124].map((value, i) => ({
    value,
    source: 'dexcom_share',
    trend: 'Flat',
    recorded_at: new Date(now - (3 - i) * 300000).toISOString(),
  }));
  const resolvedTrend = resolveGlucoseTrend(flatRows.at(-1), flatRows, { now });

  const withTrend = buildNotificationCopy({
    category: 'all_readings',
    value: 145,
    units: 'mg/dL',
    showDetails: true,
    resolvedTrend,
    targetLow: 70,
    targetHigh: 180,
    nowMs: now,
    readingAt: now,
  });
  assert.equal(withTrend.title, '145 mg/dL →');
  assert.equal(withTrend.body, 'Holding steady');

  const noTrendInZone = buildNotificationCopy({
    category: 'all_readings',
    value: 124,
    units: 'mg/dL',
    showDetails: true,
    resolvedTrend: null,
    trend: null,
    targetLow: 70,
    targetHigh: 180,
  });
  assert.equal(noTrendInZone.title, '124 mg/dL');
  assert.equal(noTrendInZone.body, 'In your comfort zone');

  const noTrendAbove = buildNotificationCopy({
    category: 'all_readings',
    value: 165,
    units: 'mg/dL',
    showDetails: true,
    resolvedTrend: null,
    trend: null,
    targetLow: 80,
    targetHigh: 160,
  });
  assert.equal(noTrendAbove.body, 'Above your comfort zone');

  const noTrendBelow = buildNotificationCopy({
    category: 'all_readings',
    value: 75,
    units: 'mg/dL',
    showDetails: true,
    resolvedTrend: null,
    trend: null,
    targetLow: 80,
    targetHigh: 160,
  });
  assert.equal(noTrendBelow.body, 'Below your comfort zone');

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
});