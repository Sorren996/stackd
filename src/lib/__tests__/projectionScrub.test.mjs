import test from "node:test";
import assert from "node:assert/strict";
import {
  nearestPointByTime,
  interpolatePolylineY,
  timeAtContentX,
  resolveCardFlip,
  resolveGestureIntent,
} from "../projection/projectionScrub.js";

const point = (time, kind = "forecast") => ({ time, kind, x: time, y: 100 });

// ── Gesture intent ──────────────────────────────────────────────────────

test("nothing is decided below the slop", () => {
  assert.equal(resolveGestureIntent(2, 3), null);
  assert.equal(resolveGestureIntent(-2, -3), null);
});

test("only a clearly vertical start cancels to a scroll", () => {
  // Vertical must beat horizontal by more than 1.5x to belong to the page.
  assert.equal(resolveGestureIntent(10, 14), "scrub");
  assert.equal(resolveGestureIntent(10, 15), "scrub");
  assert.equal(resolveGestureIntent(10, 16), "scroll");
  assert.equal(resolveGestureIntent(-10, -16), "scroll");
});

test("a sideways or diagonal start always scrubs", () => {
  assert.equal(resolveGestureIntent(6, 2), "scrub");
  assert.equal(resolveGestureIntent(-6, 2), "scrub");
  assert.equal(resolveGestureIntent(5, 5), "scrub");
  // A purely vertical start has no horizontal component to win with.
  assert.equal(resolveGestureIntent(0, 5), "scroll");
});

// ── Readout: plain nearest by time ──────────────────────────────────────

test("the nearest entry wins outright, with no sticky band", () => {
  const points = [point(100), point(140)];
  assert.equal(nearestPointByTime(points, 119), points[0]);
  assert.equal(nearestPointByTime(points, 121), points[1]);
  // Repeated frames either side of the midpoint follow the finger, both ways.
  assert.equal(nearestPointByTime(points, 121, points[0]), points[1]);
  assert.equal(nearestPointByTime(points, 119, points[1]), points[0]);
});

test("one sweep reaches every entry in order, boundary included", () => {
  const merged = [point(10, "reading"), point(40, "reading"), point(70, "reading"), point(100), point(130)];
  let last = null;
  const visited = [];
  for (let time = 10; time <= 130; time += 2) {
    const next = nearestPointByTime(merged, time);
    if (next !== last) {
      visited.push(next);
      last = next;
    }
  }
  assert.deepEqual(visited, merged);
});

test("past either end the end entry stays", () => {
  const points = [point(100), point(180)];
  assert.equal(nearestPointByTime(points, -500), points[0]);
  assert.equal(nearestPointByTime(points, 5000), points[1]);
});

test("no entries resolve to nothing", () => {
  assert.equal(nearestPointByTime([], 10), null);
  assert.equal(nearestPointByTime([point(10)], NaN), null);
});

// ── Content-space mapping ───────────────────────────────────────────────

test("a finger position maps to a time in the chart's content space", () => {
  // 600px wide, six hours: the left edge is domainStart, the right edge is +6h.
  const start = 1_000_000;
  const totalMs = 6 * 60 * 60 * 1000;
  assert.equal(timeAtContentX(0, start, totalMs, 600), start);
  assert.equal(timeAtContentX(300, start, totalMs, 600), start + totalMs / 2);
  assert.equal(timeAtContentX(600, start, totalMs, 600), start + totalMs);
});

test("an unmeasured chart maps to no time", () => {
  assert.equal(timeAtContentX(10, 0, 0, 600), null);
  assert.equal(timeAtContentX(10, 0, 1000, 0), null);
  assert.equal(timeAtContentX(NaN, 0, 1000, 600), null);
});

// ── Marker rides the polyline ───────────────────────────────────────────

test("the marker sits exactly on each entry and rides between them", () => {
  const points = [
    { x: 0, y: 100 },
    { x: 100, y: 200 },
    { x: 200, y: 150 },
  ];
  assert.equal(interpolatePolylineY(points, 0), 100);
  assert.equal(interpolatePolylineY(points, 100), 200);
  assert.equal(interpolatePolylineY(points, 200), 150);
  assert.equal(interpolatePolylineY(points, 50), 150);
  assert.equal(interpolatePolylineY(points, 150), 175);
  assert.equal(interpolatePolylineY(points, 175), 162.5);
});

test("the marker stops at the first reading and the last forecast point", () => {
  const points = [{ x: 40, y: 120 }, { x: 90, y: 180 }];
  assert.equal(interpolatePolylineY(points, -300), 120);
  assert.equal(interpolatePolylineY(points, 1000), 180);
});

test("a single entry or no entries still resolves safely", () => {
  assert.equal(interpolatePolylineY([{ x: 10, y: 77 }], 500), 77);
  assert.equal(interpolatePolylineY([], 500), null);
});

// ── A whole drag, frame by frame ───────────────────────────────────────

