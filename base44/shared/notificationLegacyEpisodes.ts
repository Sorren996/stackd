import { buildEpisode, normalizeSamples, notificationEventKey } from './notificationCore.ts';
// Preserve spent legacy category claims when adopting persistent stage state.
// New custom/pace categories never inherit old opt-in or episode consumption.
export function legacyEpisodeState(ledger, rows, settings, ownerId, recipientId, nowMs, activations = {}) {
  if (ledger.episode_state) return ledger.episode_state;
  const samples = normalizeSamples(rows, nowMs);
  const consumed = {};
  const keys = (ledger.claimed_keys || []).flat().filter(k => typeof k === 'string');
  for (const [category, family] of [['urgent_low', 'low'], ['below_range', 'low'], ['above_range', 'high']]) {
    if (activations[category]) continue;
    const episode = buildEpisode(samples, family, settings?.target_range_low, settings?.target_range_high, nowMs);
    if (!episode || (category === 'urgent_low' && !episode.hasUrgent)) continue;
    const exact = notificationEventKey(category, ownerId, recipientId, episode.key);
    const prefix = `${category}|${ownerId}|${recipientId}|${family}:`;
    // If the run predates the bounded history, do not replay a spent stage
    // merely because its first sample is no longer in this fetch window.
    const truncatedRun = samples.length >= 12 && episode.samples[0]?.id === samples[0]?.id;
    const priorUrgent = category === 'below_range' && episode.hasUrgent && (keys.includes(notificationEventKey('urgent_low', ownerId, recipientId, episode.key)) || (truncatedRun && keys.some(key => key.startsWith(`urgent_low|${ownerId}|${recipientId}|low:`))));
    consumed[category] = priorUrgent || keys.includes(exact) || (truncatedRun && keys.some(key => key.startsWith(prefix)));
  }
  return { legacyConsumed: consumed };
}