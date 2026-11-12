import { buildGlucoseSegments } from "../src/lib/glucoseSeries.js";
import { newestDrawnPoint } from "../src/lib/graphMarker.js";

const STEP_MS = 3 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const HISTORY_DAYS = 7;
const FUTURE_HOURS = 3;

const now = new Date("2026-11-11T19:30:00-06:00").getTime();

// 6 hours of 5-minute CGM readings, with one 20-minute gap in the middle.
const readings = [];
for (let i = 72; i >= 0; i--) {
  if (i < 40 && i > 36) continue; // gap
  readings.push({
    id: `r${i}`,
    value: 150 + Math.round(Math.sin(i / 6) * 25),
    recorded_at: new Date(now - i * 5 * 60 * 1000).toISOString(),
    source: "dexcom",
  });
}

const samples = readings.map((r) => ({ time: new Date(r.recorded_at).getTime(), value: r.value }));
const segments = buildGlucoseSegments(samples);

const latestTime = samples[samples.length - 1].time;
const latestGlucoseBucket = Math.round(latestTime / STEP_MS) * STEP_MS;
const domainStart = latestGlucoseBucket - HISTORY_DAYS * 24 * HOUR_MS;
const domainEnd = latestGlucoseBucket + FUTURE_HOURS * HOUR_MS;

const glucoseMap = {};
readings.forEach((r) => {
  const t = new Date(r.recorded_at).getTime();
  glucoseMap[Math.round(t / STEP_MS) * STEP_MS] = r.value;
});

const bucketSegments = new Map();
segments.forEach((segment, index) => {
  segment.forEach((s) => bucketSegments.set(Math.round(s.time / STEP_MS) * STEP_MS, `glucose_seg_${index}`));
});

const chartData = [];
for (let t = domainStart; t <= domainEnd; t += STEP_MS) {
  const point = { time: t, bg: 400 };
  if (glucoseMap[t] !== undefined) {
    point.glucose = glucoseMap[t];
    const segmentKey = bucketSegments.get(t);
    if (segmentKey) point[segmentKey] = glucoseMap[t];
  }
  chartData.push(point);
}

const newest = newestDrawnPoint(chartData);
const newestSegmentKey = newest ? bucketSegments.get(newest.time) ?? null : null;
const newestRow = chartData.find((row) => row.time === newest?.time);

console.log("segments:", segments.length);
console.log("newest drawn:", newest, "row age min:", newest ? Math.round((now - newest.time) / 60000) : null);
console.log("newestSegmentKey:", newestSegmentKey);
console.log("row keys:", newestRow ? Object.keys(newestRow) : null);
console.log("payload-time match:", newestRow ? newestRow.time === newest.time : null);
const lastNonNullIndex = chartData.reduce((acc, row, i) => (row.glucose !== undefined ? i : acc), -1);
console.log("last non-null row index:", lastNonNullIndex, "of", chartData.length - 1);