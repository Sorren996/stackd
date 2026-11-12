// Where the Daily Flow chart rests, and when it may follow new data.
//
// THE RESTING POSITION IS THE CENTRE OF THE VIEWPORT.
//
// The newest rendered reading sits in the middle, with projection space on its
// right. This resting offset is also the physical end of scrollable history:
// future pixels may be visible, but cannot be scrolled into and snapped back.

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

  // The newest rendered reading is the last selectable instant. Keep half a
  // viewport for its projection, but do not make that future space scrollable.
  const drawnLimit = Math.max(0, width - viewport);
  const centredOnLatest = Number.isFinite(Number(latestX)) ? Number(latestX) - viewport / 2 : drawnLimit;
  const maxScrollLeft = Math.max(0, Math.min(drawnLimit, centredOnLatest));
  return {
    restingScrollLeft: maxScrollLeft,
    maxScrollLeft,
    contentWidth: maxScrollLeft + viewport,
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