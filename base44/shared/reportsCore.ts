// Stackd Reports engine — deterministic, Dexcom-only retrospective computation
// for the multi-report system. No LLM, no doses as suggestions, no estimates.
// Every number is a factual sum/statistic over the user's own logged data.

// ── Band conventions (Dexcom Clarity thresholds, but rendered with Stackd's
//    own status-indicator colors — sage etc. — not Clarity's red/orange/green) ──
export const BANDS = [
  { key: "veryLow", label: "Very Low", min: -Infinity, max: 54, display: "below 54" },
  { key: "low", label: "Low", min: 54, max: 69, display: "54–69" },
  { key: "target", label: "Target", min: 70, max: 180, display: "70–180" },
  { key: "high", label: "High", min: 181, max: 250, display: "181–250" },
  { key: "veryHigh", label: "Very High", min: 251, max: Infinity, display: "above 250" },
];

export const DAYTIME_START_MIN = 6 * 60;    // 06:00
export const DAYTIME_END_MIN = 22 * 60;     // 22:00
export const EXPECTED_PER_DAY = 288;        // 5-min Dexcom cadence
export const MIN_PATTERN_OCCURRENCES = 3;
export const MAX_PATTERNS = 4;

const msPerDay = 24 * 60 * 60 * 1000;
const MINUTE = 60 * 1000;

// Local calendar date key using the same convention as the rest of Stackd.
export function localDayKey(ts, tzOffsetMinutes) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - tzOffsetMinutes * 60000).toISOString().slice(0, 10);
}

export function localMinuteOfDay(ts, tzOffsetMinutes) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() - tzOffsetMinutes * 60000);
  return shifted.getUTCHours() * 60 + shifted.getUTCMinutes();
}

export function localWeekdayIdx(ts, tzOffsetMinutes) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() - tzOffsetMinutes * 60000).getUTCDay(); // 0=Sun
}

const sortedAsc = (a, b) => a - b;

function medianSorted(sorted) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantileSorted(sorted, q) {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base + 1] !== undefined ? sorted[base] + rest * (sorted[base + 1] - sorted[base]) : sorted[base];
}

function stddevSamples(values, mean) {
  if (values.length < 2) return 0;
  const sumSq = values.reduce((a, v) => a + (v - mean) * (v - mean), 0);
  return Math.sqrt(sumSq / (values.length - 1));
}

function statsFromValues(values) {
  const n = values.length;
  if (!n) return null;
  const sorted = values.slice().sort(sortedAsc);
  const mean = values.reduce((a, v) => a + v, 0) / n;
  const sd = stddevSamples(values, mean);
  return {
    count: n,
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    sd,
    q25: quantileSorted(sorted, 0.25),
    median: medianSorted(sorted),
    q75: quantileSorted(sorted, 0.75),
    iqr: quantileSorted(sorted, 0.75) - quantileSorted(sorted, 0.25),
    cv: mean ? (sd / mean) * 100 : 0,
    gmi: 3.31 + 0.02392 * mean,
  };
}

