// Follower cadence.
//
// A low episode heard about on someone else's lock screen escalates; it does not
// repeat on every reading. For a FOLLOWER the whole episode speaks at most
// three times:
//
//   1. the first low notice (the existing low copy, unchanged),
//   2. at most one repeat, 25 minutes later, only while still low,
//   3. at most one recovery note, once the reading is back in range.
//
// The owner's own per-reading rule is not touched by any of this: this module is
// only ever applied to a recipient reached through a relationship.

/** One repeat, inside the 20–30 minute window. */
export const FOLLOWER_REPEAT_MINUTES = 25;

/** First notice, one repeat, one recovery note. */
export const FOLLOWER_EPISODE_CAP = 3;

/** The categories that describe a low reading for a follower. */
export const FOLLOWER_LOW_CATEGORIES = ['urgent_low', 'custom_low', 'below_range', 'low_glucose'];

/** A recovery note is only news while it is still recent. */
const RECOVERY_FRESH_MINUTES = 8;

export function isFollowerLowCategory(category: unknown): boolean {
  return FOLLOWER_LOW_CATEGORIES.includes(String(category ?? ''));
}

function dedupe(list: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const item of list) {
    const key = `${item?.category}:${item?.sample?.at}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

/**
 * Apply the follower cadence to this pass's winners.
 *
 * `stillLow` reports whether the newest reading is still below an enabled
 * boundary; when no low boundary is enabled it returns true, so an episode can
 * never be closed with a recovery note for a condition nobody asked about.
 */
export function applyFollowerCadence({
  winners,
  state,
  nowMs,
  stillLow,
  recoverySample,
}: {
  winners: any[];
  state: any;
  nowMs: number;
  stillLow: (sample: any) => boolean;
  recoverySample: any;
}) {
  const previous = state && typeof state === 'object' ? state : {};
  const next = { ...previous };
  const list = Array.isArray(winners) ? winners : [];
  const lows = list.filter((item) => isFollowerLowCategory(item.category));
  const others = list.filter((item) => !isFollowerLowCategory(item.category));
  const out = [...others];

  if (lows.length) {
    const newest = lows.reduce((a, b) => (Number(b.sample.at) > Number(a.sample.at) ? b : a));
    const startedAt = Number(previous.startedAt) || 0;
    const total = Number(previous.total) || 0;

    if (previous.active !== true) {
      next.active = true;
      next.startedAt = Number(newest.sample.at);
      next.alertedAt = Number(newest.sample.at);
      next.repeats = 0;
      next.total = 1;
      next.recoveredAt = null;
      out.push(newest);
      return { winners: dedupe(out), state: next };
    }

    const waited = Number(newest.sample.at) - (Number(previous.alertedAt) || startedAt);
    const repeatUsed = (Number(previous.repeats) || 0) > 0;
    if (!repeatUsed && waited >= FOLLOWER_REPEAT_MINUTES * 60_000 && total < FOLLOWER_EPISODE_CAP) {
      next.alertedAt = Number(newest.sample.at);
      next.repeats = 1;
      next.total = total + 1;
      // The repeat reuses the low copy exactly: same category, same wording.
      out.push({ ...newest, repeatIndex: 1 });
      return { winners: dedupe(out), state: next };
    }

    // Still low, and this episode has already said what it needed to say.
    return { winners: dedupe(out), state: next };
  }

  // No low reading now: close the episode with at most one recovery note.
  const fresh = Number(recoverySample?.at);
  if (
    previous.active === true &&
    previous.recoveredAt == null &&
    Number(previous.total) < FOLLOWER_EPISODE_CAP &&
    Number.isFinite(fresh) &&
    nowMs - fresh <= RECOVERY_FRESH_MINUTES * 60_000 &&
    !stillLow(recoverySample)
  ) {
    next.active = false;
    next.recoveredAt = fresh;
    next.total = (Number(previous.total) || 1) + 1;
    const episodeKey = `low-recovery:${fresh}`;
    out.push({
      category: 'low_recovery',
      episodeKey,
      sample: recoverySample,
      durationMinutes: null,
      repeatIndex: 0,
      coveredEvents: [{ category: 'low_recovery', episodeKey, repeatIndex: 0 }],
    });
  }

  return { winners: dedupe(out), state: next };
}