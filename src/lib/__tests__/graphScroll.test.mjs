// The chart's scroll geometry.
//
// The symptom this guards: during a hard swipe past the newest reading, iOS
// momentum pushed the container past the end of the content, a scroll handler
// clamped it back, and momentum pushed again. The now-guide moved up to 142px
// in bursts and the curve came away from its marker by up to 15px. The fix is
// that the content ENDS at the now position, so there is no slack to fight
// over, and that following is only ever armed from the live edge.

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveScrollBounds,
  isNearRightEdge,
  shouldFollowLatest,
  NEAR_EDGE_PX,
} from "../graphScroll.js";

const viewport = 373;

test("the content ends exactly where the newest reading is centred", () => {
  // A 3-hour window over days of history: the chart is far wider than the view.
  const chartWidth = 57 * viewport;
  const latestX = 0.9821 * chartWidth;

  const { nowScrollLeft, maxScrollLeft, contentWidth } = resolveScrollBounds({
    chartWidth,
    containerWidth: viewport,
    latestX,
  });

  // At the end of the content, the newest reading sits in the middle.
  assert.equal(nowScrollLeft, latestX - viewport / 2);
  assert.equal(contentWidth - viewport, nowScrollLeft, "the content's own end IS the now offset");
  assert.equal(maxScrollLeft, nowScrollLeft, "the maximum scroll is the now offset");

  // The reading's position inside the visible viewport at that offset.
  assert.equal(Math.round(latestX - nowScrollLeft), Math.round(viewport / 2));
});

test("there is no slack past the newest reading to overscroll into", () => {
  const chartWidth = 12 * viewport;
  const latestX = 0.97 * chartWidth;
  const { maxScrollLeft, contentWidth } = resolveScrollBounds({
    chartWidth,
    containerWidth: viewport,
    latestX,
  });

  // Zero distance between the now offset and the true end of the content: the
  // browser cannot scroll past it, so no mid-gesture correction is ever needed.
  assert.equal(contentWidth - viewport - maxScrollLeft, 0);
});

test("a chart narrower than the viewport does not scroll and does not clip", () => {
  const { nowScrollLeft, maxScrollLeft, contentWidth } = resolveScrollBounds({
    chartWidth: 300,
    containerWidth: viewport,
    latestX: 290,
  });

  assert.equal(nowScrollLeft, 0);
  assert.equal(maxScrollLeft, 0);
  assert.equal(contentWidth, viewport, "the content fills the viewport, no more");
});

test("a chart with less future than half a viewport keeps its full width", () => {
  const chartWidth = 2 * viewport;
  const latestX = chartWidth - 40; // only 40px of future zone
  const { nowScrollLeft, contentWidth } = resolveScrollBounds({
    chartWidth,
    containerWidth: viewport,
    latestX,
  });

  // Centring would need more scroll than exists, so the true end is used and
  // nothing is trimmed.
  assert.equal(nowScrollLeft, chartWidth - viewport);
  assert.equal(contentWidth, chartWidth);
});

test("a missing or unusable width degrades to a still viewport instead of NaN", () => {
  assert.deepEqual(
    resolveScrollBounds({ chartWidth: NaN, containerWidth: viewport, latestX: 100 }),
    { nowScrollLeft: 0, maxScrollLeft: 0, contentWidth: viewport }
  );
});

// ── Following ──────────────────────────────────────────────────────────────

test("following is armed only at the live edge", () => {
  const max = 900;
  assert.equal(isNearRightEdge(max, max), true);
  assert.equal(isNearRightEdge(max - NEAR_EDGE_PX, max), true, "within the 24px allowance");
  assert.equal(isNearRightEdge(max - NEAR_EDGE_PX - 1, max), false, "one pixel past it is away");
  assert.equal(isNearRightEdge(max - 400, max), false);
  assert.equal(isNearRightEdge(undefined, max), true, "no position yet means nothing to protect");
});

test("no auto-follow while the viewport is being moved, or after panning away", () => {
  assert.equal(shouldFollowLatest({ busy: false, nearRightEdge: true }), true);
  assert.equal(shouldFollowLatest({ busy: true, nearRightEdge: true }), false, "a finger or momentum is moving it");
  assert.equal(shouldFollowLatest({ busy: false, nearRightEdge: false }), false, "the reader panned into history");
  assert.equal(shouldFollowLatest({ busy: true, nearRightEdge: false }), false);
});