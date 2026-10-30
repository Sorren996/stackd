// Automated tests for the glucose trace rules.
//
// Run with:
//   node --test src/lib/__tests__/glucoseTrace.test.mjs
//
// Fixtures only: synthetic timestamps and values, no health records.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGlucoseSegments, GLUCOSE_GAP_BREAK_MS } from "../glucoseSeries.js";
import { monotoneXPath } from "../monotonePath.js";

const at = (hhmm) => new Date(`2026-10-30T${hhmm}:00.000Z`).getTime();
const sample = (hhmm, value) => ({ time: at(hhmm), value });

const shape = (segments) => segments.map((segment) => segment.map((p) => new Date(p.time).toISOString().slice(11, 16)));

test("normal five-minute cadence is ONE continuous run, not a gap per sample", () => {
  const segments = buildGlucoseSegments([
    sample("12:00", 150),
    sample("12:05", 145),
    sample("12:10", 138),
    sample("12:15", 132)
  ]);

  assert.equal(segments.length, 1);
  assert.deepEqual(shape(segments), [["12:00", "12:05", "12:10", "12:15"]]);
});

test("a genuinely missing sample breaks only around that sample", () => {
  // 12:10 is missing.
  const segments = buildGlucoseSegments([
    sample("12:00", 150),
    sample("12:05", 145),
    sample("12:15", 138),
    sample("12:20", 132)
  ]);

  assert.equal(segments.length, 2);
  assert.deepEqual(shape(segments), [
    ["12:00", "12:05"],
    ["12:15", "12:20"]
  ]);
});

test("ordinary transmission jitter never creates a false gap", () => {
  // 4.5, 6 and 7 minute spacings — all still the same reading stream.
  const segments = buildGlucoseSegments([
    { time: at("12:00") + 0, value: 150 },
    { time: at("12:00") + 4.5 * 60 * 1000, value: 148 },
    { time: at("12:00") + 10.5 * 60 * 1000, value: 143 },
    { time: at("12:00") + 17.5 * 60 * 1000, value: 139 },
    { time: at("12:00") + 22.5 * 60 * 1000, value: 136 }
  ]);

  assert.equal(segments.length, 1);
  assert.equal(segments[0].length, 5);
});

test("an actually missing interval stays blank — no invented samples", () => {
  const segments = buildGlucoseSegments([
    sample("12:00", 150),
    sample("12:05", 148),
    sample("12:55", 120),
    sample("13:00", 122)
  ]);

  assert.equal(segments.length, 2);

  const blankFrom = segments[0][segments[0].length - 1].time;
  const blankTo = segments[1][0].time;
  assert.ok(blankTo - blankFrom > GLUCOSE_GAP_BREAK_MS);

  // Nothing is synthesised inside the hole.
  const insideHole = [...segments[0], ...segments[1]].filter((p) => p.time > blankFrom && p.time < blankTo);
  assert.equal(insideHole.length, 0);
});

test("unordered input and unusable records are handled without inventing data", () => {
  const segments = buildGlucoseSegments([
    sample("12:10", 138),
    sample("12:00", 150),
    sample("12:05", 145),
    { time: Number.NaN, value: 100 },
    { time: at("12:15"), value: Number.NaN }
  ]);

  assert.equal(segments.length, 1);
  assert.deepEqual(shape(segments), [["12:00", "12:05", "12:10"]]);
});

// ── The curve passes through the samples and never overshoots ─────────────
const parseCubics = (path) => {
  const numbers = path.match(/-?\d+(\.\d+)?/g).map(Number);
  const start = { x: numbers[0], y: numbers[1] };
  const segments = [];
  for (let i = 2; i + 5 < numbers.length; i += 6) {
    segments.push({
      c1: { x: numbers[i], y: numbers[i + 1] },
      c2: { x: numbers[i + 2], y: numbers[i + 3] },
      end: { x: numbers[i + 4], y: numbers[i + 5] }
    });
  }
  return { start, segments };
};

const cubicAt = (p0, c1, c2, p1, t) => {
  const u = 1 - t;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
    y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y
  };
};

test("the curve passes exactly through every sample value", () => {
  const points = [
    { x: 0, y: 150 },
    { x: 10, y: 120 },
    { x: 20, y: 190 },
    { x: 30, y: 100 }
  ];
  const { start, segments } = parseCubics(monotoneXPath(points));

  assert.deepEqual(start, points[0]);
  points.slice(1).forEach((point, i) => {
    assert.ok(Math.abs(segments[i].end.x - point.x) < 1e-9);
    assert.ok(Math.abs(segments[i].end.y - point.y) < 1e-9);
  });
});

test("smoothing never overshoots past the samples that bound it", () => {
  // Sharp reversals are where a naive spline would invent a peak or a dip.
  const points = [
    { x: 0, y: 150 },
    { x: 12, y: 112 },
    { x: 24, y: 205 },
    { x: 36, y: 96 },
    { x: 48, y: 141 }
  ];
  const { start, segments } = parseCubics(monotoneXPath(points));

  let previous = start;
  segments.forEach((segment, index) => {
    const target = points[index + 1];
    const low = Math.min(previous.y, target.y) - 1e-9;
    const high = Math.max(previous.y, target.y) + 1e-9;
    for (let step = 1; step < 20; step += 1) {
      const point = cubicAt(previous, segment.c1, segment.c2, segment.end, step / 20);
      assert.ok(point.y >= low && point.y <= high, `overshoot at interval ${index}: ${point.y}`);
    }
    previous = segment.end;
  });
});

test("the curve is a single continuous path across connected samples", () => {
  const path = monotoneXPath([
    { x: 0, y: 150 },
    { x: 10, y: 145 },
    { x: 20, y: 138 }
  ]);

  assert.equal((path.match(/M/g) || []).length, 1);
  assert.equal((path.match(/C/g) || []).length, 2);
});