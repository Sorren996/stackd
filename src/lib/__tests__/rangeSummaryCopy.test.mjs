// Range-summary copy — the words, not the maths.
//
// These tests pin the approved presentation rules so a later edit cannot
// quietly turn a range share back into a day grade, and so every existing tier
// boundary keeps behaving exactly as before (the numbers themselves are never
// touched by this module).

import test from "node:test";
import assert from "node:assert/strict";

import {
  RANGE_NEUTRAL_LABEL,
  RANGE_MOSTLY_LABEL,
  getDailyBalanceState,
  getRangeSummaryQualifier,
  describeDayShape,
} from "../dailyBalanceState.js";

const GRADING = /steady|balanced|mixed day|off-balance|optimal|good day|bad day/i;
const NEUTRAL = "Time in your comfort zone";
const MOSTLY = "Mostly in your comfort zone";

test("the approved strings are the only range wording", () => {
  assert.equal(RANGE_NEUTRAL_LABEL, NEUTRAL);
  assert.equal(RANGE_MOSTLY_LABEL, MOSTLY);
});

test("every existing tier boundary maps to range language, never a grade", () => {
  const cases = [
    [0, NEUTRAL],
    [40, NEUTRAL],
    [49, NEUTRAL],
    [49.9, NEUTRAL],
    [50, NEUTRAL],
    [69, NEUTRAL],
    // The original helper rounded before tiering, so 69.5 and up lands on the
    // 70 tier. That rounding is preserved exactly; only the words changed.
    [69.6, MOSTLY],
    [70, MOSTLY],
    [84, MOSTLY],
    [85, MOSTLY],
    [100, MOSTLY],
  ];
  for (const [percentage, expected] of cases) {
    assert.equal(getDailyBalanceState(percentage).label, expected, `at ${percentage}%`);
    assert.doesNotMatch(expected, GRADING);
  }
});

test("an unknown or empty result is never 'mostly' anything", () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
    assert.equal(getDailyBalanceState(value).label, "Waiting for today");
    assert.equal(getRangeSummaryQualifier(value), null);
  }
});

test("the qualifier is present only above the existing 70% tier, so headings never repeat", () => {
  assert.equal(getRangeSummaryQualifier(69), null);
  assert.equal(getRangeSummaryQualifier(70), MOSTLY);
  assert.equal(getRangeSummaryQualifier(100), MOSTLY);
});

test("the two reported screenshots both read as range, not stability", () => {
  for (const percentage of [77, 82]) {
    const { label } = getDailyBalanceState(percentage);
    assert.equal(label, MOSTLY);
    assert.doesNotMatch(label, GRADING);
  }
});

test("period observations use the same range wording", () => {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const readings = [0, 5, 10, 15].map((minutes, index) => ({
    id: `r${index}`,
    value: 120,
    recorded_at: new Date(base.getTime() + minutes * 60000).toISOString(),
  }));
  const shape = describeDayShape(readings, 70, 180);
  assert.equal(shape.length, 1);
  assert.equal(shape[0].description, MOSTLY);
  assert.doesNotMatch(shape[0].description, GRADING);
});