// Where the glucose viewport belongs on this pass.
//
// The graph follows the newest RECEIVED reading — never a clock-derived point.
// Two situations always land on it:
//   • a resume / foreground revalidation (`resumed`), and
//   • a scroll container that has just mounted (`freshViewport`): its 0 offset
//     is the oldest edge of the chart, which is never where the reader was.
//
// While the app is in active foreground use, new samples only move the viewport
// if the reader is already at the latest position, so deliberate browsing of
// older history is never stolen. "Now" restores following explicitly.
export const ANCHOR_TOLERANCE_PX = 2;

export function shouldAnchorToLatest({ resumed, freshViewport, previousNowPosition, scrollLeft }) {
  if (resumed || freshViewport) return true;
  if (previousNowPosition == null || !Number.isFinite(previousNowPosition)) return true;
  return Number.isFinite(scrollLeft) && scrollLeft >= previousNowPosition - ANCHOR_TOLERANCE_PX;
}