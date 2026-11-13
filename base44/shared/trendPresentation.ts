// Canonical display mapping. Keep the backend mirror byte-for-byte identical.
const LEVELS = {
  doubleup: { icon: 'double_up', word: 'climbing fast' },
  singleup: { icon: 'up', word: 'climbing' },
  fortyfiveup: { icon: 'up-right', word: 'drifting up' },
  flat: { icon: 'right', word: 'holding steady' },
  fortyfivedown: { icon: 'down-right', word: 'easing down' },
  singledown: { icon: 'down', word: 'falling' },
  doubledown: { icon: 'double_down', word: 'falling fast' },
};
const ALIASES = { up: 'singleup', down: 'singledown', right: 'flat', upright: 'fortyfiveup', downright: 'fortyfivedown', upup: 'doubleup', downdown: 'doubledown', downup: 'fortyfiveup', updown: 'fortyfivedown' };
const GLYPHS = { double_up: '↑↑', up: '↑', 'up-right': '↗', right: '→', 'down-right': '↘', down: '↓', double_down: '↓↓' };
export function trendPresentation(resolvedTrend, { stale = false, below = false } = {}) {
  if (stale) return null;
  const raw = typeof resolvedTrend === 'string' ? resolvedTrend : resolvedTrend?.icon;
  if (typeof raw !== 'string') return null;
  const key = raw.toLowerCase().replace(/[^a-z]/g, '');
  const pair = LEVELS[ALIASES[key] || key];
  if (!pair) return null;
  const rising = ['up-right', 'up', 'double_up'].includes(pair.icon);
  return { icon: pair.icon, word: below && rising ? 'coming back up' : pair.word };
}
export function trendGlyph(resolvedTrend) {
  const pair = trendPresentation(resolvedTrend);
  return pair ? GLYPHS[pair.icon] : null;
}
export function trendLevelFromRate(velocity) {
  if (velocity == null || !Number.isFinite(Number(velocity))) return null;
  const rate = Number(velocity);
  const magnitude = Math.abs(rate);
  const level = magnitude < 1 ? 'flat' : magnitude < 2 ? (rate > 0 ? 'fortyfiveup' : 'fortyfivedown') : magnitude < 3 ? (rate > 0 ? 'singleup' : 'singledown') : (rate > 0 ? 'doubleup' : 'doubledown');
  return trendPresentation(level);
}