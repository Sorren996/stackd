// Comfort-zone copy — the words, not the maths.
//
// These tests pin the approved presentation rules so a later edit cannot
// quietly turn a range share back into a day grade. The percentage itself is
// never computed here: this module only chooses the headline that describes it.

import test from "node:test";
import assert from "node:assert/strict";

import {
  RANGE_NEUTRAL_LABEL,
  RANGE_MOSTLY_LABEL,
  getComfortZoneTier,
  getDailyBalanceState,
  getRangeSummaryQualifier,
  describeDayShape,
} from "../dailyBalanceState.js";

const GRADING =
  /steady|balanced|mixed day|off-balance|optimal|good day|bad day|rough|highs and lows/i;
const NEUTRAL = "Time in your comfort zone";
const MOSTLY = "Mostly in your comfort zone";
const MOST = "Most of the day in your comfort zone";
const MORE_IN = "More in than out of your comfort zone";
const ABOUT_HALF = "About half the day in your comfort zone";
const MORE_OUT = "More out than in your comfort zone";
const MOSTLY_OUT = "Mostly outside your comfort zone";

test("the approved strings are the only range wording", () => {
  assert.equal(RANGE_NEUTRAL_LABEL, NEUTRAL);
  assert.equal(RANGE_MOSTLY_LABEL, MOSTLY);
});

test("every percentage lands on its approved comfort-zone tier", () => {
  const cases = [
    [0, MOSTLY_OUT],
    [29, MOSTLY_OUT],
    [29.4, MOSTLY_OUT],
    [30, MORE_OUT],
    [44, MORE_OUT],
    [44.6, ABOUT_HALF],
    [45, ABOUT_HALF],
    [50, ABOUT_HALF],
    [54, ABOUT_HALF],
    [54.6, MORE_IN],
    [55, MORE_IN],
    [69, MORE_IN],
    [69.6, MOSTLY],
    [70, MOSTLY],
    [84, MOSTLY],
    [84.6, MOST],
    [85, MOST],
    [100, MOST],
  ];
  for (const [percentage, expected] of cases) {
    assert.equal(getComfortZoneTier(percentage), expected, `at ${percentage}%`);
    assert.equal(getDailyBalanceState(percentage).label, expected, `at ${percentage}%`);
    assert.equal(getRangeSummaryQualifier(percentage), expected, `at ${percentage}%`);
    assert.doesNotMatch(expected, GRADING);
  }
});

test("a headline always exists once there is a percentage", () => {
  for (let percentage = 0; percentage <= 100; percentage++) {
    const { label } = getDailyBalanceState(percentage);
    assert.ok(label && label.trim().length > 0, `empty headline at ${percentage}%`);
    assert.ok(getRangeSummaryQualifier(percentage), `no qualifier at ${percentage}%`);
  }
  // The reported 50% day.
  assert.equal(getRangeSummaryQualifier(50), ABOUT_HALF);
  assert.equal(getDailyBalanceState(50).label, ABOUT_HALF);
});

test("an unknown or empty result is never described", () => {
  for (const value of [null, undefined, NaN, Infinity, -Infinity]) {
    assert.equal(getDailyBalanceState(value).label, "Waiting for today");
    assert.equal(getRangeSummaryQualifier(value), null);
    assert.equal(getComfortZoneTier(value), null);
  }
});

test("the two earlier screenshots both still read as range, not stability", () => {
  for (const percentage of [77, 82]) {
    const { label } = getDailyBalanceState(percentage);
    assert.equal(label, MOSTLY);
    assert.doesNotMatch(label, GRADING);
  }
});

test("period observations use the same comfort-zone wording", () => {
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

test("a mixed period reads as above and below your comfort zone", () => {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const values = [250, 250, 50, 50];
  const readings = values.map((value, index) => ({
    id: `m${index}`,
    value,
    recorded_at: new Date(base.getTime() + index * 60000).toISOString(),
  }));
  const shape = describeDayShape(readings, 70, 180);
  assert.equal(shape.length, 1);
  assert.equal(shape[0].description, "A mix of above and below");
  assert.doesNotMatch(shape[0].description, GRADING);
});