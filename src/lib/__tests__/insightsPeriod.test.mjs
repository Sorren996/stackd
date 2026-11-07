import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  buildDaySeries,
  dayCoverage,
  hourlyAverages,
  hourPhrase,
  peakHour,
  periodWindow,
  readingsInWindow,
} from "../insightsPeriod.js";

// Local-time helpers so the assertions hold in any timezone.
const NOW = new Date(2026, 10, 7, 12, 0, 0); // Nov 7 2026, local noon
const reading = (y, m, d, h, min, value) => ({
  id: `${y}${m}${d}${h}${min}`,
  value,
  recorded_at: new Date(y, m, d, h, min, 0).toISOString(),
});

const inZone = (y, m, d, h, min) => reading(y, m, d, h, min, 120);
const aboveZone = (y, m, d, h, min) => reading(y, m, d, h, min, 260);

describe("periodWindow", () => {
  test("covers exactly N calendar days ending now", () => {
    const { start, end } = periodWindow(30, NOW);
    assert.equal(start.getDate(), 9);
    assert.equal(start.getMonth(), 9); // October
    assert.equal(start.getHours(), 0);
    assert.equal(end.getTime(), NOW.getTime());
  });

  test("falls back to 30 days for an unusable period", () => {
    const { start } = periodWindow(undefined, NOW);
    assert.equal(start.getDate(), 9);
  });
});

describe("buildDaySeries", () => {
  const readings = [
    // Nov 4: three readings, all in zone
    inZone(2026, 10, 4, 8, 0),
    inZone(2026, 10, 4, 8, 5),
    inZone(2026, 10, 4, 8, 10),
    // Nov 5: three readings, all above zone
    aboveZone(2026, 10, 5, 9, 0),
    aboveZone(2026, 10, 5, 9, 5),
    aboveZone(2026, 10, 5, 9, 10),
    // Nov 2: single reading — no duration to measure
    inZone(2026, 10, 2, 10, 0),
  ];

  test("returns one entry per calendar day, oldest first", () => {
    const series = buildDaySeries(readings, 70, 180, 7, NOW);
    assert.equal(series.length, 7);
    assert.equal(series[0].date, "2026-11-01");
    assert.equal(series[6].date, "2026-11-07");
    assert.deepEqual(
      series.map((d) => d.date),
      ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"],
    );
  });

  test("a day with no readings is null, never zero", () => {
    const series = buildDaySeries(readings, 70, 180, 7, NOW);
    const empty = series.find((d) => d.date === "2026-11-03");
    assert.equal(empty.count, 0);
    assert.equal(empty.tir, null);
  });

  test("in-zone and above-zone days keep their real values", () => {
    const series = buildDaySeries(readings, 70, 180, 7, NOW);
    assert.equal(series.find((d) => d.date === "2026-11-04").tir, 100);
    assert.equal(series.find((d) => d.date === "2026-11-05").tir, 0);
  });

  test("a single reading still uses the app's day rule (held across the day)", () => {
    const series = buildDaySeries(readings, 70, 180, 7, NOW);
    const single = series.find((d) => d.date === "2026-11-02");
    assert.equal(single.count, 1);
    // computeDayTirPercent holds one in-zone reading across the day, exactly as
    // the journal day view does — Insights must not reinterpret it.
    assert.equal(single.tir, 100);
  });

  test("longer periods keep every day, not a truncated tail", () => {
    assert.equal(buildDaySeries(readings, 70, 180, 90, NOW).length, 90);
    assert.equal(buildDaySeries(readings, 70, 180, 14, NOW).length, 14);
  });
});

describe("readingsInWindow", () => {
  test("drops readings before the window and outside the period", () => {
    const { start, end } = periodWindow(2, NOW);
    const kept = readingsInWindow(
      [reading(2026, 10, 5, 8, 0, 100), reading(2026, 10, 7, 8, 0, 100), reading(2026, 10, 7, 20, 0, 100)],
      start,
      end,
    );
    assert.equal(kept.length, 1);
  });
});

describe("hourlyAverages", () => {
  test("averages by local hour and leaves empty hours null", () => {
    const averages = hourlyAverages([
      reading(2026, 10, 4, 8, 0, 100),
      reading(2026, 10, 5, 8, 30, 140),
      reading(2026, 10, 6, 13, 0, 200),
    ]);
    assert.equal(averages.length, 24);
    assert.equal(averages[8].avg, 120);
    assert.equal(averages[8].count, 2);
    assert.equal(averages[13].avg, 200);
    assert.equal(averages[9].avg, null);
    assert.equal(averages[9].count, 0);
  });
});

describe("dayCoverage", () => {
  test("counts days that hold readings", () => {
    const series = buildDaySeries(
      [inZone(2026, 10, 4, 8, 0), aboveZone(2026, 10, 6, 8, 0)],
      70,
      180,
      7,
      NOW,
    );
    assert.deepEqual(dayCoverage(series), { daysWithReadings: 2, totalDays: 7 });
  });
});

describe("peakHour", () => {
  const build = (values) =>
    values.map((avg, hour) => ({ hour, label: `${hour}`, avg, count: avg == null ? 0 : 10 }));

  test("is withheld when too few hours are supported", () => {
    const sparse = build([null, null, 130, 150, null, null]);
    assert.equal(peakHour(sparse), null);
  });

  test("is withheld when the peak rests on too few readings", () => {
    const thin = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      avg: hour === 15 ? 220 : 100,
      count: hour === 15 ? 2 : 10,
    }));
    assert.equal(peakHour(thin), null);
  });

  test("reports the highest supported hour", () => {
    const solid = build([...Array(24).fill(110)].map((v, h) => (h === 15 ? 220 : v)));
    assert.equal(peakHour(solid).hour, 15);
  });

  test("phrases midnight and noon in plain words", () => {
    assert.equal(hourPhrase(0), "midnight");
    assert.equal(hourPhrase(12), "noon");
    assert.equal(hourPhrase(15), "3 PM");
  });
});