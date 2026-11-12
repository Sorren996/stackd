import test from "node:test";
import assert from "node:assert/strict";
import { newestDrawnPoint } from "../graphMarker.js";

const row = (time, extra) => ({ time, bg: 400, ...extra });

test("the marker is the last row the line draws, at that row's own value", () => {
  const rows = [
    row(1, { glucose_seg_0: 120 }),
    row(2, { glucose_seg_0: 131 }),
    row(3, {}),
    row(4, {}),
  ];
  assert.deepEqual(newestDrawnPoint(rows), { time: 2, value: 131 });
});

test("a trailing row with no glucose does not steal the marker", () => {
  // The future zone is plotted after the newest reading; those rows carry no
  // segment value, so the dot stays on the end of the solid line.
  const rows = [row(10, { glucose_seg_1: 96 }), row(11, {}), row(12, {})];
  assert.deepEqual(newestDrawnPoint(rows), { time: 10, value: 96 });
});

test("a lone reading that only has the shared key still gets a dot", () => {
  assert.deepEqual(newestDrawnPoint([row(5, { glucose: 74 })]), { time: 5, value: 74 });
});

test("no rows at all is the only case with no marker", () => {
  assert.equal(newestDrawnPoint([]), null);
  assert.equal(newestDrawnPoint([row(1, {})]), null);
  assert.equal(newestDrawnPoint(null), null);
});