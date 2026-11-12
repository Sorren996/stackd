// Where the Daily Flow chart rests, and when it may follow new data.
//
// THE RESTING POSITION IS THE CENTRE OF THE VIEWPORT.
//
// The newest reading belongs in the middle: history to the left, the projection
// tail to the right. So the resting offset is simply nowX minus half a viewport,
// bounded by the scrollable extent. Every automatic write goes to that one
// number — the first paint, the Now control, a new reading while the reader is
// sitting there, and the single correction after a gesture has genuinely
// finished.
//
// Nothing in this module is called from a scroll handler, and nothing here runs
// while a finger or iOS momentum is moving the viewport.

/** How far from the resting offset still counts as sitting at rest. */
export const NEAR_EDGE_PX = 24;

/**
 * The resting scroll offset and the geometry around it.
 *
 * @param {object} input
 * @param {number} input.chartWidth      full drawn width of the chart
 * @param {number} input.containerWidth  visible viewport width
 * @param {number} input.latestX         x of the newest reading inside the content
 * @returns {{ restingScrollLeft: number, maxScrollLeft: number, contentWidth: number }}
 */
export function resolveScrollBounds({ chartWidth, containerWidth, latestX }) {
  const viewport = Number(containerWidth);
  const width = Number(chartWidth);
  if (!(viewport > 0) || !Number.isFinite(width)) {
    return { restingScrollLeft: 0, maxScrollLeft: 0, contentWidth: Math.max(0, viewport || 0) };
  }

  const maxScrollLeft = Math.max(0, width - viewport);
  // Centre the newest reading on it.
  const centredOnLatest = Number.isFinite(Number(latestX)) ? Number(latestX) - viewport / 2 : maxScrollLeft;
  const restingScrollLeft = Math.max(0, Math.min(maxScrollLeft, centredOnLatest));

  return {
    restingScrollLeft,
    maxScrollLeft,
    // The content keeps the chart's full width, so the projection tail stays
    // visible to the right of the reading instead of being clipped at it.
    contentWidth: Math.max(width, viewport),
  };
}

/** Is the viewport sitting at its resting offset, within a small tolerance? */
export function isAtResting(scrollLeft, restingScrollLeft, tolerance = NEAR_EDGE_PX) {
  if (!Number.isFinite(scrollLeft)) return true;
  return Math.abs(scrollLeft - Number(restingScrollLeft)) <= tolerance;
}

/**
 * A gesture ended somewhere past the resting offset — a bounce into the future
 * zone. Panning into history (left of rest) is never pulled back here.
 */
export function shouldReturnToResting(scrollLeft, restingScrollLeft) {
  if (!Number.isFinite(scrollLeft)) return false;
  return scrollLeft > Number(restingScrollLeft) + 1;
}

/**
 * Following new data is only allowed when the reader is not moving the viewport
 * and was already sitting at rest. Once they pan away, only Now brings it back.
 */
export function shouldFollowLatest({ busy, atResting }) {
  return !busy && atResting === true;
}