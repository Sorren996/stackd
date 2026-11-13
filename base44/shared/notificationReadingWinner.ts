// One reading, one push.
//
// Every rule that speaks about a measured instant — urgent low, the per-reading
// low stream, the comfort-zone boundaries, the sustained high, the pace rules
// and the optional all-readings stream — is decided independently, in one pass
// inside ingestion. This module turns those independent decisions into AT MOST
// ONE notification per measurement, before anything is claimed or sent:
//
//   urgent_low
//     → custom_low / below_range / low_glucose
//       → custom_high / above_range
//         → falling_fast / rising_fast
//           → all_readings
//
// The winning category supplies the copy. Every other category that matched the
// same reading is carried on the row as covered, so nothing is silently lost
// and nothing is sent twice. Identity is the measured instant, so a corrected
// value for the same recorded_at can never notify again.

import { notificationAgeMinutes } from './notificationTiming.ts';

export const READING_PRIORITY: Record<string, number> = {
  urgent_low: 50,
  custom_low: 40,
  below_range: 40,
  low_glucose: 40,
  custom_high: 30,
  above_range: 30,
  falling_fast: 20,
  rising_fast: 20,
  all_readings: 10,
};

/** A reading older than this is history, not news. */
export const STREAM_MAX_AGE_MINUTES = 5;

/**
 * The ledger identity of a reading: the recipient plus the measured instant.
 * Per category keys are what allowed one reading to produce two pushes.
 */
export function readingIdentity(atMs: number): string {
  return `reading:v2:${Math.trunc(Number(atMs) || 0)}`;
}

function coverageOf(candidate: any) {
  if (Array.isArray(candidate?.coveredEvents) && candidate.coveredEvents.length) {
    return candidate.coveredEvents.map((event: any) => ({
      category: event.category,
      episodeKey: event.episodeKey,
      repeatIndex: event.repeatIndex ?? 0,
    }));
  }
  return [{ category: candidate.category, episodeKey: candidate.episodeKey, repeatIndex: candidate.repeatIndex ?? 0 }];
}

/**
 * Collapse every decision to one winner per measured instant.
 *
 * A gap in the stream (missing readings) is not a reading and passes through
 * untouched.
 */
export function collapseWinners(candidates: any[]): any[] {
  const out: any[] = [];
  const byReading = new Map<number, any>();

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate?.category) continue;
    if (candidate.category === 'missing_readings') {
      out.push(candidate);
      continue;
    }
    const at = Number(candidate.sample?.at);
    if (!Number.isFinite(at)) continue;

    const existing = byReading.get(at);
    if (!existing) {
      byReading.set(at, {
        ...candidate,
        priority: READING_PRIORITY[candidate.category] ?? 0,
        coveredEvents: coverageOf(candidate),
      });
      continue;
    }

    for (const event of coverageOf(candidate)) {
      if (!existing.coveredEvents.some((held: any) => held.category === event.category)) {
        existing.coveredEvents.push(event);
      }
    }
    const incoming = READING_PRIORITY[candidate.category] ?? 0;
    if (incoming > (existing.priority ?? 0)) {
      byReading.set(at, {
        ...candidate,
        priority: incoming,
        coveredEvents: existing.coveredEvents,
      });
    }
  }

  out.push(...Array.from(byReading.values()));
  return out;
}

/**
 * The optional all-readings stream, decided per reading.
 *
 * Stream hygiene: a reading more than five minutes old at send time is never
 * sent (a reconnect backlog cannot replay a queue of stale pushes), and when
 * several readings land inside the same minute only the newest is sent.
 */
export function allReadingsCandidate({
  samples,
  nowMs,
  enabled,
}: {
  samples: any[];
  nowMs: number;
  enabled: boolean;
}) {
  if (enabled !== true) return null;
  const list = (Array.isArray(samples) ? samples : []).filter((sample) => Number.isFinite(Number(sample?.at)));
  if (!list.length) return null;

  const newest = list.reduce((a, b) => (Number(b.at) > Number(a.at) ? b : a));
  const age = notificationAgeMinutes(Number(newest.at), nowMs);
  if (age == null || age > STREAM_MAX_AGE_MINUTES) return null;

  const episodeKey = `all-readings:${Math.floor(Number(newest.at) / 60_000)}`;
  return {
    category: 'all_readings',
    episodeKey,
    sample: newest,
    durationMinutes: null,
    repeatIndex: 0,
    coveredEvents: [{ category: 'all_readings', episodeKey, repeatIndex: 0 }],
  };
}