// Where the Daily Flow chart may scroll, and when it may follow new data.
//
// THE SCROLL END IS THE "NOW" POSITION, BY CONSTRUCTION.
//
// The chart's content used to run to the end of the future zone, which left up
// to half a viewport of slack past the newest reading. iOS momentum pushed the
// container into that slack, a scroll handler clamped it back, momentum pushed
// again — an oscillation that moved the now-guide up to 142px and pulled the
// curve out of alignment with its marker while the finger was down.
//
// So the content is sized to end exactly where the viewport centres the newest
// reading: contentWidth = nowScrollLeft + one viewport. There is no slack left
// to overscroll into, and no position ever has to be corrected afterwards.
//
// Nothing in this module writes a scroll position. It only answers where the
// content ends and whether following is allowed.

/** How close to the live edge the reader must already be to keep following. */
export const NEAR_EDGE_PX = 24;

/**
 * The scroll geometry for the current chart and viewport.
 *
 * @param {object} input
 * @param {number} input.chartWidth      full drawn width of the chart
 * @param {number} input.containerWidth  visible viewport width
 * @param {number} input.latestX         x of the newest reading inside the content
 * @returns {{ nowScrollLeft: number, maxScrollLeft: number, contentWidth: number }}
 */
export function resolveScrollBounds({ chartWidth, containerWidth, latestX }) {
  const width = Number(chartWidth);
  const viewport = Number(containerWidth);
  const x = Number(latestX);
  if (!(viewport > 0) || !Number.isFinite(width)) {
    return { nowScrollLeft: 0, maxScrollLeft: 0, contentWidth: Math.max(0, viewport || 0) };
  }

  // The furthest the browser could scroll if the content ran to the full chart.
  const naturalMax = Math.max(0, width - viewport);
  // The offset that puts the newest reading in the middle of the viewport.
  const centredOnLatest = Number.isFinite(x) ? x - viewport / 2 : naturalMax;
  const nowScrollLeft = Math.max(0, Math.min(naturalMax, centredOnLatest));

  // The content ends here, so the browser's own maximum IS the now position and
  // there is nothing beyond it to overscroll into.
  return {
    nowScrollLeft,
    maxScrollLeft: nowScrollLeft,
    contentWidth: nowScrollLeft + viewport,
  };
}

/** Is the reader sitting at the live edge, within a small tolerance? */
export function isNearRightEdge(scrollLeft, maxScrollLeft, tolerance = NEAR_EDGE_PX) {
  if (!Number.isFinite(scrollLeft)) return true;
  return scrollLeft >= Number(maxScrollLeft) - tolerance;
}

/**
 * Following new data is only allowed when the reader is not moving the viewport
 * and was already at the live edge. Once they pan away, only the Now control
 * brings following back.
 */
export function shouldFollowLatest({ busy, nearRightEdge }) {
  return !busy && nearRightEdge === true;
}