// Scrub resolution for the projection overlay.
//
// A pure nearest-point comparison chatters: when the finger sits within a pixel
// of the midpoint between the newest reading and the first forecast point, every
// pointer event flips the selection back and forth, which reads as a stutter at
// exactly the place a scrub spends most of its time. The nearest point is
// therefore only adopted once the pointer is past the midpoint by a small
// hysteresis band, and both ends latch: past the last point the last point stays
// selected, so the caller resolves to the same object and skips its update.

export const SCRUB_HYSTERESIS_PX = 8;

// A gesture's intent is decided once, on the first real movement, and then it
// never changes: horizontal means scrubbing for the rest of the gesture,
// vertical means the page scrolls and no marker ever appears. Re-deciding later
// is what made a scrub read as a tap — a finger that drifted a few pixels down
// mid-drag used to drop the whole gesture.
export const SCRUB_LOCK_SLOP_PX = 4;

export function resolveGestureIntent(dx, dy, slop = SCRUB_LOCK_SLOP_PX) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return Math.abs(dx) >= Math.abs(dy) ? "scrub" : "scroll";
}

// The marker stops dead at the ends of the trace: at the earliest reading and at
// the last forecast point. There is no give past either end — the plot carries
// three hours of future, so the ends are a boundary, not a wall.

// How far past the midpoint the pointer must travel toward the other point
// before the selection follows it.
export function resolveScrubPoint(points, localX, current, hysteresisPx = SCRUB_HYSTERESIS_PX) {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (!Number.isFinite(localX)) return current ?? null;

  const first = points[0];
  const last = points[points.length - 1];
  // Latched at the ends: the end point stays selected however far past it the
  // pointer travels, so nothing is re-set while the finger sits there.
  if (localX <= first.x) return first;
  if (localX >= last.x) return last;

  // The two points either side of the pointer.
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < localX) lo = mid + 1;
    else hi = mid;
  }
  const b = points[lo];
  const a = points[lo - 1];
  const nearest = localX - a.x <= b.x - localX ? a : b;

  if (!current) return nearest;
  // A pair too close together to hold a band: plain nearest wins, because the
  // hysteresis would otherwise pin the selection for the whole gap.
  const gap = b.x - a.x;
  if (!(gap > hysteresisPx * 2)) return nearest;

  const midpoint = a.x + gap / 2;
  if (current === a) return localX > midpoint + hysteresisPx ? b : a;
  if (current === b) return localX < midpoint - hysteresisPx ? a : b;
  return nearest;
}

// The card flips below the marker when it no longer fits above it. Measured
// against the point's own y with a deadband, so a marker sitting near the top of
// the plot cannot toggle the card between above and below as the selection
// moves by a pixel.
export const FLIP_DEADBAND_PX = 16;

// `slack` is the space left above the marker inside the plot, minus the card's
// own height: negative means it does not fit. `wasFlipped` is the current state.
export function resolveCardFlip(slack, wasFlipped, deadband = FLIP_DEADBAND_PX) {
  if (wasFlipped) return !(slack > deadband);
  return slack < -deadband;
}