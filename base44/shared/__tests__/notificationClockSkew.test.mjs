import test from 'node:test';
import assert from 'node:assert/strict';
import { notificationAgeMinutes, PUSH_FUTURE_TOLERANCE_MINUTES } from '../notificationTiming.ts';
import { resolveGlucoseTrend } from '../glucoseTrend.ts';
import { buildNotificationCopy, normalizeSamples, isFreshSample } from '../notificationCore.ts';
import { allReadingsCandidate } from '../notificationReadingWinner.ts';
import { episodeSamples, notificationVelocity } from '../notificationVelocity.ts';
import { lowStreamDecisions } from '../notificationLowStream.ts';

const now = Date.parse('2026-11-13T22:25:38Z');
const row = (ahead, trend = 'Flat') => ({ id: 'reading', source: 'dexcom_share', value: 131, trend, recorded_at: new Date(now + ahead).toISOString() });
const resolve = r => resolveGlucoseTrend(r, [r], { now, futureToleranceMinutes: PUSH_FUTURE_TOLERANCE_MINUTES });
const pairs = [['Flat', '→', 'Holding steady'], ['FortyFiveUp', '↗', 'Drifting up'], ['SingleUp', '↑', 'Climbing'], ['DoubleUp', '↑↑', 'Climbing fast'], ['FortyFiveDown', '↘', 'Easing down'], ['SingleDown', '↓', 'Falling'], ['DoubleDown', '↓↓', 'Falling fast']];

test('all sensor trends retain the same copy before and after the measurement timestamp, up to two minutes ahead', () => {
  for (const source of ['dexcom', 'dexcom_share']) for (const ahead of [-4000, 0, 4000, 120000]) for (const [trend, glyph, body] of pairs) {
    const r = { ...row(ahead, trend), source };
    const resolvedTrend = resolve(r);
    for (const category of ['all_readings', 'below_range', 'above_range']) {
      assert.deepEqual(buildNotificationCopy({ category, value: r.value, units: 'mg/dL', resolvedTrend, showDetails: true }), { title: `131 mg/dL ${glyph}`, body });
    }
  }
});

test('age gates clamp allowed skew to zero and reject anything beyond two minutes', () => {
  for (const ahead of [4000, 120000, 120001]) {
    const r = row(ahead);
    const allowed = ahead <= 120000;
    assert.equal(notificationAgeMinutes(now + ahead, now), allowed ? 0 : null);
    assert.equal(Boolean(resolve(r)), allowed);
    assert.equal(normalizeSamples([r], now).length, allowed ? 1 : 0);
    assert.equal(isFreshSample({ at: now + ahead }, now), allowed);
    const samples = episodeSamples([r], now).samples;
    assert.equal(samples.length, allowed ? 1 : 0);
    assert.equal(Boolean(allReadingsCandidate({ samples: [{ at: now + ahead }], nowMs: now, enabled: true })), allowed);
    assert.equal(lowStreamDecisions({ rows: [{ ...r, value: 54, created_date: r.recorded_at }], nowMs: now, preferences: { master_enabled: true, categories: { urgent_low: true } }, thresholds: { low: 70 } }).length, allowed ? 1 : 0);
  }
  assert.equal(resolve(row(-8 * 60000)), null, 'stale sensor trends stay stale');
  assert.equal(resolveGlucoseTrend(row(4000), [row(4000)], { now }), null, 'non-push server consumers keep their original policy');
});

test('pace age check uses the same clock-skew allowance without changing measured intervals', () => {
  const samples = [0, 5, 10, 15].map((minute, i) => ({ at: now + 4000 - (15 - minute) * 60000, value: 100 + i * 15, source: 'dexcom_share' }));
  assert.equal(notificationVelocity(samples, now).slope, 3);
  assert.equal(notificationVelocity(samples, now - 120000), null);
});

test('genuinely unusable sensor trends are never replaced by a derived trend', () => {
  for (const trend of [undefined, 'None', 'NotComputable', 'RateOutOfRange']) {
    const r = row(4000, trend);
    r.trend = trend;
    const resolvedTrend = resolve(r);
    assert.equal(resolvedTrend, null);
    for (const category of ['all_readings', 'below_range', 'above_range']) {
      assert.deepEqual(buildNotificationCopy({ category, value: 131, resolvedTrend, showDetails: true }), { title: '131 mg/dL', body: 'New reading' });
    }
  }
});

test('no generated push contains comfort-zone wording, including followers and private previews', () => {
  const categories = ['all_readings', 'below_range', 'above_range', 'urgent_low', 'low_glucose', 'custom_low', 'custom_high', 'falling_fast', 'rising_fast', 'missing_readings', 'low_recovery'];
  for (const category of categories) for (const showDetails of [false, true]) for (const personName of [null, 'Sam']) for (const trend of [null, ...pairs.map(p => p[0])]) {
    const copy = buildNotificationCopy({ category, showDetails, personName, value: 131, trend, thresholdMgdl: 100, readingAt: now - 20 * 60000, nowMs: now });
    assert.doesNotMatch(`${copy.title} ${copy.body}`, /comfort zone|below |at or above |low glucose/i);
  }
});