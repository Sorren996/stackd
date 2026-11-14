// One scrub model for the projection overlay.
//
// There is exactly one rule here: the marker follows the finger, and only the
// numbers snap. Everything else — a sticky nearest-point search, an overscroll
// offset, a settle animation — is deliberately absent, because three mechanisms
// each trying to place the same dot is what made the gesture fight itself.

// A gesture's intent is decided once, on the first real movement, and then it
// never changes. It is cancelled to a scroll ONLY when that first movement is
// clearly vertical (more than 1.5x more vertical than horizontal); every other
// start belongs to the scrub, and a scrub never cancels, whatever the finger
// does afterwards.
export const SCRUB_LOCK_SLOP_PX = 4;
export const VERTICAL_SCROLL_RATIO = 1.5;

export function resolveGestureIntent(
  dx,
  dy,
  slop = SCRUB_LOCK_SLOP_PX,
  ratio = VERTICAL_SCROLL_RATIO
) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (Math.abs(dx) < slop && Math.abs(dy) < slop) return null;
  return Math.abs(dy) > Math.abs(dx) * ratio ? "scroll" : "scrub";
}

// The readout's entry: plain nearest by |time difference|. No tolerance band,
// no latching, no stickiness — crossing the boundary between the readings and
// the forecast is the same comparison as every other step.
export function nearestPointByTime(points, time) {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (!Number.isFinite(time)) return null;
  let best = points[0];
  let bestDiff = Math.abs(best.time - time);
  for (let i = 1; i < points.length; i += 1) {
    const diff = Math.abs(points[i].time - time);
    if (diff < bestDiff) {
      best = points[i];
      bestDiff = diff;
    }
  }
  return best;
}

// A finger position in the chart's CONTENT space, converted to a time. The plot
// scrolls horizontally, so the scroll offset is part of the position: the same
// clientX means a different time once the chart has been panned.
export function timeAtContentX(contentX, domainStart, totalMs, chartWidth) {
  if (!Number.isFinite(contentX) || !Number.isFinite(domainStart)) return null;
  if (!Number.isFinite(totalMs) || !Number.isFinite(chartWidth)) return null;
  if (totalMs <= 0 || chartWidth <= 0) return null;
  return domainStart + (contentX / chartWidth) * totalMs;
}

// The marker's y, read off the polyline the chart already draws: straight
// between the two entries the finger sits between, clamped at the ends. This is
// what lets the dot ride the trace — measured line and dashes alike — instead of
// jumping from point to point.
export function interpolatePolylineY(points, x) {
  if (!Array.isArray(points) || points.length === 0) return null;
  if (!Number.isFinite(x)) return null;
  const first = points[0];
  const last = points[points.length - 1];
  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].x < x) lo = mid + 1;
    else hi = mid;
  }
  const b = points[lo];
  const a = points[lo - 1];
  const span = b.x - a.x;
  if (!(span > 0)) return b.y;
  return a.y + ((x - a.x) / span) * (b.y - a.y);
}

// The card flips below the marker when it no longer fits above it. Measured
// against the point's own y with a deadband, so a marker sitting near the top of
// the plot cannot toggle the card between above and below as the selection
// moves by a pixel. This is a card placement rule only — nothing about the
// gesture.
export const FLIP_DEADBAND_PX = 16;

// `slack` is the space left above the marker inside the plot, minus the card's
// own height: negative means it does not fit. `wasFlipped` is the current state.
export function resolveCardFlip(slack, wasFlipped, deadband = FLIP_DEADBAND_PX) {
  if (wasFlipped) return !(slack > deadband);
  return slack < -deadband;
}