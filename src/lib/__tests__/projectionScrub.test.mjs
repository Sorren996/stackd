import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveScrubPoint,
  resolveCardFlip,
  resolveGestureIntent,
} from "../projection/projectionScrub.js";

const point = (x, kind = "forecast") => ({ x, kind });
const reading = point(100, "reading");
const firstForecast = point(140);

test("the selection is not adopted until the pointer is 8px past the midpoint", () => {
  const points = [reading, firstForecast];
  // Midpoint is 120. Moving right off the reading holds it until 128.
  assert.equal(resolveScrubPoint(points, 126, reading), reading);
  assert.equal(resolveScrubPoint(points, 128, reading), reading);
  assert.equal(resolveScrubPoint(points, 129, reading), firstForecast);
});

test("the hysteresis holds on the way back too", () => {
  const points = [reading, firstForecast];
  assert.equal(resolveScrubPoint(points, 113, firstForecast), firstForecast);
  assert.equal(resolveScrubPoint(points, 111.9, firstForecast), reading);
});

test("a repeated position resolves to the same object, so no update is scheduled", () => {
  const points = [reading, firstForecast];
  const a = resolveScrubPoint(points, 125, reading);
  const b = resolveScrubPoint(points, 124, a);
  assert.equal(a, b);
});

test("past the last point the last point latches", () => {
  const points = [reading, firstForecast];
  assert.equal(resolveScrubPoint(points, 400, reading), firstForecast);
  assert.equal(resolveScrubPoint(points, 400, firstForecast), firstForecast);
});

test("the boundary between the solid line and the dashes carries no wall", () => {
  const points = [reading, firstForecast]; // 100 → 140
  // Crossing from the reading into the future needs only the same hysteresis
  // every other pair uses, so one continuous gesture crosses it and comes back.
  assert.equal(resolveScrubPoint(points, 129, reading), firstForecast);
  assert.equal(resolveScrubPoint(points, 111, firstForecast), reading);
});

test("one gesture travels the whole merged list without skipping a point", () => {
  // Readings, then the forecast grid: a finger sweeping right lands on every
  // point in order, and the same sweep back returns through them.
  const merged = [point(10, "reading"), point(40, "reading"), point(70, "reading"), point(100), point(130)];
  let current = merged[0];
  const visited = [];
  for (let x = 10; x <= 130; x += 2) {
    current = resolveScrubPoint(merged, x, current);
    if (visited[visited.length - 1] !== current) visited.push(current);
  }
  assert.deepEqual(visited, merged);
});

test("intent locks on the first movement: sideways scrubs, vertical scrolls", () => {
  // Below the slop nothing is decided yet.
  assert.equal(resolveGestureIntent(2, 3), null);
  // Sideways wins ties and stays the answer however the finger drifts later.
  assert.equal(resolveGestureIntent(6, 2), "scrub");
  assert.equal(resolveGestureIntent(-6, 2), "scrub");
  assert.equal(resolveGestureIntent(5, 5), "scrub");
  // A clearly vertical start is a page scroll.
  assert.equal(resolveGestureIntent(1, 9), "scroll");
});

test("the future region ends at the projection horizon", () => {
  const horizon = point(180);
  const points = [reading, firstForecast, horizon];
  assert.equal(resolveScrubPoint(points, 1000, horizon), horizon);
});

test("before the first point the reading latches", () => {
  const points = [reading, firstForecast];
  assert.equal(resolveScrubPoint(points, -20, firstForecast), reading);
});

test("points too close for a band fall back to plain nearest", () => {
  const close = [point(100), point(110)];
  assert.equal(resolveScrubPoint(close, 107, close[0]), close[1]);
});

test("no points resolve to nothing", () => {
  assert.equal(resolveScrubPoint([], 10, null), null);
});

test("the flip needs the deadband before it changes either way", () => {
  // Not flipped: needs a clearly negative slack to flip down.
  assert.equal(resolveCardFlip(-10, false), false);
  assert.equal(resolveCardFlip(-20, false), true);
  // Flipped: needs clearly positive slack to come back up.
  assert.equal(resolveCardFlip(10, true), true);
  assert.equal(resolveCardFlip(20, true), false);
});