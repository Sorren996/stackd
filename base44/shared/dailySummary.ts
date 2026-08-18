// Shared daily glucose summary computation and persistence.
// Used by syncDexcomGlucose (incremental updates after CGM sync) and
// getHistorySummary (reads pre-computed summaries with on-the-fly fallback).
//
// CGM readings are analytical telemetry — DailySummary stores the per-day
// glucose statistics so the History page and future features can read compact
// summaries instead of recalculating from hundreds of raw readings each load.

// Compute the user's local calendar date (YYYY-MM-DD) from a UTC timestamp
// using their IANA timezone identifier (e.g. "America/Chicago").
export function dayKeyFromTimezone(ts: string, timezone: string): string | null {
  if (!timezone) return null;
  try {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return null;
    // en-CA locale outputs ISO 8601 date format (YYYY-MM-DD)
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(d);
  } catch {
    return null;
  }
}

export interface DailyMetrics {
  date: string;
  average_glucose: number | null;
  time_in_range_percent: number | null;
  time_high_percent: number | null;
  time_low_percent: number | null;
  minimum_glucose: number | null;
  maximum_glucose: number | null;
  glucose_standard_deviation: number | null;
  glucose_coefficient_of_variation: number | null;
  reading_count: number;
  total_carbs: number;
  carb_count: number;
  total_insulin: number;
  insulin_count: number;
  target_range_low: number;
  target_range_high: number;
  glucose_sum: number;
  glucose_in_range: number;
  glucose_above_range: number;
  glucose_below_range: number;
}

export function computeDailyMetrics(
  glucose: any[],
  carbs: any[],
  insulin: any[],
  dateStr: string,
  timezone: string,
  targetLow: number,
  targetHigh: number
): DailyMetrics | null {
  const dayGlucose = glucose.filter((g) => dayKeyFromTimezone(g.recorded_at, timezone) === dateStr);
  const dayCarbs = carbs.filter((c) => dayKeyFromTimezone(c.consumed_at, timezone) === dateStr);
  const dayInsulin = insulin.filter((i) => dayKeyFromTimezone(i.administered_at, timezone) === dateStr);

  if (!dayGlucose.length && !dayCarbs.length && !dayInsulin.length) return null;

  const values = dayGlucose.map((g) => Number(g.value)).filter((v) => Number.isFinite(v));
  const count = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = count ? sum / count : null;
  const min = count ? Math.min(...values) : null;
  const max = count ? Math.max(...values) : null;
  const inRange = values.filter((v) => v >= targetLow && v <= targetHigh).length;
  const aboveRange = values.filter((v) => v > targetHigh).length;
  const belowRange = values.filter((v) => v < targetLow).length;

  let stdDev: number | null = null;
  if (count > 1 && avg != null) {
    const variance = values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / count;
    stdDev = Math.sqrt(variance);
  }
  const cv = stdDev != null && avg != null && avg > 0 ? (stdDev / avg) * 100 : null;

  const totalCarbs = dayCarbs.reduce((acc, c) => acc + Number(c.carbs || 0), 0);
  const totalInsulin = dayInsulin.reduce((acc, i) => acc + Number(i.units || 0), 0);

  return {
    date: dateStr,
    average_glucose: avg != null ? Math.round(avg * 10) / 10 : null,
    time_in_range_percent: count ? Math.round((inRange / count) * 1000) / 10 : null,
    time_high_percent: count ? Math.round((aboveRange / count) * 1000) / 10 : null,
    time_low_percent: count ? Math.round((belowRange / count) * 1000) / 10 : null,
    minimum_glucose: min,
    maximum_glucose: max,
    glucose_standard_deviation: stdDev != null ? Math.round(stdDev * 10) / 10 : null,
    glucose_coefficient_of_variation: cv != null ? Math.round(cv * 10) / 10 : null,
    reading_count: count,
    total_carbs: Math.round(totalCarbs),
    carb_count: dayCarbs.length,
    total_insulin: Math.round(totalInsulin * 10) / 10,
    insulin_count: dayInsulin.length,
    target_range_low: targetLow,
    target_range_high: targetHigh,
    glucose_sum: Math.round(sum * 10) / 10,
    glucose_in_range: inRange,
    glucose_above_range: aboveRange,
    glucose_below_range: belowRange,
  };
}

export async function upsertDailySummary(
  sr: any,
  userId: string,
  dateStr: string,
  metrics: DailyMetrics
): Promise<void> {
  const existing = await sr.entities.DailySummary.filter(
    { user_id: userId, date: dateStr },
    "-updated_date",
    1
  );

  const record = {
    user_id: userId,
    date: dateStr,
    ...metrics,
  };

  if (existing.length > 0) {
    await sr.entities.DailySummary.update(existing[0].id, record);
  } else {
    await sr.entities.DailySummary.create(record);
  }
}

// Recompute the DailySummary for a specific day from raw readings.
// Called after new CGM readings are imported to keep the summary current.
// Uses the actual reading timestamps so delayed readings update the correct day.
export async function recomputeDailySummary(
  sr: any,
  userId: string,
  dateStr: string,
  timezone: string,
  targetLow: number,
  targetHigh: number,
  dexcomConnected: boolean
): Promise<void> {
  // Fetch a 2-day window centered on the target date to handle timezone boundaries.
  // The dayKey filter below ensures only readings from the exact local day are used.
  const dayStart = new Date(`${dateStr}T00:00:00Z`);
  const fetchStart = new Date(dayStart.getTime() - 24 * 60 * 60 * 1000);
  const fetchEnd = new Date(dayStart.getTime() + 2 * 24 * 60 * 60 * 1000);

  const [glucose, carbs, insulin] = await Promise.all([
    sr.entities.GlucoseReading.filter(
      { user_id: userId, recorded_at: { $gte: fetchStart.toISOString(), $lte: fetchEnd.toISOString() } },
      "-recorded_at", 2000
    ),
    sr.entities.CarbEntry.filter(
      { created_by_id: userId, consumed_at: { $gte: fetchStart.toISOString(), $lte: fetchEnd.toISOString() } },
      "-consumed_at", 500
    ),
    sr.entities.InsulinDose.filter(
      { created_by_id: userId, administered_at: { $gte: fetchStart.toISOString(), $lte: fetchEnd.toISOString() } },
      "-administered_at", 500
    ),
  ]);

  // Match the existing getHistorySummary source filter: when CGM is connected,
  // only canonical "dexcom" readings contribute to stats (Share readings are
  // reconciled to "dexcom" by the API sync). When not connected, all readings
  // are used.
  const glucoseForStats = dexcomConnected
    ? glucose.filter((g) => g.source === "dexcom")
    : glucose;

  const metrics = computeDailyMetrics(
    glucoseForStats, carbs, insulin, dateStr, timezone, targetLow, targetHigh
  );

  if (metrics) {
    await upsertDailySummary(sr, userId, dateStr, metrics);
  }
}