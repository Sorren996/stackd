// The scrub position model.
//
// One line, one number: the marker, the readout and the strip all derive from a
// single position between 0 and 1, so none of them can move without the others.
// These tests guard the arithmetic behind that: A is the newest received
// reading, B is the final forecast point (or A when there is no projection), the
// position maps linearly between them, and the readout only ever names a drawn
// point.

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildScrubEntries,
  nearestEntry,
  positionForTime,
  positionTimeOf,
  projectionEndTime,
  valueAtTime,
  FORECAST_KIND,
  READING_KIND,
} from "../graphScrub.js";

const MIN = 60 * 1000;
const t0 = new Date("2026-11-14T10:00:00Z").getTime();

const readings = [0, 5, 10].map((m) => ({ time: t0 + m * MIN, value: 100 + m }));
const segments = [readings];
const trajectory = [0, 30, 60, 180].map((m) => ({
  time: new Date(t0 + m * MIN).toISOString(),
  min_offset: m,
  value: 110 + m,
  lower: 100 + m,
  upper: 120 + m,
}));

const build = (overrides = {}) =>
  buildScrubEntries({ segments, trajectory, abstained: false, ...overrides });

test("A is the newest received reading and B is the final forecast point", () => {
  const { anchor, horizon, entries } = build();
  assert.equal(anchor.time, t0 + 10 * MIN);
  assert.equal(anchor.kind, READING_KIND);
  assert.equal(horizon.time, t0 + 180 * MIN);
  assert.equal(horizon.kind, FORECAST_KIND);
  assert.equal(entries.length, 3 + 3); // the 0-minute forecast point is history
});

test("with no projection B equals A, so the position cannot move", () => {
  const { anchor, horizon, entries } = build({ trajectory: [], abstained: true });
  assert.equal(horizon, anchor);
  assert.equal(entries.length, 3);
  assert.equal(positionTimeOf(anchor, horizon, 0), anchor.time);
  assert.equal(positionTimeOf(anchor, horizon, 1), anchor.time);
  assert.equal(positionForTime(anchor, horizon, anchor.time), 0);
});

test("the position maps linearly in time between A and B", () => {
  const { anchor, horizon } = build();
  const span = horizon.time - anchor.time;
  assert.equal(positionTimeOf(anchor, horizon, 0), anchor.time);
  assert.equal(positionTimeOf(anchor, horizon, 1), horizon.time);
  assert.equal(positionTimeOf(anchor, horizon, 0.5), anchor.time + span / 2);
  // Clamped, so a finger past either end cannot leave the range.
  assert.equal(positionTimeOf(anchor, horizon, -3), anchor.time);
  assert.equal(positionTimeOf(anchor, horizon, 4), horizon.time);
});

test("round-tripping a drawn point returns its own position", () => {
  const { anchor, horizon, entries } = build();
  // The scrub's range is A..B, so only the drawn points from A onward are on it.
  for (const entry of entries.filter((e) => e.time >= anchor.time)) {
    const p = positionForTime(anchor, horizon, entry.time);
    const back = nearestEntry(entries, positionTimeOf(anchor, horizon, p));
    assert.equal(back.time, entry.time);
  }
});

test("the readout always names a drawn point, nearest to the marker", () => {
  const { entries, anchor, horizon } = build();
  // A quarter of the way from A to B is between the 30 and 60 minute forecast
  // points; the readout takes the nearer of the two.
  const time = positionTimeOf(anchor, horizon, 0.25);
  const near = nearestEntry(entries, time);
  assert.ok(entries.includes(near));
  assert.ok([t0 + 30 * MIN, t0 + 60 * MIN].includes(near.time));
});

test("the marker's value is interpolated along the same line", () => {
  const { entries, anchor, horizon } = build();
  const time = positionTimeOf(anchor, horizon, 0.5);
  // Between the 60 and 180 minute forecast points (values 170 and 290).
  const mid = valueAtTime(entries, time);
  assert.ok(mid > 170 && mid < 290);
  // At a drawn point the marker sits exactly on that point's value.
  const atPoint = valueAtTime(entries, horizon.time);
  assert.equal(atPoint, horizon.value);
});

test("a genuine gap rests the marker on the nearer real point", () => {
  const gap = [
    [{ time: t0, value: 100 }],
    [{ time: t0 + 240 * MIN, value: 140 }],
  ];
  const { entries } = build({ segments: gap, trajectory: [], abstained: true });
  const early = valueAtTime(entries, t0 + 20 * MIN);
  const late = valueAtTime(entries, t0 + 220 * MIN);
  assert.equal(early, 100);
  assert.equal(late, 140);
});

test("forecast points at or before the newest reading are history, not forecast", () => {
  const { entries } = build();
  const future = entries.filter((e) => e.kind === FORECAST_KIND);
  assert.equal(future.length, 3); // the 0-minute point is dropped
  assert.ok(future.every((e) => e.time > t0 + 10 * MIN));
});

test("the projection's end is its last point, whatever the declared horizon", () => {
  assert.equal(projectionEndTime({ trajectory }), t0 + 180 * MIN);
  assert.equal(projectionEndTime({ trajectory: [], horizon_minutes: 180 }), null);
  assert.equal(projectionEndTime({ trajectory, abstained: true }), null);
  assert.equal(projectionEndTime(null), null);
});