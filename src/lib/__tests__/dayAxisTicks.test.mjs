import test from "node:test";
import assert from "node:assert/strict";
import { axisTickIndices, smallestLabelGapPx, MIN_LABEL_GAP_PX } from "../dayAxisTicks.js";

// Narrowest supported viewport (320px) minus the card padding (36px) and the
// y-axis column (24px + 6px gap).
const NARROWEST_PLOT_PX = 254;
const PERIODS = [7, 14, 30, 60, 90];

test("a seven-day period labels every day", () => {
  assert.deepEqual(axisTickIndices(7), [0, 1, 2, 3, 4, 5, 6]);
});

test("every period keeps its real first and last day labelled", () => {
  for (const days of PERIODS) {
    const ticks = axisTickIndices(days);
    assert.equal(ticks[0], 0, `${days}d starts at the first day`);
    assert.equal(ticks[ticks.length - 1], days - 1, `${days}d ends at the last day`);
  }
});

test("ticks stay in order and are never duplicated", () => {
  for (const days of PERIODS) {
    const ticks = axisTickIndices(days);
    assert.deepEqual([...ticks].sort((a, b) => a - b), ticks);
    assert.equal(new Set(ticks).size, ticks.length);
  }
});

test("labels cannot touch at the narrowest width, for every period", () => {
  for (const days of PERIODS) {
    const gap = smallestLabelGapPx(axisTickIndices(days), days, NARROWEST_PLOT_PX);
    assert.ok(
      gap >= MIN_LABEL_GAP_PX,
      `${days}d: labels ${gap.toFixed(1)}px apart, need >= ${MIN_LABEL_GAP_PX}px`,
    );
  }
});

test("tick count stays small enough to read", () => {
  for (const days of PERIODS) {
    assert.ok(axisTickIndices(days).length <= 7, `${days}d prints at most 7 dates`);
  }
});

test("longer periods print fewer dates than shorter ones", () => {
  assert.ok(axisTickIndices(90).length <= axisTickIndices(30).length);
  assert.ok(axisTickIndices(30).length < axisTickIndices(7).length);
});

test("degenerate input never throws", () => {
  assert.deepEqual(axisTickIndices(0), [0]);
  assert.deepEqual(axisTickIndices(1), [0]);
  assert.deepEqual(axisTickIndices(undefined), [0]);
});