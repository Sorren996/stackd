import { describe, it, expect } from "vitest";
import { computeDayTirPercent } from "../timeInRange";
import { computeDayGlucoseMetrics } from "../dayRecapMetrics";

// A reading is a { recorded_at, value, source } shape, matching what the
// GlucoseReading entity returns and what every TIR surface consumes.
function reading(value, minutesIntoDay, source = "dexcom") {
  const base = new Date("2026-10-05T00:00:00").getTime();
  return {
    recorded_at: new Date(base + minutesIntoDay * 60 * 1000).toISOString(),
    value,
    source,
  };
}

const LOW = 70;
const HIGH = 180;

describe("computeDayTirPercent — single source of truth", () => {
  it("returns 100% only when every reading is in range", () => {
    const readings = [reading(110, 0), reading(120, 5), reading(130, 10)];
    expect(computeDayTirPercent(readings, LOW, HIGH)).toBe(100);
  });

  it("returns null for an empty set", () => {
    expect(computeDayTirPercent([], LOW, HIGH)).toBeNull();
  });

  it("ignores non-finite values", () => {
    const readings = [reading(110, 0), reading(NaN, 5), reading(190, 10)];
    expect(computeDayTirPercent(readings, LOW, HIGH)).toBe(50);
  });

  it("guard: a day with any out-of-range reading never displays 100%", () => {
    // 287 of 288 in range — naive rounding gives 100, but one reading is out
    // of range so it must cap at 99.
    const readings = [];
    for (let i = 0; i < 287; i++) readings.push(reading(110, i));
    readings.push(reading(250, 287)); // one high reading
    expect(readings.length).toBe(288);
    expect(computeDayTirPercent(readings, LOW, HIGH)).toBe(99);
  });

  it("treats boundary values as in range (inclusive)", () => {
    const readings = [reading(70, 0), reading(180, 5)];
    expect(computeDayTirPercent(readings, LOW, HIGH)).toBe(100);
  });
});

describe("TIR consistency across surfaces", () => {
  // The same raw readings for a single day, shared by every surface.
  const dayReadings = [
    reading(95, 0), reading(140, 30), reading(210, 60), reading(160, 90),
    reading(60, 120), reading(120, 150), reading(175, 180), reading(130, 210),
  ];

  it("journal day view (computeDayGlucoseMetrics) and Rhythms view (computeDayTirPercent) agree", () => {
    const journalTir = computeDayGlucoseMetrics(dayReadings, LOW, HIGH).tir;
    const rhythmsTir = computeDayTirPercent(dayReadings, LOW, HIGH);
    expect(journalTir).toBe(rhythmsTir);
  });

  it("both surfaces use the same raw readings and current range (not a stale aggregate)", () => {
    // 6 of 8 in range => 75% on both surfaces.
    const journalTir = computeDayGlucoseMetrics(dayReadings, LOW, HIGH).tir;
    const rhythmsTir = computeDayTirPercent(dayReadings, LOW, HIGH);
    expect(journalTir).toBe(75);
    expect(rhythmsTir).toBe(75);
  });

  it("changing the target range changes TIR identically on both surfaces", () => {
    const wide = { low: 54, high: 250 };
    const narrow = { low: 80, high: 140 };
    const jWide = computeDayGlucoseMetrics(dayReadings, wide.low, wide.high).tir;
    const rWide = computeDayTirPercent(dayReadings, wide.low, wide.high);
    const jNarrow = computeDayGlucoseMetrics(dayReadings, narrow.low, narrow.high).tir;
    const rNarrow = computeDayTirPercent(dayReadings, narrow.low, narrow.high);
    expect(jWide).toBe(rWide);
    expect(jNarrow).toBe(rNarrow);
    expect(jWide).not.toBe(jNarrow);
  });

  it("a day with out-of-range readings is never 100% on either surface", () => {
    const journalTir = computeDayGlucoseMetrics(dayReadings, LOW, HIGH).tir;
    const rhythmsTir = computeDayTirPercent(dayReadings, LOW, HIGH);
    expect(journalTir).toBeLessThan(100);
    expect(rhythmsTir).toBeLessThan(100);
  });

});