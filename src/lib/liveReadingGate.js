// Whether the live reading may be painted as current.
//
// A cold launch or a return from the background begins without any confirmation
// that this device has seen the newest saved reading. Until one lands, the hero
// shows a small neutral placeholder instead of the previous value dressed as
// current. The deadline is only a technical bound: after it, the last known
// reading is shown again but explicitly labelled as last known.

export const LIVE_READING_DEADLINE_MS = 12_000;

export const LIVE_READING = {
  PENDING: "pending",
  UNVERIFIED: "unverified",
  CURRENT: "current",
};

/**
 * @param {object} input
 * @param {number} input.dataUpdatedAt   when React Query last received data
 * @param {number} input.revalidatedAt   when this confirmation window opened
 * @param {boolean} input.deadlineElapsed whether the bounded wait has passed
 */
export function liveReadingState({ dataUpdatedAt, revalidatedAt, deadlineElapsed = false }) {
  if (!Number.isFinite(revalidatedAt)) return LIVE_READING.CURRENT;
  if (Number.isFinite(dataUpdatedAt) && dataUpdatedAt >= revalidatedAt) {
    return LIVE_READING.CURRENT;
  }
  return deadlineElapsed ? LIVE_READING.UNVERIFIED : LIVE_READING.PENDING;
}