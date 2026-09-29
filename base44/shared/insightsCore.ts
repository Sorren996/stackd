// Stackd Insights — deterministic Dexcom-only retrospective computation.
// No LLM, no doses, no insulin estimates. Pure math over the user's own
// Dexcom glucose readings, following Dexcom Clarity conventions.

export const BANDS = [
  { key: "veryLow", label: "Very Low", min: -Infinity, max: 54, display: "below 54" },
  { key: "low", label: "Low", min: 54, max: 69, display: "54–69" },
  { key: "target", label: "Target", min: 70, max: 180, display: "70–180" },
  { key: "high", label: "High", min: 181, max: 250, display: "181–250" },
  { key: "veryHigh", label: "Very High", min: 251, max: Infinity, display: "above 250" },
];

export const EXPECTED_READINGS_PER_DAY = 288; // 5-minute Dexcom interval
export const DAY_WITH_DATA_THRESHOLD = EXPECTED_READINGS_PER_DAY * 0.5; // 144
export const GATE_TIR_DAYS = 7;
export const GATE_CV_DAYS = 14;
export const MAX_PATTERNS = 4;
export const MIN_PATTERN_OCCURRENCES = 3;

const msPerDay = 24 * 60 * 60 * 1000;

function dayKey(ts, tzOffsetMinutes) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - tzOffsetMinutes * 60000).toISOString().slice(0, 10);
}

function hourOfDay(ts, tzOffsetMinutes) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - tzOffsetMinutes * 60000).getUTCHours();
}

