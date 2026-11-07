import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildDayHistoryEvents, findLowestReading, isRescueCarb } from "../dayHistoryTimeline.js";

const DAY = "2026-11-06";
const at = (time) => new Date(`${DAY}T${time}`).getTime();

const carbs = [
  { id: "c1", food_name: "Toast", carbs: 40, consumed_at: new Date(at("08:00:00")).toISOString() },
  { id: "c2", food_name: "Juice", carbs: 15, is_rescue_carb: true, consumed_at: new Date(at("14:00:00")).toISOString() },
];

const insulin = [
  { id: "d1", insulin_type: "NovoLog", units: 6, administered_at: new Date(at("08:05:00")).toISOString() },
  { id: "d2", insulin_type: "Lantus", units: 18, administered_at: new Date(at("21:00:00")).toISOString() },
];

const glucose = [
  { id: "r1", value: 120, recorded_at: new Date(at("07:55:00")).toISOString() },
  { id: "r2", value: 210, recorded_at: new Date(at("10:00:00")).toISOString() },
  { id: "r3", value: 54, recorded_at: new Date(at("16:20:00")).toISOString() },
  { id: "r4", value: 110, recorded_at: new Date(at("18:00:00")).toISOString() },
];

describe("day timeline events", () => {
  test("lists stored records in time order without inventing entries", () => {
    const { events } = buildDayHistoryEvents({ carbs, insulin, glucose, targetLow: 70 });
    const times = events.map((event) => event.time);
    assert.deepEqual(times, [...times].sort((a, b) => a - b));

    const kinds = events.map((event) => `${event.kind}:${event.recordId}`);
    assert.deepEqual(kinds, [
      "meal:c1",
      "dose:d1",
      "rescue:c2",
      "reading:r3",
      "dose:d2",
    ]);

    // No derived peak / rise / recovery descriptions exist as entries.
    const titles = events.map((event) => event.title);
    assert.ok(!titles.some((title) => /peak|rising|falling|recovery/i.test(title)));
  });

  test("keeps each dose as one entry with its units", () => {
    const { events } = buildDayHistoryEvents({ carbs: [], insulin, glucose: [], targetLow: 70 });
    assert.equal(events.length, 2);
    assert.equal(events[0].title, "NovoLog");
    assert.equal(events[0].units, 6);
  });

  test("marks a reading as a low only when it is below the comfort zone", () => {
    const { events } = buildDayHistoryEvents({ carbs: [], insulin: [], glucose, targetLow: 70 });
    const lows = events.filter((event) => event.isLow);
    assert.equal(lows.length, 1);
    assert.equal(lows[0].recordId, "r3");
    assert.equal(lows[0].title, "Low glucose reading");
  });

  test("a within-zone minimum is never labelled a low, but is still reachable", () => {
    const inZone = [
      { id: "z1", value: 120, recorded_at: new Date(at("08:00:00")).toISOString() },
      { id: "z2", value: 160, recorded_at: new Date(at("12:00:00")).toISOString() },
    ];
    const { events, lowestEventId } = buildDayHistoryEvents({
      carbs: [],
      insulin: [],
      glucose: inZone,
      targetLow: 70,
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].isLow, false);
    assert.equal(events[0].title, "Lowest reading");
    assert.equal(lowestEventId, "reading:z1");
  });

  test("the lowest reading appears exactly once, even when other lows exist", () => {
    const { events, lowestEventId } = buildDayHistoryEvents({
      carbs: [],
      insulin: [],
      glucose,
      targetLow: 70,
    });
    assert.equal(events.filter((event) => event.recordId === "r3").length, 1);
    assert.equal(lowestEventId, "reading:r3");
  });

  test("rescue carbs stay distinguishable from meals", () => {
    const { events } = buildDayHistoryEvents({ carbs, insulin: [], glucose: [], targetLow: 70 });
    const rescue = events.find((event) => event.recordId === "c2");
    assert.equal(rescue.kind, "rescue");
    assert.ok(isRescueCarb(carbs[1]));
    assert.ok(!isRescueCarb(carbs[0]));
  });

  test("reports the day's lowest real reading", () => {
    assert.deepEqual(findLowestReading(glucose), { id: "r3", time: at("16:20:00"), value: 54 });
    assert.equal(findLowestReading([]), null);
  });
});