test("one drag from the oldest reading to the horizon never pauses or skips", () => {
  // 6 hours of plot, 1200px wide, panned so the container sits at scrollLeft 300.
  const chartWidth = 1200;
  const totalMs = 6 * 60 * 60 * 1000;
  const domainStart = 1_700_000_000_000;

  const entry = (minutes, kind) => {
    const time = domainStart + minutes * 60_000;
    return {
      time,
      kind,
      x: ((time - domainStart) / totalMs) * chartWidth,
      y: 100 + Math.sin(minutes / 20) * 40,
    };
  };
  // Four past readings, the anchor at "now" (40 min), then the forecast grid.
  const readings = [0, 10, 20, 30].map((m) => entry(m, "reading"));
  const anchor = entry(40, "reading");
  const forecast = [];
  for (let m = 45; m <= 220; m += 5) forecast.push(entry(m, "forecast"));
  const merged = [...readings, anchor, ...forecast];

  const firstX = merged[0].x;
  const lastX = merged[merged.length - 1].x;

  const frame = (contentX) => {
    const lower = Math.max(firstX, 0);
    const upper = Math.min(lastX, chartWidth);
    const markerX = Math.min(Math.max(contentX, lower), Math.max(lower, upper));
    const time = timeAtContentX(contentX, domainStart, totalMs, chartWidth);
    return {
      markerX,
      y: interpolatePolylineY(merged, markerX),
      nearest: nearestPointByTime(merged, time),
    };
  };

  // Drag right: the finger moves 1px per frame across the whole trace.
  const frames = [];
  for (let contentX = firstX - 20; contentX <= lastX + 20; contentX += 1) {
    frames.push(frame(contentX));
  }

  // The dot only ever moves right, and inside the trace it never stalls:
  // 1px of finger is 1px of dot, boundary included.
  const steps = frames.slice(1).map((f, i) => ({ from: frames[i].markerX, d: f.markerX - frames[i].markerX }));
  assert.ok(steps.every((s) => s.d >= 0), "the marker never travels backwards");
  // Steps that start and finish inside the trace move the dot exactly as far as
  // the finger moved; the final partial step is simply the clamp at the horizon.
  const interior = steps.filter((s) => s.from > firstX + 1e-9 && s.from + 1 < lastX - 1e-9);
  assert.ok(interior.length > 100, "the drag covers the whole trace");
  assert.ok(
    interior.every((s) => Math.abs(s.d - 1) < 1e-6),
    "the marker tracks the finger exactly, with no pause at the boundary"
  );

  // The dot's own y is continuous: no jump at the reading/forecast seam.
  const jumps = frames.slice(1).map((f, i) => Math.abs(f.y - frames[i].y));
  assert.ok(Math.max(...jumps) < 2, "the dot rides the polyline across the boundary");

  // The readout visits every entry in order.
  const visited = [];
  for (const f of frames) {
    if (f.nearest !== visited[visited.length - 1]) visited.push(f.nearest);
  }
  assert.deepEqual(visited, merged);

  // The strip is on for forecast entries only, and it switches once each way.
  const stripOn = frames.map((f) => f.nearest.kind === "forecast");
  const flips = stripOn.slice(1).filter((v, i) => v !== stripOn[i]).length;
  assert.equal(stripOn[0], false, "the drag starts on a reading, with no strip");
  assert.equal(stripOn[stripOn.length - 1], true, "the drag ends on a forecast, with the strip");
  assert.equal(flips, 1, "the strip appears exactly once, crossing now");

  const backOn = [...frames].reverse().map((f) => f.nearest.kind === "forecast");
  const backFlips = backOn.slice(1).filter((v, i) => v !== backOn[i]).length;
  assert.equal(backFlips, 1, "and disappears exactly once on the way back");
});

test("a tap picks the nearest entry, and only a reading may open the card", () => {
  const chartWidth = 1200;
  const totalMs = 6 * 60 * 60 * 1000;
  const domainStart = 1_700_000_000_000;
  const entry = (minutes, kind) => ({
    time: domainStart + minutes * 60_000,
    kind,
    x: ((minutes * 60_000) / totalMs) * chartWidth,
    y: 120,
  });
  const merged = [entry(0, "reading"), entry(10, "reading"), entry(20, "forecast")];
  const tapAt = (contentX) =>
    nearestPointByTime(merged, timeAtContentX(contentX, domainStart, totalMs, chartWidth));

  assert.equal(tapAt(merged[0].x).kind, "reading");
  assert.equal(tapAt(merged[1].x + 6).kind, "reading");
  assert.equal(tapAt(merged[2].x).kind, "forecast");
});

// ── Card placement ──────────────────────────────────────────────────────

test("the flip needs the deadband before it changes either way", () => {
  assert.equal(resolveCardFlip(-10, false), false);
  assert.equal(resolveCardFlip(-20, false), true);
  assert.equal(resolveCardFlip(10, true), true);
  assert.equal(resolveCardFlip(20, true), false);
});