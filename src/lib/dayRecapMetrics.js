import { format } from "date-fns";

export function normalizeCarbEntry(entry) {
  const consumedAt = entry.consumed_at || entry.recorded_at || entry.created_date || entry.created_at;
  const carbs = Number(entry.carbs ?? entry.carbs_grams ?? entry.total_carbs ?? entry.totalCarbs ?? 0);
  const name = entry.food_name || entry.name || "Estimated meal";
  return {
    ...entry,
    id: entry.id || entry._id || `${consumedAt}-${name}-${carbs}`,
    name,
    food_name: name,
    carbs: Number.isFinite(carbs) ? carbs : 0,
    consumed_at: consumedAt,
  };
}

// Builds the merged, chronologically-sorted timeline feed used by the
// HistoryTimelineView. Mirrors the original History.jsx merge logic so the
// existing edit/delete flow is preserved exactly.
export function buildTimelineLogs(glucose, carbs, insulin, dexcomConnected) {
  return [
    ...glucose
      .filter((g) => {
        if (g.source === "system") return false;
        if (dexcomConnected && (g.source === "dexcom" || g.source === "dexcom_share")) return false;
        return true;
      })
      .map((i) => ({ ...i, feedType: "glucose", timestamp: new Date(i.recorded_at).getTime() })),
    ...carbs.map((i) => ({ ...normalizeCarbEntry(i), feedType: "carbs", timestamp: new Date(i.consumed_at).getTime() })),
    ...insulin.map((i) => ({ ...i, feedType: "insulin", timestamp: new Date(i.administered_at).getTime() })),
  ].sort((a, b) => b.timestamp - a.timestamp);
}

// A reading counts as "manual" when it is not CGM telemetry and not a
// system carry-forward. This is the only glucose count we surface in the UI.
export function isManualGlucose(g) {
  if (!g) return false;
  if (g.source === "system") return false;
  if (g.source === "dexcom" || g.source === "dexcom_share") return false;
  return true;
}

export function minutesOfDay(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.getHours() * 60 + d.getMinutes();
}

export function getGlucoseAt(readings, timeMs) {
  if (!readings.length) return null;
  let nearest = readings[0];
  let best = Math.abs(readings[0].time - timeMs);
  for (const r of readings) {
    const d = Math.abs(r.time - timeMs);
    if (d < best) {
      best = d;
      nearest = r;
    }
  }
  return nearest.value;
}

// Find the reading closest to the midpoint of [windowStart, windowEnd],
// but only if a reading falls within that window.
export function findReadingNear(readings, targetTimeMs, beforeMin = -15, afterMin = 15) {
  if (!readings?.length) return null;
  const windowStart = targetTimeMs + beforeMin * 60 * 1000;
  const windowEnd = targetTimeMs + afterMin * 60 * 1000;
  let nearest = null;
  let bestDist = Infinity;
  for (const r of readings) {
    if (r.time < windowStart || r.time > windowEnd) continue;
    const dist = Math.abs(r.time - targetTimeMs);
    if (dist < bestDist) {
      bestDist = dist;
      nearest = r;
    }
  }
  return nearest;
}

// Derives a full set of day-level glucose observations from raw readings.
// All calculations are client-side over existing data — no backend changes.
export function computeDayGlucoseMetrics(glucose, targetLow, targetHigh) {
  const readings = (glucose || [])
    .map((g) => ({ time: new Date(g.recorded_at).getTime(), value: Number(g.value), source: g.source }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
    .sort((a, b) => a.time - b.time);

  if (!readings.length) return { hasData: false, count: 0 };

  let sum = 0, inRange = 0, min = Infinity, max = -Infinity;
  for (const r of readings) {
    sum += r.value;
    if (r.value < min) min = r.value;
    if (r.value > max) max = r.value;
    if (r.value >= targetLow && r.value <= targetHigh) inRange++;
  }
  const avg = Math.round(sum / readings.length);
  const tir = Math.round((inRange / readings.length) * 100);

  // Approximate time above/below range by summing the gap to the next
  // reading while the current reading is out of range (capped at 15 min
  // so long sensor gaps don't inflate the totals).
  let aboveMs = 0, belowMs = 0;
  for (let i = 0; i < readings.length - 1; i++) {
    const gap = Math.min(readings[i + 1].time - readings[i].time, 15 * 60 * 1000);
    if (readings[i].value > targetHigh) aboveMs += gap;
    else if (readings[i].value < targetLow) belowMs += gap;
  }

  // Longest consecutive in-range stretch.
  let longestStableMs = 0, runStart = null;
  for (let i = 0; i < readings.length; i++) {
    const inR = readings[i].value >= targetLow && readings[i].value <= targetHigh;
    if (inR && runStart === null) runStart = i;
    if (!inR && runStart !== null) {
      const span = readings[i - 1].time - readings[runStart].time;
      if (span > longestStableMs) longestStableMs = span;
      runStart = null;
    }
  }
  if (runStart !== null) {
    const span = readings[readings.length - 1].time - readings[runStart].time;
    if (span > longestStableMs) longestStableMs = span;
  }

  // Steepest single-step rise and when it peaked.
  let steepestRise = 0, steepestRiseTime = null;
  for (let i = 1; i < readings.length; i++) {
    const rise = readings[i].value - readings[i - 1].value;
    if (rise > steepestRise) {
      steepestRise = rise;
      steepestRiseTime = readings[i].time;
    }
  }

  let peak = readings[0], low = readings[0];
  for (const r of readings) {
    if (r.value > peak.value) peak = r;
    if (r.value < low.value) low = r;
  }

  return {
    hasData: true,
    count: readings.length,
    avg,
    min: Math.round(min),
    max: Math.round(max),
    tir,
    aboveMs,
    belowMs,
    longestStableMs,
    steepestRise,
    steepestRiseTime,
    peakTime: peak.time,
    lowTime: low.time,
  };
}

export function formatDuration(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}