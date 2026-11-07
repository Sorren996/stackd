import { episodeSamples, notificationVelocity, velocityMeets } from './notificationVelocity.ts';
import { sanitizeNotificationOptions } from './notificationOptions.ts';

// Notification-only hysteresis: recover >= bound+5 for low, <= bound-5 for
// high, TWO consecutive fresh measurements 3–7 min apart. A gap/stale sample
// never rearms; high persistence needs uninterrupted qualifying samples.
export const RECOVERY_MARGIN_MGDL = 5;
export const RECOVERY_SAMPLES = 2;
export const CONTINUITY_MINUTES = 7;
const minute = 60000;
const validBound = value => typeof value === 'number' && Number.isFinite(value);

export function advanceNotificationEpisodes({ rows, nowMs, preferences, thresholds, state = {}, allowed = () => true }) {
  const next = structuredClone(state);
  next.stages ||= {};
  const { samples, conflict } = episodeSamples(rows, nowMs);
  const latest = samples.at(-1);
  // Only evaluate the latest measured instant, once, never a historic crossing.
  if (!latest || latest.at <= (next.lastAt || 0) || nowMs - latest.at > 10 * minute) return { state: next, notification: null };
  const gap = latest.at - (next.lastAt || 0);
  const continuous = gap >= 3 * minute && gap <= CONTINUITY_MINUTES * minute;
  next.lastAt = latest.at;
  const prefs = preferences || {};
  const categories = prefs.categories || {};
  const options = sanitizeNotificationOptions({}, prefs).value;
  const validOptions = !sanitizeNotificationOptions({}, prefs).error;
  const velocity = conflict ? null : notificationVelocity(samples, nowMs);
  const v = latest.value;
  const defs = [
    // Fixed low/urgent are dispatched by source measurement, not episodes.
    // A genuinely different comfort-zone boundary remains independent.
    { key: 'below_range', low: thresholds?.low === 70 ? null : thresholds?.low, strict: true },
    { key: 'custom_low', low: validOptions ? options.custom_low_mgdl : null },
    { key: 'above_range', high: thresholds?.high, strict: true, delay: prefs.above_range_minutes },
    { key: 'custom_high', high: validOptions ? options.custom_high_mgdl : null, delay: options.custom_high_minutes },
    { key: 'falling_fast', velocity: true, priority: 500, level: options.falling_fast_level_mgdl, rate: options.falling_fast_rate },
    { key: 'rising_fast', velocity: true, priority: 100, level: options.rising_fast_level_mgdl, rate: options.rising_fast_rate },
  ];
  const candidates = [];
  const freshThreshold = nowMs - latest.at <= 8 * minute;
  for (const def of defs) {
    const configured = def.velocity ? validOptions && [2, 3].includes(def.rate) : validBound(def.low ?? def.high);
    const enabled = prefs.master_enabled === true && categories[def.key] === true && configured;
    let stage = next.stages[def.key] || {};
    if (!enabled) { next.stages[def.key] = { ...stage, enabled: false }; continue; }
    const config = JSON.stringify([def.low, def.high, def.rate, def.level, def.delay, prefs.category_activation?.[def.key]]);
    if (!stage.enabled || stage.config !== config) stage = { enabled: true, config,
      sentAt: state.legacyConsumed?.[def.key] && !state.stages?.[def.key] ? latest.at : null };
    next.stages[def.key] = stage;
    const matches = def.velocity
      ? velocityMeets(velocity, def.key, def.rate) && (def.level == null || (def.key === 'rising_fast' ? v >= def.level : v <= def.level))
      : def.low != null ? (def.strict ? v < def.low : v <= def.low) : (def.strict ? v > def.high : v >= def.high);
    // Unknown velocity cannot clear an episode; neither can missing/stale data.
    const recovered = def.velocity
      ? velocity != null && (def.key === 'rising_fast' ? velocity.slope <= def.rate - 0.5 && velocity.rates.every(r => r <= def.rate - 0.5) : velocity.slope >= -def.rate + 0.5 && velocity.rates.every(r => r >= -def.rate + 0.5))
      : freshThreshold && (def.low != null ? v >= def.low + RECOVERY_MARGIN_MGDL : v <= def.high - RECOVERY_MARGIN_MGDL);
    const intervening = samples.filter(s => s.at > (state.lastAt || 0) && s.at < latest.at);
    const uninterruptedRecovery = continuous && !intervening.some(s => !def.velocity && (def.low != null ? s.value < def.low + RECOVERY_MARGIN_MGDL : s.value > def.high - RECOVERY_MARGIN_MGDL));
    if (recovered) {
      stage.recovery = uninterruptedRecovery ? (stage.recovery || 0) + 1 : 1;
      if (stage.recovery >= RECOVERY_SAMPLES) {
        stage.episode = null; stage.sentAt = null; stage.repeatIndex = 0;
      }
    } else stage.recovery = 0;
    const continuousHigh = continuous && intervening.every(s => def.strict ? s.value > def.high : s.value >= def.high);
    if (def.high != null && (!freshThreshold || !matches || !continuousHigh)) stage.highSince = null;
    if (!matches || (!def.velocity && !freshThreshold)) continue;
    if (!stage.episode) {
      stage.episode = `${def.key}:${latest.at}`;
      stage.startedAt = latest.at; stage.repeatIndex = 0;
    }
    if (def.high != null) {
      stage.highSince ??= latest.at;
      if (![0, 15, 30, 60].includes(def.delay) || (latest.at - stage.highSince) / minute < def.delay) continue;
    }
    const repeat = prefs.repeat_minutes?.[def.key];
    const repeatDue = [15, 30, 60, 120].includes(repeat) && latest.at - stage.sentAt >= repeat * minute;
    if (stage.sentAt != null && !repeatDue) continue;
    candidates.push({ category: def.key, episodeKey: stage.episode, sample: latest,
      durationMinutes: def.high != null ? def.delay : null,
      priority: def.priority ?? (def.low != null ? 2000 - def.low : 600 + def.high),
      repeatIndex: stage.sentAt == null ? 0 : (stage.repeatIndex || 0) + 1 });
  }
  const permitted = candidates.filter(c => allowed(c.category));
  if (!permitted.length) return { state: next, notification: null };
  permitted.sort((a, b) => b.priority - a.priority);
  // Equal selected/comfort bounds represent the same excursion even though
  // custom comparators are inclusive and comfort comparators are strict.
  const covered = [...candidates];
  for (const [custom, comfort, bound] of [['custom_low', 'below_range', 'low'], ['custom_high', 'above_range', 'high']]) {
    const a = defs.find(d => d.key === custom), b = defs.find(d => d.key === comfort);
    if (a[bound] == null || a[bound] !== b[bound]) continue;
    if (!candidates.some(c => c.category === custom || c.category === comfort)) continue;
    for (const key of [custom, comfort]) {
      if (!categories[key] || !allowed(key) || covered.some(c => c.category === key)) continue;
      const stage = next.stages[key];
      if (!stage?.enabled) continue;
      stage.episode ||= `${key}:${latest.at}`;
      covered.push({ category: key, episodeKey: stage.episode, repeatIndex: 0 });
    }
  }
  for (const event of covered) {
    const stage = next.stages[event.category];
    stage.sentAt = latest.at;
    stage.repeatIndex = event.repeatIndex;
  }
  return { state: next, notification: { ...permitted[0], coveredEvents: covered.map(({ category, episodeKey, repeatIndex }) => ({ category, episodeKey, repeatIndex })) } };
}