// Rounded integers that always sum to exactly 100 (largest remainder).
function roundedBands(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return BANDS.map((b) => ({ key: b.key, label: b.label, count: 0, percent: 0, display: b.display }));
  const exact = counts.map((c) => (c / total) * 100);
  const floored = exact.map(Math.floor);
  const remainders = exact.map((e, i) => e - floored[i]);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const order = remainders.map((r, i) => [r, i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < remainder && k < order.length; k++) floored[order[k][1]] += 1;
  return BANDS.map((b, i) => ({ key: b.key, label: b.label, count: counts[i], percent: floored[i], display: b.display }));
}

const stddev = (values, mean) => {
  if (values.length < 1) return 0;
  const sumSq = values.reduce((a, v) => a + (v - mean) * (v - mean), 0);
  return Math.sqrt(sumSq / values.length);
};

// Detect recurring high/low hour windows. Significance = frequency * severity * duration.
function detectPatterns(readingsByDate, daysWithDataCount, sufferLowGate) {
  // Per-day hourly means: dateKey -> hour -> value array
  const byHour = {}; // dateKey + ':' + hour -> array of values
  for (const [date, values] of Object.entries(readingsByDate.values)) {
    for (const v of values) {
      const key = `${date}:${v.hour}`;
      if (!byHour[key]) byHour[key] = [];
      byHour[key].push(v.value);
    }
  }

  const hourlyMeanByDate = {}; // dateKey -> { hour: mean }
  for (const [key, vals] of Object.entries(byHour)) {
    const [date, hourStr] = key.split(":");
    const hour = Number(hourStr);
    const mean = vals.reduce((a, v) => a + v, 0) / vals.length;
    if (!hourlyMeanByDate[date]) hourlyMeanByDate[date] = {};
    hourlyMeanByDate[date][hour] = mean;
  }

  // Aggregate mean per hour across the whole window (average of daily hourly means).
  const hourSums = {}, hourCounts = {};
  for (const [date, perHour] of Object.entries(hourlyMeanByDate)) {
    for (const [hourStr, mean] of Object.entries(perHour)) {
      const hour = Number(hourStr);
      hourSums[hour] = (hourSums[hour] || 0) + mean;
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    }
  }
  const aggHourMean = Array.from({ length: 24 }, (_, h) => (hourCounts[h] ? hourSums[h] / hourCounts[h] : null));

  // A day "exhibits" an out-of-range hour when that hour's reading mean is out of range.
  const exhibits = (date, hour, isHigh) => {
    const mean = hourlyMeanByDate[date]?.[hour];
    if (mean == null) return false;
    return isHigh ? mean > 180 : mean < 70;
  };

  const candidates = [];

  // Scan windows of contiguous out-of-range hours at the aggregate level (2..6 hr runs).
  for (const isHigh of [true, false]) {
    for (let start = 0; start < 24; start++) {
      let run = [];
      let h = start;
      while (h < 24 && ((isHigh && aggHourMean[h] > 180) || (!isHigh && aggHourMean[h] < 70))) {
        run.push(h);
        h++;
      }
      if (run.length < 2) continue;
      // Occurrences: days on which >= 60% of the window's hours were out of range.
      const occurrences = [];
      for (const date of Object.keys(hourlyMeanByDate)) {
        const matched = run.filter((hr) => exhibits(date, hr, isHigh)).length;
        if (matched / run.length >= 0.6) occurrences.push(date);
      }
      if (occurrences.length < MIN_PATTERN_OCCURRENCES) continue;

      const severityRaw =
        isHigh
          ? run.reduce((a, hr) => a + (aggHourMean[hr] ?? 180), 0) / run.length / 180
          : run.reduce((a, hr) => a + (70 / Math.max(aggHourMean[hr], 1)), 0) / run.length;

      candidates.push({
        type: isHigh ? "high" : "low",
        hours: run,
        occurrences: occurrences.sort().reverse(), // most recent first
        count: occurrences.length,
        severity: severityRaw,
        duration: run.length,
        significance: (occurrences.length / Math.max(daysWithDataCount, 1)) * severityRaw * run.length,
      });
      start = h; // skip ahead past this run
    }
  }

  // De-duplicate overlapping windows by keeping the strongest per hour cluster.
  const kept = candidates
    .filter((p) => p.type !== "low" || !sufferLowGate)
    .sort((a, b) => b.significance - a.significance);

  const chosen = [];
  const usedHours = new Set();
  for (const p of kept) {
    const overlaps = p.hours.some((hr) => usedHours.has(hr));
    if (overlaps) continue;
    chosen.push(p);
    p.hours.forEach((hr) => usedHours.add(hr));
    if (chosen.length >= MAX_PATTERNS) break;
  }

  return chosen
    .sort((a, b) => b.significance - a.significance)
    .map((p) => ({
      type: p.type,
      hours: p.hours,
      windowLabel: formatHourWindow(p.hours),
      count: p.count,
      ofDays: daysWithDataCount,
      evidenceDates: p.occurrences.slice(0, 10),
      severity: Math.round(p.severity * 100) / 100,
      significance: Math.round(p.significance * 1000) / 1000,
    }));
}

const hourLabel = (h) => `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? "am" : "pm"}`;

function formatHourWindow(hours) {
  const sorted = [...hours].sort((a, b) => a - b);
  const start = sorted[0];
  const end = sorted[sorted.length - 1] + 1;
  return `${hourLabel(start)}–${hourLabel(end)}`;
}

// Build the median-curve series (mg/dL) per hour across the window.
function hourMedianSeries(readingsByDate) {
  const valsByHour = Array.from({ length: 24 }, () => []);
  for (const values of Object.values(readingsByDate.values)) {
    for (const v of values) valsByHour[v.hour].push(v.value);
  }
  return valsByHour.map((arr) => {
    if (!arr.length) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  });
}

export function computeInsights(readings, opts) {
  const { windowDays, tzOffsetMinutes } = opts;
  const now = new Date();
  const rangeStart = new Date(now.getTime() - windowDays * msPerDay);
  const rangeEnd = now;

  // Dexcom-only: source in {dexcom, dexcom_share}. Never manual or system carry-forward.
  const dexcom = readings.filter((r) => r.source === "dexcom" || r.source === "dexcom_share");

  const readingsByDate = { values: {} }; // dateKey -> [{value, hour}]
  for (const r of dexcom) {
    const date = dayKey(r.recorded_at, tzOffsetMinutes);
    const hour = hourOfDay(r.recorded_at, tzOffsetMinutes);
    if (!date || hour == null) continue;
    const v = Number(r.value);
    if (!Number.isFinite(v)) continue;
    if (!readingsByDate.values[date]) readingsByDate.values[date] = [];
    readingsByDate.values[date].push({ value: v, hour });
  }

  const dayCountMap = {};
  for (const date of Object.keys(readingsByDate.values)) {
    dayCountMap[date] = readingsByDate.values[date].length;
  }
  const daysWithData = Object.keys(dayCountMap).filter((d) => dayCountMap[d] >= DAY_WITH_DATA_THRESHOLD);
  const daysWithDataCount = daysWithData.length;
  const usableValues = daysWithData.flatMap((d) => readingsByDate.values[d].map((x) => x.value));

  const mean = usableValues.length ? usableValues.reduce((a, v) => a + v, 0) / usableValues.length : NaN;
  const sd = usableValues.length ? stddev(usableValues, mean) : NaN;
  const cv = Number.isFinite(sd) && mean ? (sd / mean) * 100 : NaN;

  const counts = BANDS.map((b) =>
    usableValues.filter((v) => v >= b.min && v < b.max).length
  );
  const bandPercentages = roundedBands(counts);

  const passTir = daysWithDataCount >= GATE_TIR_DAYS;
  const passCv = daysWithDataCount >= GATE_CV_DAYS;

  const capturedTotal = dexcom.length;
  const expectedTotal = EXPECTED_READINGS_PER_DAY * windowDays;
  const percentCaptured = expectedTotal ? Math.round((capturedTotal / expectedTotal) * 1000) / 10 : 0;

  // Best day = highest % time in target among days with data.
  let bestDay = null;
  if (daysWithDataCount) {
    let bestDate = null, bestPct = -1;
    for (const date of daysWithData) {
      const arr = readingsByDate.values[date].map((x) => x.value);
      const inTarget = arr.filter((v) => v >= 70 && v <= 180).length;
      const pct = (inTarget / arr.length) * 100;
      if (pct > bestPct) {
        bestPct = pct;
        bestDate = date;
      }
    }
    bestDay = { date: bestDate, tirPercent: Math.round(bestPct) };
  }

  const variabiltyNote = "36% or less is considered stable variability";
  const patterns = detectPatterns(readingsByDate, daysWithDataCount, !passCv);

  return {
    windowDays,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    dexcomOnly: true,
    sensor: {
      daysWithData: daysWithDataCount,
      percentCaptured,
      timeActivePercent: windowDays ? Math.round((daysWithDataCount / windowDays) * 1000) / 10 : 0,
      expectedPerDay: EXPECTED_READINGS_PER_DAY,
    },
    gates: {
      passTir,
      passCv,
      tirRequired: GATE_TIR_DAYS,
      cvRequired: GATE_CV_DAYS,
      tirMessage: `Not enough data yet — ${daysWithDataCount} of ${GATE_TIR_DAYS} days`,
      cvMessage: `Not enough data yet — ${daysWithDataCount} of ${GATE_CV_DAYS} days`,
    },
    tir: {
      pass: passTir,
      counts,
      bandPercentages,
      mean: Number.isFinite(mean) ? Math.round(mean * 10) / 10 : null,
      sd: Number.isFinite(sd) ? Math.round(sd * 10) / 10 : null,
      cv: Number.isFinite(cv) ? Math.round(cv * 10) / 10 : null,
      gmi: Number.isFinite(mean) ? Math.round((3.31 + 0.02392 * mean) * 10) / 10 : null,
      gmiNote: "GMI — an A1C-style estimate from your CGM average. It will likely differ from a lab A1C.",
      variabiltyNote,
    },
    bestDay,
    patterns,
    hourMedian: hourMedianSeries(readingsByDate),
  };
}