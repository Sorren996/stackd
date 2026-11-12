// The live resting offset is the native scroll limit, with visible projection
// space but no scrollable future area or delayed snap-back.
import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveScrollBounds,
  isAtResting,
  shouldReturnToResting,
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
  assert.equal(maxScrollLeft, restingScrollLeft, "no scrollable future zone");
  assert.ok(chartWidth - (restingScrollLeft + viewport) > 0, "projection retains its drawing domain");
});

test("native content ends half a viewport beyond the latest drawn point", () => {
  const chartWidth = 40 * viewport;
  const latestX = 0.9 * chartWidth;
  const { contentWidth, maxScrollLeft } = resolveScrollBounds({ chartWidth, containerWidth: viewport, latestX });
  assert.equal(contentWidth, latestX + viewport / 2);
  assert.equal(contentWidth - viewport, maxScrollLeft);
});

for (const hours of [3, 6, 12]) {
  test(`${hours}h first load, new reading and shrinking extent share one live boundary`, () => {
    const scale = viewport / (hours * 60 * 60 * 1000);
    const geometry = (time) => resolveScrollBounds({
      chartWidth: (time + hours * 60 * 60 * 1000) * scale,
      containerWidth: viewport,
      latestX: time * scale,
    });
    const latest = 7 * 24 * 60 * 60 * 1000;
    for (const time of [latest, latest + 300000, latest - 300000]) {
      const edge = geometry(time);
      assert.equal(edge.restingScrollLeft, edge.maxScrollLeft);
      assert.ok(Math.abs(edge.contentWidth - viewport - edge.maxScrollLeft) < 1e-8);
      assert.ok(Math.abs(time * scale - edge.maxScrollLeft - viewport / 2) < 1e-8);
    }
  });
}

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

test("a bounce past rest returns to rest; panning into history is left alone", () => {
  const resting = 500;
  assert.equal(shouldReturnToResting(900, resting), true, "parked in the future zone");
  assert.equal(shouldReturnToResting(resting + 1, resting), false, "still rest, within the write threshold");
  assert.equal(shouldReturnToResting(resting - 300, resting), false, "the reader is reading history");
  assert.equal(shouldReturnToResting(resting, resting), false);
});

test("no auto-follow while the viewport is being moved, or after panning away", () => {
  assert.equal(shouldFollowLatest({ busy: false, atResting: true }), true);
  assert.equal(shouldFollowLatest({ busy: true, atResting: true }), false, "a finger or momentum is moving it");
  assert.equal(shouldFollowLatest({ busy: false, atResting: false }), false, "the reader panned into history");
  assert.equal(shouldFollowLatest({ busy: true, atResting: false }), false);
});