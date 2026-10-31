import test from "node:test";
import assert from "node:assert/strict";
import { formatSharedHourTick, formatSharedClockTime } from "../sharedTimeFormat.js";

// Local-time constructor keeps these checks independent of the machine's zone.
const at = (h, m) => new Date(2026, 9, 31, h, m, 0, 0);

test("clock time is 12-hour with an explicit AM/PM", () => {
  assert.equal(formatSharedClockTime(at(13, 5)), "1:05 PM");
  assert.equal(formatSharedClockTime(at(0, 5)), "12:05 AM");
  assert.equal(formatSharedClockTime(at(12, 5)), "12:05 PM");
  assert.equal(formatSharedClockTime(at(1, 5)), "1:05 AM");
  assert.equal(formatSharedClockTime(at(23, 59)), "11:59 PM");
  assert.equal(formatSharedClockTime(at(11, 59)), "11:59 AM");
  assert.equal(formatSharedClockTime(at(9, 0)), "9:00 AM");
});

test("hour tick is 12-hour with an explicit AM/PM", () => {
  assert.equal(formatSharedHourTick(at(13, 5)), "1 PM");
  assert.equal(formatSharedHourTick(at(0, 5)), "12 AM");
  assert.equal(formatSharedHourTick(at(12, 5)), "12 PM");
  assert.equal(formatSharedHourTick(at(23, 30)), "11 PM");
});

test("invalid values produce no label rather than an invented time", () => {
  assert.equal(formatSharedClockTime("not a time"), "");
  assert.equal(formatSharedHourTick(undefined), "");
});

test("labels spanning midnight stay in chronological order", () => {
  // 9 PM → 10 PM → 11 PM → 12 AM → 1 AM: the written hours wrap forward and
  // never appear to go backwards.
  const hours = [21, 22, 23, 0, 1];
  const labels = hours.map((h) => formatSharedHourTick(at(h, 0)));
  assert.deepEqual(labels, ["9 PM", "10 PM", "11 PM", "12 AM", "1 AM"]);

  // The underlying instants remain ascending across the day boundary, so the
  // chart's ordering and 24-hour window are untouched by the formatting.
  const instants = [at(21, 0), at(22, 0), at(23, 0), new Date(2026, 10, 1, 0, 0), new Date(2026, 10, 1, 1, 0)];
  for (let i = 1; i < instants.length; i += 1) {
    assert.ok(instants[i].getTime() > instants[i - 1].getTime());
  }
});