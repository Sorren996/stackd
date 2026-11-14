import test from "node:test";
import assert from "node:assert/strict";
import { resolveScrubPoint, resolveCardFlip } from "../projection/projectionScrub.js";

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

test("the newest reading resists before the marker steps into the future", () => {
  const points = [reading, firstForecast]; // 100 → 140
  // A couple of pixels past the anchor, the marker still holds the reading.
  assert.equal(resolveScrubPoint(points, 102, reading), reading);
  // Past the resistance band the ordinary snap takes over, and it still only
  // ever resolves to a real model point — never a position in between.
  assert.equal(resolveScrubPoint(points, 130, reading), firstForecast);
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