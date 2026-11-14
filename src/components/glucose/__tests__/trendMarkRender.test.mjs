// The dashboard's trend arrow is rendered for every state the current-glucose
// card can be in, including the ones where there is no direction to show.
//
// The crash this guards against: with no readings yet the trend resolver
// correctly answers null, and the card then fed that null into an icon lookup,
// which took down the whole dashboard. These tests render the real mark and
// assert two things at once — nothing throws, and no arrow appears to claim a
// direction nobody measured (in particular never the steady arrow). A genuine
// direction still draws its own arrow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { resolveGlucoseTrend, TREND_ICON_KEYS } from '../../../lib/glucoseTrend.js';
import TrendMark, { trendIconFor } from '../TrendMark.js';

const at = (minutesFromNow) => new Date(Date.UTC(2026, 10, 7, 12, 0) + minutesFromNow * 60000).toISOString();

const reading = (value, minutesFromNow, extra = {}) => ({
  value,
  recorded_at: at(minutesFromNow),
  ...extra,
});

// Renders the mark the way the current-glucose card does.
const render = (trend) => renderToStaticMarkup(createElement(TrendMark, { trend }));

const drawsNothing = (trend) => {
  const html = render(trend);
  assert.equal(html, '', 'no arrow should be drawn when there is no direction');
  return html;
};

test('no latest reading and no stored readings: nothing is drawn and nothing throws', () => {
  const trend = resolveGlucoseTrend(null, []);
  assert.equal(trend, null);
  drawsNothing(trend);
});

test('loading state (no reading in hand yet): nothing is drawn', () => {
  drawsNothing(null);
  drawsNothing(undefined);
  drawsNothing({});
});

test('a single manual reading is not enough to assert a direction', () => {
  const one = [reading(124, 0, { source: 'manual' })];
  const trend = resolveGlucoseTrend(one[0], one);
  assert.equal(trend, null);
  drawsNothing(trend);
});

test('a sensor reading without its own arrow and no history to derive one from draws nothing', () => {
  const one = [reading(118, 0, { source: 'dexcom', trend: undefined })];
  assert.equal(resolveGlucoseTrend(one[0], one), null);
  drawsNothing(resolveGlucoseTrend(one[0], one));
});

test('an unrecognised sensor arrow is not turned into the steady arrow', () => {
  const one = [reading(131, 0, { source: 'dexcom', trend: 'sideways' })];
  assert.equal(resolveGlucoseTrend(one[0], one), null);
  drawsNothing(resolveGlucoseTrend(one[0], one));
  drawsNothing({ icon: 'sideways', label: 'Unknown' });
});

test('readings that cannot produce a rate draw nothing', () => {
  // Same timestamp twice: there is no interval to measure across.
  const sameTime = [reading(110, 0), reading(150, 0)];
  assert.equal(resolveGlucoseTrend(sameTime[0], sameTime), null);
  drawsNothing(resolveGlucoseTrend(sameTime[0], sameTime));

  // A value that is not a number is not evidence of a direction.
  const unreadable = [reading('n/a', 0), reading(140, 5)];
  assert.equal(resolveGlucoseTrend(unreadable[0], unreadable), null);
  drawsNothing(resolveGlucoseTrend(unreadable[0], unreadable));
});

test('absent directions never render the steady arrow or any glyph', () => {
  const cases = [null, undefined, {}, { icon: null }, { icon: '' }, { icon: 'constructor' }, { icon: 'Stable' }];
  for (const trend of cases) {
    const html = render(trend);
    assert.equal(html, '');
    assert.ok(!html.includes('<svg'));
    assert.ok(!html.includes('lucide-arrow-right'));
  }
});

test('a valid sensor arrow keeps its own direction', () => {
  const flat = resolveGlucoseTrend(reading(112, 0, { source: 'dexcom', trend: 'flat' }), []);
  assert.equal(flat.icon, 'right');
  const flatMarkup = render(flat);
  assert.ok(flatMarkup.includes('lucide-arrow-right'));
  assert.ok(flatMarkup.includes('Stable'));

  const share = resolveGlucoseTrend(reading(96, 0, { source: 'dexcom_share', trend: 'doubleDown' }), []);
  assert.equal(share.icon, 'double_down');
  assert.ok(render(share).includes('lucide-chevrons-down'));
});

test('a valid derived arrow keeps its own direction', () => {
  // The arrow and the projection share one measured velocity (Theil–Sen over
  // the last 15 minutes, three samples minimum), so a "Rising quickly" arrow has
  // to be earned by a measured climb of 3 mg/dL/min or more: +15 mg/dL every
  // five minutes.
  const now = Date.parse(at(0));
  const rising = [reading(90, -10), reading(105, -5), reading(120, 0)];
  const trend = resolveGlucoseTrend(rising[2], rising, { now });
  assert.equal(trend.icon, 'double_up');
  assert.equal(trend.origin, 'derived');
  assert.ok(render(trend).includes('lucide-chevrons-up'));

  // Two hand-logged points twenty minutes apart are two instants, not a rate.
  // No wider window is searched to turn them into a direction.
  const sparse = [reading(121, -20, { source: 'manual' }), reading(120, 0, { source: 'manual' })];
  drawsNothing(resolveGlucoseTrend(sparse[1], sparse, { now }));
});

test('every arrow the resolver can name has a mark, and no two share one', () => {
  for (const key of TREND_ICON_KEYS) {
    assert.ok(trendIconFor({ icon: key }), `${key} must have an arrow`);
  }
  const classes = TREND_ICON_KEYS.map((key) => render({ icon: key, label: 'x' }).match(/lucide-[a-z-]+/)[0]);
  assert.equal(new Set(classes).size, TREND_ICON_KEYS.length);
});