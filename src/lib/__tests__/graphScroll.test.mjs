// The chart's resting position.
//
// Two symptoms this guards, in opposite directions:
//   • a bounce that resolved to the far right of the content, leaving the newest
//     reading parked at the right edge with the projection tail cut off; and
//   • a correction that ran mid-gesture, shaking the now-guide while the finger
//     was still down.
//
// So: the resting offset is the centre of the viewport, the content keeps its
// full width so the tail is reachable. Settling never pulls it back to rest.

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveScrollBounds,
  isAtResting,
  shouldFollowLatest,
  NEAR_EDGE_PX,
} from "../graphScroll.js";

const viewport = 373;

test("at rest the newest reading sits in the horizontal centre", () => {
  const chartWidth = 40 * viewport;
  const latestX = 0.9 * chartWidth;

  const { restingScrollLeft, maxScrollLeft } = resolveScrollBounds({
    chartWidth,
    containerWidth: viewport,
    latestX,
  });

  assert.equal(restingScrollLeft, latestX - viewport / 2);
  assert.equal(Math.round(latestX - restingScrollLeft), Math.round(viewport / 2));
  // There is still chart to the right of it: the projection tail is on screen.
  assert.ok(maxScrollLeft > restingScrollLeft, "the future zone stays reachable");
  assert.ok(chartWidth - (restingScrollLeft + viewport) > 0, "tail beyond the right edge exists");
});

test("the content keeps the chart's full width, so nothing is clipped at the reading", () => {
  const chartWidth = 40 * viewport;
  const { contentWidth } = resolveScrollBounds({ chartWidth, containerWidth: viewport, latestX: 0.9 * chartWidth });
  assert.equal(contentWidth, chartWidth);
});

test("near the start of the chart the resting offset cannot go negative", () => {
  const { restingScrollLeft } = resolveScrollBounds({ chartWidth: 5 * viewport, containerWidth: viewport, latestX: 100 });
  assert.equal(restingScrollLeft, 0);
});

test("near the end of the chart the resting offset cannot exceed the scrollable extent", () => {
  const chartWidth = 3 * viewport;
  const { restingScrollLeft, maxScrollLeft } = resolveScrollBounds({
    chartWidth,
    containerWidth: viewport,
    latestX: chartWidth - 10,
  });
  assert.equal(maxScrollLeft, chartWidth - viewport);
  assert.equal(restingScrollLeft, maxScrollLeft);
});

test("a chart narrower than the viewport neither scrolls nor clips", () => {
  const { restingScrollLeft, maxScrollLeft, contentWidth } = resolveScrollBounds({
    chartWidth: 300,
    containerWidth: viewport,
    latestX: 290,
  });
  assert.equal(restingScrollLeft, 0);
  assert.equal(maxScrollLeft, 0);
  assert.equal(contentWidth, viewport);
});

test("an unusable width degrades to a still viewport instead of NaN", () => {
  assert.deepEqual(
    resolveScrollBounds({ chartWidth: NaN, containerWidth: viewport, latestX: 100 }),
    { restingScrollLeft: 0, maxScrollLeft: 0, contentWidth: viewport }
  );
});

// ── Resting, returning, following ──────────────────────────────────────────

test("a viewport within 24px of rest counts as sitting at rest", () => {
  const resting = 500;
  assert.equal(isAtResting(resting, resting), true);
  assert.equal(isAtResting(resting + NEAR_EDGE_PX, resting), true);
  assert.equal(isAtResting(resting - NEAR_EDGE_PX, resting), true);
  assert.equal(isAtResting(resting + NEAR_EDGE_PX + 1, resting), false);
  assert.equal(isAtResting(undefined, resting), true, "no position yet means nothing to protect");
});

for (const hours of [3, 6, 12]) {
  for (const withForecast of [false, true]) {
    test(`${hours}h native right edge centres ${withForecast ? "the horizon" : "the newest reading"}`, () => {
      const latest = 24 * 3600000;
      const horizon = withForecast ? latest + 3 * 3600000 : latest;
      const visibleMs = hours * 3600000;
      const domainEnd = horizon + visibleMs / 2;
      const chartWidth = domainEnd / visibleMs * viewport;
      const latestX = latest / domainEnd * chartWidth;
      const horizonX = horizon / domainEnd * chartWidth;
      const bounds = resolveScrollBounds({ chartWidth, containerWidth: viewport, latestX });
      assert.ok(Math.abs(horizonX - bounds.maxScrollLeft - viewport / 2) < 1e-9);
      assert.ok(Math.abs(latestX - bounds.restingScrollLeft - viewport / 2) < 1e-9);
      assert.equal(bounds.contentWidth, chartWidth);
      if (withForecast) assert.ok(bounds.maxScrollLeft > bounds.restingScrollLeft);
    });
  }
}

test("no auto-follow while the viewport is being moved, or after panning away", () => {
  assert.equal(shouldFollowLatest({ busy: false, atResting: true }), true);
  assert.equal(shouldFollowLatest({ busy: true, atResting: true }), false, "a finger or momentum is moving it");
  assert.equal(shouldFollowLatest({ busy: false, atResting: false }), false, "the reader panned into history");
  assert.equal(shouldFollowLatest({ busy: true, atResting: false }), false);
});