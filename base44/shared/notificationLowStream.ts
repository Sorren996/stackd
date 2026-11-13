// The per-reading low stream.
//
// Every DISTINCT, genuinely fresh measurement that sits strictly below an
// enabled low boundary is eligible on its own. There is no episode, no first
// alert delay, no repeat interval and no recovery requirement: 99, 98 and 97
// below a chosen 100 are three separate events, because they are three separate
// readings. A reading ON a boundary is not below it.
//
// Boundaries, all read from stored preferences only:
//   • urgent low  — the app's existing 55 mg/dL, unchanged, when enabled
//   • low glucose (or the legacy "below_range at exactly 70" choice), 70 mg/dL
//   • custom low  — the person's own chosen notification level
//   • below comfort zone — the person's real comfort-zone lower bound
//
// One measurement produces at most ONE decision. Urgent wins when it applies
// (the strongest severity); otherwise the lowest matched boundary — the most
// specific one — names it, and every matched category is listed as covered, so
// two matching boundaries still send a single notification.
//
// Eligibility is never re-derived from a shared glucose value or an episode:
// the dedupe identity is the source plus the measurement instant, so the same
// number measured twice is two events, and reprocessing one record is one.

import { episodeSamples } from './notificationVelocity.ts';
import { notificationAgeMinutes } from './notificationTiming.ts';

/** Stable prefix for the per-reading identity used in the claim key. */
export const LOW_STREAM_IDENTITY = 'low-stream:v1';

/** The app's existing urgent-low boundary, mirrored (never re-derived). */
export const STREAM_URGENT_MGDL = 55;

/** The app's existing fixed low boundary, mirrored (never re-derived). */
export const STREAM_FIXED_LOW_MGDL = 70;

/** A reading older than this is history, not news. */
export const STREAM_FRESH_MINUTES = 8;

// Existing below-range choices at exactly 70 already describe this stream.
// A different comfort boundary stays a separate choice, never remapped.
export function fixedLowKey(preferences, thresholds) {
  return preferences?.categories?.low_glucose == null && thresholds?.low === STREAM_FIXED_LOW_MGDL
    ? 'below_range'
    : 'low_glucose';
}

/**
 * Every enabled low boundary that may speak right now.
 *
 * `allowed` is the quiet-hours / permission gate, applied here exactly as it is
 * for every other category, so a held-back boundary is reported as held back
 * rather than silently bypassed.
 */
export function lowBoundaries(preferences, thresholds, allowed = () => true) {
  const categories = preferences?.categories || {};
  const out = [];
  const streamKey = fixedLowKey(preferences, thresholds);
  if (categories[streamKey] === true && allowed(streamKey)) {
    out.push({ category: streamKey, mgdl: STREAM_FIXED_LOW_MGDL });
  }
  const custom = Number(preferences?.custom_low_mgdl);
  if (categories.custom_low === true && Number.isFinite(custom) && allowed('custom_low')) {
    out.push({ category: 'custom_low', mgdl: custom });
  }
  // At exactly 70 the fixed stream above already owns this boundary.
  const comfort = Number(thresholds?.low);
  if (categories.below_range === true && Number.isFinite(comfort) && comfort !== STREAM_FIXED_LOW_MGDL && allowed('below_range')) {
    out.push({ category: 'below_range', mgdl: comfort });
  }
  return out;
}

/** A reading measured before an opt-in is never replayed by that opt-in. */
function activationAllows(preferences, category, at) {
  const start = Date.parse(String(preferences?.category_activation?.[category] || '').split('|')[0]);
  return !Number.isFinite(start) || at >= start;
}

/**
 * One decision per distinct fresh reading, or none.
 *
 * `repeat_minutes`, `custom_high_minutes` and any other frequency field are
 * deliberately not read: legacy saved values cannot suppress these events.
 */
export function lowStreamDecisions({ rows, preferences, thresholds, nowMs, allowed = () => true }) {
  if (preferences?.master_enabled !== true) return [];
  const { samples, conflict } = episodeSamples(rows, nowMs);
  // Conflicting duplicates for one measurement are unusable data, not news.
  if (conflict) return [];

  const categories = preferences?.categories || {};
  const boundaries = lowBoundaries(preferences, thresholds, allowed);
  const urgentEnabled = categories.urgent_low === true && allowed('urgent_low');
  const rows_ = Array.isArray(rows) ? rows : [];
  const out = [];

  for (const sample of samples) {
    if (nowMs - sample.at > STREAM_FRESH_MINUTES * 60_000) continue;
    const row = rows_.find(
      (item) =>
        Date.parse(String(item?.recorded_at ?? '')) === sample.at &&
        String(item?.source || 'manual').toLowerCase() === sample.source
    );
    const created = Date.parse(String(row?.created_date ?? ''));
    // Backfilled measurements and readings predating a preference change do
    // not become a queue of old alerts. Missing legacy metadata is tolerated.
    if (Number.isFinite(created) && (created - sample.at > STREAM_FRESH_MINUTES * 60_000 || notificationAgeMinutes(created, nowMs) == null)) continue;

    const below = boundaries
      .filter((bound) => sample.value < bound.mgdl)
      .sort((a, b) => a.mgdl - b.mgdl);
    const urgent = urgentEnabled && sample.value < STREAM_URGENT_MGDL;

    const matched = [...(urgent ? ['urgent_low'] : []), ...below.map((bound) => bound.category)]
      .filter((key, index, all) => all.indexOf(key) === index)
      .filter((key) => activationAllows(preferences, key, sample.at));
    if (!matched.length) continue;

    // Urgent is the strongest applicable severity; otherwise the most specific
    // (lowest) boundary that survived the activation check names this reading.
    const chosen = urgent && matched.includes('urgent_low')
      ? { category: 'urgent_low', mgdl: null }
      : below.find((bound) => matched.includes(bound.category));
    if (!chosen) continue;

    // Source + measured instant: independent of episode, category escalation
    // and duplicate database row IDs. A manual row uses its own record id.
    const identity = sample.source === 'manual' && row?.id ? `manual:id:${row.id}` : `${sample.source}:${sample.at}`;
    const episodeKey = `${LOW_STREAM_IDENTITY}:${identity}`;

    out.push({
      category: chosen.category,
      lowThreshold: chosen.mgdl,
      episodeKey,
      sample,
      durationMinutes: null,
      repeatIndex: 0,
      perReadingLow: true,
      coveredEvents: matched.map((category) => ({ category, episodeKey, repeatIndex: 0 })),
    });
  }

  return out;
}