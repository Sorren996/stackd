import { episodeSamples } from './notificationVelocity.ts';

// Existing below-range choices at exactly 70 already describe this stream.
// A different comfort boundary stays a separate choice, never remapped.
export function fixedLowKey(preferences, thresholds) {
  return preferences?.categories?.low_glucose == null && thresholds?.low === 70 ? 'below_range' : 'low_glucose';
}
export function fixedLowDecisions({ rows, preferences, thresholds, nowMs }) {
  if (preferences?.master_enabled !== true) return [];
  const lowKey = fixedLowKey(preferences, thresholds);
  const categories = preferences.categories || {};
  const { samples, conflict } = episodeSamples(rows, nowMs);
  if (conflict) return [];
  return samples.flatMap(sample => {
    if (nowMs - sample.at > 8 * 60000 || sample.value >= 70) return [];
    const row = rows.find(row => Date.parse(row.recorded_at) === sample.at && String(row.source || 'manual').toLowerCase() === sample.source);
    const created = Date.parse(row?.created_date);
    // Backfilled measurements and readings predating a preference change do
    // not become a queue of old alerts. Missing legacy metadata is tolerated.
    if (Number.isFinite(created) && (created - sample.at > 8 * 60000 || created > nowMs)) return [];
    const covered = [];
    if (categories[lowKey] === true) covered.push(lowKey);
    if (sample.value < 55 && categories.urgent_low === true) covered.push('urgent_low');
    const active = covered.filter(key => {
      const start = Date.parse(String(preferences.category_activation?.[key] || '').split('|')[0]);
      return !Number.isFinite(start) || sample.at >= start;
    });
    if (!active.length) return [];
    // Source + subject (added at dispatch) + measured instant: independent of
    // episode, category escalation and duplicate database row IDs.
    const identity = sample.source === 'manual' && row?.id ? `manual:id:${row.id}` : `${sample.source}:${sample.at}`;
    const episodeKey = `low-stream:v1:${identity}`;
    return [{ category: sample.value < 55 ? 'urgent_low' : 'low_glucose', episodeKey,
      sample, durationMinutes: null, repeatIndex: 0, fixedLow: true,
      coveredEvents: active.map(category => ({ category, episodeKey, repeatIndex: 0 })) }];
  });
}