// Band-count percentages that always sum to exactly 100 (largest remainder).
export function roundedBands(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return BANDS.map((b) => ({ key: b.key, label: b.label, count: 0, percent: 0, display: b.display }));
  const exact = counts.map((c) => (c / total) * 100);
  const floored = exact.map(Math.floor);
  const remainders = exact.map((e, i) => e - floored[i]);
  let remainder = 100 - floored.reduce((a, b) => a + b, 0);
  const order = remainders.map((r, i) => [r, i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < remainder && k < order.length; k++) floored[order[k][1]] += 1;
  return BANDS.map((b, i) => ({
    key: b.key,
    label: b.label,
    count: counts[i],
    percent: floored[i],
    display: b.display,
  }));
}

function bandCounts(values) {
  return BANDS.map((b) => values.filter((v) => v >= b.min && v < b.max).length);
}

// ── Insulin activity-frame helpers (categories only, for the summary) ──
// We do NOT ship any activity/IOB math here. Only factual unit totals split by
// the insulin's known category. Rapid = bolus-family; Long = basal-family.
export function insulinCategoryOf(type) {
  if (!type) return "other";
  const t = String(type);
  const cat = t.toLowerCase();
  const rapid = /aspart|lispro|glulisine|novolog|humalog|admelog|apidra|fiasp|lyumjev|afrezza/.test(cat);
  const long = /glargine|detemir|degludec|icodec|lantus|basaglar|semglee|rezvoglar|toujeo|levemir|tresiba|awiqli/.test(cat);
  const short = /regular|novolin r|humulin r/.test(cat);
  const interm = /nph|novolin n|humulin n/.test(cat);
  if (rapid || short) return "rapid";
  if (long || interm) return "long";
  return "other";
}

// ── Build the per-day aggregated structure ────────────────────────────────
// glcReadings: [{ recorded_at, value, source }]
// Returns { byDate: { date: { values:[{min,value}], sourceCounts } }, orderedDates: [] }
export function aggregateByDay(readings, tzOffsetMinutes) {
  const byDate = {};
  for (const r of readings) {
    const ts = new Date(r.recorded_at).getTime();
    const date = localDayKey(ts, tzOffsetMinutes);
    const min = localMinuteOfDay(ts, tzOffsetMinutes);
    const v = Number(r.value);
    if (!date || min == null || !Number.isFinite(v)) continue;
    if (!byDate[date]) byDate[date] = { values: [], dexcomCount: 0 };
    byDate[date].values.push({ min, value: v });
    if (r.source === "dexcom" || r.source === "dexcom_share") byDate[date].dexcomCount += 1;
  }
  const orderedDates = Object.keys(byDate).sort();
  for (const d of orderedDates) {
    byDate[d].values.sort((a, b) => a.min - b.min);
  }
  return { byDate, orderedDates };
}

// A day "has data" when it carries >=50% of expected 5-min readings.
export function hasDayData(day) {
  return (day.dexcomCount || 0) >= EXPECTED_PER_DAY * 0.5;
}

// ── Detect recurring out-of-range hour windows (high or low) ──────────────
function detectPatterns(byDate, orderedDates, daysWithData) {
  const msByDate = {}; // date -> { value: [values] }
  for (const date of orderedDates) {
    for (const pt of byDate[date].values) {
      const hour = Math.floor(pt.min / 60);
      if (!msByDate[date]) msByDate[date] = {};
      if (!msByDate[date][hour]) msByDate[date][hour] = [];
      msByDate[date][hour].push(pt.value);
    }
  }
  const aggHourMean = Array.from({ length: 24 }, () => []);
  for (const date of Object.keys(msByDate)) {
    for (const hourStr of Object.keys(msByDate[date])) {
      const vals = msByDate[date][hourStr];
      aggHourMean[Number(hourStr)].push(vals.reduce((a, v) => a + v, 0) / vals.length);
    }
  }
  const aggMean = aggHourMean.map((arr) => (arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : null));

  const candidate = (isHigh) => {
    for (let start = 0; start < 24; start++) {
      let h = start;
      const run = [];
      while (h < 24 && aggMean[h] != null && (isHigh ? aggMean[h] > 180 : aggMean[h] < 70)) {
        run.push(h);
        h++;
      }
      if (run.length < 2) {
        start = h; // skip past
        continue;
      }
      const occurrences = [];
      for (const date of Object.keys(msByDate)) {
        const matched = run.filter((hr) => {
          const mean = msByDate[date][hr] && msByDate[date][hr].length
            ? msByDate[date][hr].reduce((a, v) => a + v, 0) / msByDate[date][hr].length
            : null;
          if (mean == null) return false;
          return isHigh ? mean > 180 : mean < 70;
        }).length;
        if (matched / run.length >= 0.6) occurrences.push(date);
      }
      if (occurrences.length >= MIN_PATTERN_OCCURRENCES) {
        const severityRaw = isHigh
          ? run.reduce((a, hr) => a + (aggMean[hr] ?? 180), 0) / run.length / 180
          : run.reduce((a, hr) => a + (70 / Math.max(aggMean[hr] ?? 70, 1)), 0) / run.length;
        return {
          type: isHigh ? "high" : "low",
          hours: run,
          count: occurrences.length,
          ofDays: daysWithData,
          severity: severityRaw,
          duration: run.length,
          significance: (occurrences.length / Math.max(daysWithData, 1)) * severityRaw * run.length,
          evidenceDates: occurrences.sort().reverse(),
        };
      }
      start = h;
    }
    return null;
  };

  const found = [candidate(true), candidate(false)].filter(Boolean)
    .sort((a, b) => b.significance - a.significance)
    .slice(0, MAX_PATTERNS);

  return found.map((p) => ({
    type: p.type,
    hours: p.hours,
    windowLabel: formatHourWindow(p.hours),
    count: p.count,
    ofDays: p.ofDays,
    severity: Math.round(p.severity * 100) / 100,
    significance: Math.round(p.significance * 1000) / 1000,
    evidenceDates: p.evidenceDates.slice(0, 12),
  }));
}

const hourLabel = (h) => `${h === 0 ? 12 : h > 12 ? h - 12 : h}${h < 12 ? "am" : "pm"}`;

function formatHourWindow(hours) {
  const sorted = [...hours].sort(sortedAsc);
  const start = sorted[0];
  const end = sorted[sorted.length - 1] + 1;
  return `${hourLabel(start)}–${hourLabel(end)}`;
}

// Downsample a day's points to fixed-width slot means (default 15-min), so
// large ranges stay reasonable on the wire while curves keep full fidelity.
// Falls back to raw points when a day has few readings.
function downsampledSeries(points, slotMinutes = 15) {
  if (!points.length) return [];
  if (points.length <= 144) return points.map((p) => ({ min: p.min, value: Math.round(p.value) }));
  const buckets = new Map();
  for (const p of points) {
    const slot = Math.floor(p.min / slotMinutes) * slotMinutes;
    if (!buckets.has(slot)) buckets.set(slot, []);
    buckets.get(slot).push(p.value);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([min, vals]) => ({ min, value: Math.round(vals.reduce((a, v) => a + v, 0) / vals.length) }));
}

// ── A day's full 24h series (downsampled) + stat block ──
export function dayDetail(date, day, targetLow, targetHigh) {
  const values = day.values.map((p) => p.value);
  const stats = statsFromValues(values);
  const counts = bandCounts(values);
  const bands = roundedBands(counts);
  const tir = values.length ? (counts[2] / values.length) * 100 : 0;
  // Insulin + carb info are attached by the caller.
  return {
    date,
    series: downsampledSeries(day.values),
    dexcomCount: day.dexcomCount,
    hasData: hasDayData(day),
    stats: stats
      ? {
          count: stats.count,
          min: Math.round(stats.min),
          max: Math.round(stats.max),
          mean: Math.round(stats.mean * 10) / 10,
          sd: Math.round(stats.sd * 10) / 10,
          cv: Math.round(stats.cv * 10) / 10,
          gmi: Math.round(stats.gmi * 10) / 10,
        }
      : null,
    bands,
    tirPercent: Math.round(tir),
  };
}

// ── The full computed report bundle ───────────────────────────────────────
export function computeReports(raw) {
  const {
    windowDays, tzOffsetMinutes, targetLow, targetHigh,
    current: { readings, doses, carbs },
    prior: { readings: priorReadings, doses: priorDoses, carbs: priorCarbs },
  } = raw;

  const now = new Date();
  const rangeStart = new Date(now.getTime() - windowDays * msPerDay);
  const rangeEnd = now;
  const priorStart = new Date(rangeStart.getTime() - windowDays * msPerDay);
  const priorEnd = new Date(rangeStart.getTime() - 1);

  // Only Dexcom-sourced readings count toward report statistics.
  const dexcom = readings.filter((r) => r.source === "dexcom" || r.source === "dexcom_share");
  const priorDexcom = priorReadings.filter((r) => r.source === "dexcom" || r.source === "dexcom_share");

  const currentAgg = aggregateByDay(dexcom, tzOffsetMinutes);
  const priorAgg = aggregateByDay(priorDexcom, tzOffsetMinutes);

  // Non-Dexcom (manual, system carry-forward) readings grouped by day, for the
  // Daily report's events table. Never part of report statistics.
  const manualByDate = {};
  for (const r of readings) {
    if (r.source === "dexcom" || r.source === "dexcom_share") continue;
    const date = localDayKey(new Date(r.recorded_at).getTime(), tzOffsetMinutes);
    if (!date) continue;
    if (!manualByDate[date]) manualByDate[date] = [];
    manualByDate[date].push({ time: r.recorded_at, value: Number(r.value) });
  }

  const daysWithDataDates = currentAgg.orderedDates.filter((d) => hasDayData(currentAgg.byDate[d]));
  const daysWithDataCount = daysWithDataDates.length;

  const usableValues = daysWithDataDates.flatMap((d) => currentAgg.byDate[d].values.map((p) => p.value));

  const stats = statsFromValues(usableValues);
  const counts = bandCounts(usableValues);
  const bandPercentages = roundedBands(counts);

  // Prior range summary (mirrors overview stats for Compare).
  const priorDaysWithData = priorAgg.orderedDates.filter((d) => hasDayData(priorAgg.byDate[d]));
  const priorUsable = priorDaysWithData.flatMap((d) => priorAgg.byDate[d].values.map((p) => p.value));
  const priorStats = statsFromValues(priorUsable);
  const priorCounts = bandCounts(priorUsable);
  const priorBandPercentages = roundedBands(priorCounts);

  const capturedTotal = dexcom.length;
  const expectedTotal = EXPECTED_PER_DAY * windowDays;
  const percentCaptured = expectedTotal ? Math.round((capturedTotal / expectedTotal) * 10) / 10 : 0;

  // Best / worst day by % time in target.
  const dayTir = daysWithDataDates.map((d) => ({
    date: d,
    day: currentAgg.byDate[d],
    tir: (() => {
      const arr = currentAgg.byDate[d].values.map((p) => p.value);
      return (bandCounts(arr)[2] / arr.length) * 100;
    })(),
  }));

  let bestDay = null, worstDay = null;
  if (dayTir.length) {
    dayTir.sort((a, b) => a.tir - b.tir);
    worstDay = dayTir[0];
    bestDay = dayTir[dayTir.length - 1];
  }

  // ── Insulin summary (factual totals, never a recommendation) ──
  const insulinSummary = (dosesList) => {
    let total = 0, rapid = 0, longU = 0;
    const byDay = {};
    for (const d of dosesList) {
      const u = Number(d.units) || 0;
      if (u <= 0) continue;
      total += u;
      const cat = insulinCategoryOf(d.insulin_type);
      if (cat === "rapid") rapid += u;
      else if (cat === "long") longU += u;
      const date = localDayKey(new Date(d.administered_at).getTime(), tzOffsetMinutes);
      if (date) byDay[date] = (byDay[date] || 0) + u;
    }
    const dayCount = Object.keys(byDay).length;
    return {
      totalUnits: Math.round(total * 10) / 10,
      rapidUnits: Math.round(rapid * 10) / 10,
      longUnits: Math.round(longU * 10) / 10,
      rapidPercent: total ? Math.round((rapid / total) * 100) : 0,
      longPercent: total ? Math.round((longU / total) * 100) : 0,
      otherPercent: total ? 100 - Math.round((rapid / total) * 100) - Math.round((longU / total) * 100) : 0,
      avgPerDay: dayCount ? Math.round((total / dayCount) * 10) / 10 : 0,
      avgDosesPerDay: dayCount ? Math.round((dosesList.length / dayCount) * 10) / 10 : 0,
      doseCount: dosesList.length,
    };
  };

  const currentInsulin = insulinSummary(doses);
  const priorInsulin = insulinSummary(priorDoses);

  // ── Full-range hourly percentile band (Overview) ──
  function hourlyPercentileBands(agg) {
    const byHour = Array.from({ length: 24 }, () => []);
    for (const date of Object.keys(agg.byDate)) {
      for (const pt of agg.byDate[date].values) byHour[Math.floor(pt.min / 60)].push(pt.value);
    }
    return byHour.map((arr) => {
      if (!arr.length) return null;
      const s = arr.slice().sort(sortedAsc);
      return {
        hour: byHour.indexOf(arr),
        p5: Math.round(quantileSorted(s, 0.05)),
        p25: Math.round(quantileSorted(s, 0.25)),
        p50: Math.round(medianSorted(s)),
        p75: Math.round(quantileSorted(s, 0.75)),
        p95: Math.round(quantileSorted(s, 0.95)),
        count: arr.length,
      };
    });
  }
  const hourBands = hourlyPercentileBands(currentAgg);

  // ── Overlay: one chart per ISO week (Mon-first) ──
  const overlayWeeks = buildOverlayWeeks(currentAgg, tzOffsetMinutes);

  // ── AGP: hour-of-day percentile bands + daily mini-profiles ──
  const agpHourBands = hourlyPercentileBands(currentAgg);

  // Daily Glucose Profile mini-charts: one per day in range (7 per row).
  const dailyProfiles = currentAgg.orderedDates
    .filter((d) => hasDayData(currentAgg.byDate[d]))
    .map((d) => ({
      date: d,
      series: downsampledSeries(currentAgg.byDate[d].values),
    }));

  // ── Daily + Hourly statistics ──
  const dailyStats = buildDailyStats(currentAgg, bandCountsPerPt);
  const hourlyStats = buildHourlyStats(currentAgg);

  // ── Prior range hour bands (for Overview completeness we only need current) ──

  // Patterns.
  const patterns = detectPatterns(currentAgg.byDate, currentAgg.orderedDates, daysWithDataCount);

  return {
    windowDays,
    rangeStart: rangeStart.toISOString(),
    rangeEnd: rangeEnd.toISOString(),
    priorStart: priorStart.toISOString(),
    priorEnd: priorEnd.toISOString(),
    targetLow,
    targetHigh,
    overview: {
      stats: stats ? {
        mean: Math.round(stats.mean * 10) / 10,
        gmi: Math.round(stats.gmi * 10) / 10,
        sd: Math.round(stats.sd * 10) / 10,
        cv: Math.round(stats.cv * 10) / 10,
        count: stats.count,
        min: Math.round(stats.min),
        max: Math.round(stats.max),
      } : null,
      bands: bandPercentages,
      completeness: {
        daysWithData: daysWithDataCount,
        totalDays: windowDays,
        percentCaptured,
        timeActivePercent: windowDays ? Math.round((daysWithDataCount / windowDays) * 1000) / 10 : 0,
      },
      insulin: currentInsulin,
      bestDay: bestDay ? { date: bestDay.date, tirPercent: Math.round(bestDay.tir) } : null,
      hourBands,
    },
    patterns: {
      bestDay: bestDay ? dayDetail(bestDay.date, bestDay.day, targetLow, targetHigh) : null,
      worstDay: worstDay ? dayDetail(worstDay.date, worstDay.day, targetLow, targetHigh) : null,
      recurring: patterns,
      bestDayMarkers: bestDay ? buildDayMarkers(bestDay.date, doses, carbs, tzOffsetMinutes) : { carbs: [], doses: [] },
      worstDayMarkers: worstDay ? buildDayMarkers(worstDay.date, doses, carbs, tzOffsetMinutes) : { carbs: [], doses: [] },
    },
    overlay: overlayWeeks,
    daily: buildDailyReport(currentAgg, doses, carbs, tzOffsetMinutes, targetLow, targetHigh, manualByDate),
    compare: {
      current: {
        stats: overviewStatsFor(stats),
        bands: bandPercentages,
        insulin: currentInsulin,
        bestDay: bestDay ? { date: bestDay.date, tirPercent: Math.round(bestDay.tir) } : null,
        completeness: { daysWithData: daysWithDataCount, totalDays: windowDays },
      },
      prior: {
        stats: overviewStatsFor(priorStats),
        bands: priorBandPercentages,
        insulin: priorInsulin,
        bestDay: priorStats ? bestDayOf(priorAgg) : null,
        completeness: { daysWithData: priorDaysWithData.length, totalDays: windowDays },
      },
    },
    dailyStats,
    hourlyStats,
    agp: {
      bands: bandPercentages,
      headline: {
        mean: stats ? Math.round(stats.mean * 10) / 10 : null,
        gmi: stats ? Math.round(stats.gmi * 10) / 10 : null,
        cv: stats ? Math.round(stats.cv * 10) / 10 : null,
        activePercent: windowDays ? Math.round((daysWithDataCount / windowDays) * 1000) / 10 : 0,
      },
      hourBands: agpHourBands,
      dailyProfiles,
    },
  };
}

function overviewStatsFor(stats) {
  if (!stats) return null;
  return {
    mean: Math.round(stats.mean * 10) / 10,
    gmi: Math.round(stats.gmi * 10) / 10,
    sd: Math.round(stats.sd * 10) / 10,
    cv: Math.round(stats.cv * 10) / 10,
  };
}

function bestDayOf(agg) {
  const dates = agg.orderedDates.filter((d) => hasDayData(agg.byDate[d]));
  let best = null, bestPct = -1;
  for (const d of dates) {
    const arr = agg.byDate[d].values.map((p) => p.value);
    const pct = (bandCounts(arr)[2] / arr.length) * 100;
    if (pct > bestPct) { bestPct = pct; best = d; }
  }
  return best ? { date: best, tirPercent: Math.round(bestPct) } : null;
}

// Map per-point band counts helper.
const bandCountsPerPt = (pts) => {
  const c = [0, 0, 0, 0, 0];
  for (const p of pts) {
    const v = p.value;
    for (let i = 0; i < BANDS.length; i++) {
      if (v >= BANDS[i].min && v < BANDS[i].max) { c[i]++; break; }
    }
  }
  return c;
};

// ── Date helpers for week grouping ──
function isoWeekStart(dateStr) {
  // Given local date YYYY-MM-DD (already tz-shifted), find the Monday of its ISO week.
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const day = dt.getUTCDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1 - day);
  const monday = new Date(Date.UTC(y, m - 1, d + diff));
  return monday.toISOString().slice(0, 10);
}

function buildOverlayWeeks(agg, tzOffsetMinutes) {
  // Group days by ISO week (Mon-first). Each week → array of {date, isoWeekday}.
  const byWeek = {};
  for (const date of agg.orderedDates) {
    const wk = isoWeekStart(date);
    if (!byWeek[wk]) byWeek[wk] = [];
    const [y, m, d] = date.split("-").map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    byWeek[wk].push({ date, weekday: dow, day: agg.byDate[date] });
  }
  const weeks = Object.keys(byWeek).sort().reverse().map((wk) => ({
    weekStart: wk,
    days: byWeek[wk]
      .map(({ date, weekday, day }) => ({
        date,
        weekday,
        hasData: hasDayData(day),
        series: downsampledSeries(day.values),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    dayCount: byWeek[wk].length,
  }));
  return weeks;
}

function buildDayMarkers(dateStr, doses, carbs, tzOffsetMinutes) {
  const matchDay = (ts) => localDayKey(ts, tzOffsetMinutes) === dateStr;
  return {
    carbs: (carbs || [])
      .filter((c) => matchDay(new Date(c.consumed_at).getTime()))
      .map((c) => ({
        min: localMinuteOfDay(new Date(c.consumed_at).getTime(), tzOffsetMinutes),
        name: c.food_name || c.name,
        carbs: Number(c.carbs) || 0,
        time: c.consumed_at,
      }))
      .filter((c) => c.min != null)
      .sort((a, b) => a.min - b.min),
    doses: (doses || [])
      .filter((d) => matchDay(new Date(d.administered_at).getTime()))
      .map((d) => ({
        min: localMinuteOfDay(new Date(d.administered_at).getTime(), tzOffsetMinutes),
        type: d.insulin_type,
        units: Number(d.units) || 0,
        time: d.administered_at,
      }))
      .filter((d) => d.min != null)
      .sort((a, b) => a.min - b.min),
  };
}

function buildDailyReport(agg, doses, carbs, tzOffsetMinutes, targetLow, targetHigh, manualByDate) {
  // Most recent first.
  const dates = agg.orderedDates.slice().reverse();
  return {
    targetLow,
    targetHigh,
    pages: dates.map((date) => {
      const day = agg.byDate[date];
      const diff = dayDetail(date, day, targetLow, targetHigh);
      // Markers row (meals + insulin).
      const markers = buildDayMarkers(date, doses, carbs, tzOffsetMinutes);
      // Events table: only days with irregular entries worth calling out —
      // a manual glucose log or a logged dose/carb — get one. Mirrors Clarity's
      // calibration table, but with data Stackd actually has.
      const events = [];
      for (const c of markers.carbs) {
        events.push({ time: c.time, type: "Nourishment", details: c.name || "Meal", valueText: `${c.carbs}g carbs` });
      }
      for (const d of markers.doses) {
        events.push({ time: d.time, type: "Support", details: d.type || "Insulin", valueText: `${Math.round(d.units * 10) / 10}u` });
      }
      for (const m of manualByDate?.[date] || []) {
        events.push({ time: m.time, type: "Manual reading", details: "", valueText: `${Math.round(Number(m.value))} mg/dL` });
      }
      events.sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
      const hasIrregular = events.some((e) => e.type === "Manual reading") || events.length > 0;
      return { ...diff, markers, events: hasIrregular ? events : [] };
    }),
  };
}

function buildDailyStats(agg, bandCountsFn) {
  const rows = ["veryHigh", "high", "target", "low", "veryLow"];
  const dayCols = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun -> JS dow (1=Mon..0=Sun)
  const build = (inDaytime) => {
    // Group values by weekday for the given time-of-day band.
    const byDow = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 0: [] };
    for (const date of agg.orderedDates) {
      const [y, m, d] = date.split("-").map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      for (const pt of agg.byDate[date].values) {
        const isDay = pt.min >= DAYTIME_START_MIN && pt.min < DAYTIME_END_MIN;
        if (isDay !== inDaytime) continue;
        byDow[dow].push(pt.value);
      }
    }
    const cols = {};
    for (const dow of dayCols) {
      const st = statsFromValues(byDow[dow]);
      if (!st) { cols[dow] = null; continue; }
      cols[dow] = {
        veryHigh: Math.round((bandCountsFn(byDow[dow].map((v) => ({ value: v })))[4] / byDow[dow].length) * 100),
        high: Math.round((bandCountsFn(byDow[dow].map((v) => ({ value: v })))[3] / byDow[dow].length) * 100),
        target: Math.round((bandCountsFn(byDow[dow].map((v) => ({ value: v })))[2] / byDow[dow].length) * 100),
        low: Math.round((bandCountsFn(byDow[dow].map((v) => ({ value: v })))[1] / byDow[dow].length) * 100),
        veryLow: Math.round((bandCountsFn(byDow[dow].map((v) => ({ value: v })))[0] / byDow[dow].length) * 100),
        count: st.count,
        min: Math.round(st.min),
        max: Math.round(st.max),
        mean: Math.round(st.mean * 10) / 10,
        sd: Math.round(st.sd * 10) / 10,
        q25: Math.round(st.q25),
        median: Math.round(st.median),
        q75: Math.round(st.q75),
        iqr: Math.round(st.iqr),
        cv: Math.round(st.cv * 10) / 10,
      };
    }
    return cols;
  };
  return {
    rows,
    columns: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    daytime: build(true),
    overnight: build(false),
  };
}

function buildHourlyStats(agg) {
  const stByIdx = Array.from({ length: 24 }, (_, h) => {
    const vals = [];
    for (const date of agg.orderedDates) {
      for (const pt of agg.byDate[date].values) {
        if (Math.floor(pt.min / 60) === h) vals.push(pt.value);
      }
    }
    return statsFromValues(vals);
  });
  const hourCols = stByIdx.map((st, h) => {
    if (!st) return { hour: h, values: null };
    const pts = stByIdx[h].count ? agg.orderedDates.flatMap((d) =>
      agg.byDate[d].values.filter((p) => Math.floor(p.min / 60) === h)
    ) : [];
    return {
      hour: h,
      values: {
        veryHigh: pts.length ? Math.round((bandCountsPerPt(pts)[4] / pts.length) * 100) : 0,
        high: pts.length ? Math.round((bandCountsPerPt(pts)[3] / pts.length) * 100) : 0,
        target: pts.length ? Math.round((bandCountsPerPt(pts)[2] / pts.length) * 100) : 0,
        low: pts.length ? Math.round((bandCountsPerPt(pts)[1] / pts.length) * 100) : 0,
        veryLow: pts.length ? Math.round((bandCountsPerPt(pts)[0] / pts.length) * 100) : 0,
        count: st.count,
        min: Math.round(st.min),
        max: Math.round(st.max),
        mean: Math.round(st.mean * 10) / 10,
        sd: Math.round(st.sd * 10) / 10,
        q25: Math.round(st.q25),
        median: Math.round(st.median),
        q75: Math.round(st.q75),
        iqr: Math.round(st.iqr),
        cv: Math.round(st.cv * 10) / 10,
      },
    };
  });
  return hourCols;
}

export { EXPECTED_PER_DAY as EXP_READINGS_PER_DAY };