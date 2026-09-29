import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Returns compact, pre-aggregated daily statistics for the authenticated user's
// last 9 months (270 days) of glucose, carb, and insulin logs. This keeps the
// History page fast: it receives ~270 small aggregate objects instead of every
// raw log, and derives weekly/monthly rollups client-side without re-fetching.
//
// User isolation is enforced by RLS (created_by_id) — these user-scoped queries
// can only ever return the caller's own records.
//
// Optimization: uses pre-computed DailySummary records as the PRIMARY glucose
// data source, and only fetches raw readings for the last 2 days to cover the
// gap where the incremental sync pipeline may not have written a summary yet.
// This reduces the function from ~20 parallel API calls (14-day glucose chunks)
// to ~4 calls, eliminating the rate-limit/timeout 500s that caused the History
// page to lose its data on navigation.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch { /* empty body is fine */ }
    // Minutes the user's local clock is behind UTC (from getTimezoneOffset()).
    // Used to bucket each log into the calendar day the user actually experienced.
    const tzOffsetMinutes = Number(body.tzOffsetMinutes) || 0;

    const dayMs = 24 * 60 * 60 * 1000;
    const now = new Date();
    const rangeEnd = now.toISOString();
    const rangeStart = new Date(now.getTime() - 270 * dayMs).toISOString();

    // Target range from the user's settings (defaults if unavailable).
    let targetLow = 70;
    let targetHigh = 180;
    try {
      const settings = await base44.entities.UserSettings.list('-created_date', 1);
      const s: any = settings[0];
      if (s) {
        if (Number.isFinite(s.target_range_low)) targetLow = s.target_range_low;
        if (Number.isFinite(s.target_range_high)) targetHigh = s.target_range_high;
      }
    } catch {
      // Fall back to defaults if settings cannot be read.
    }

    // Recent window: only fetch raw glucose for the last 2 days to cover the
    // gap where DailySummary may not exist yet. Everything older uses the
    // pre-computed DailySummary records.
    const recentStart = new Date(now.getTime() - 2 * dayMs).toISOString();

    const [summaries, recentGlucose, carbs, insulin] = await Promise.all([
      base44.entities.DailySummary.filter(
        { date: { $gte: rangeStart.slice(0, 10), $lte: rangeEnd.slice(0, 10) } },
        "-date", 300
      ),
      base44.entities.GlucoseReading.filter(
        { recorded_at: { $gte: recentStart, $lte: rangeEnd }, source: { $ne: "system" } },
        '-recorded_at', 5000
      ),
      base44.entities.CarbEntry.filter(
        { consumed_at: { $gte: rangeStart, $lte: rangeEnd } },
        '-consumed_at', 5000
      ),
      base44.entities.InsulinDose.filter(
        { administered_at: { $gte: rangeStart, $lte: rangeEnd } },
        '-administered_at', 5000
      ),
    ]);

    const dayMap: Record<string, any> = {};
    const dayKey = (ts: string) => {
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return null;
      // Shift from UTC to the user's local wall-clock so the day bucket
      // matches the calendar day they experienced.
      return new Date(d.getTime() - tzOffsetMinutes * 60000).toISOString().slice(0, 10);
    };
    const ensure = (day: string) => {
      if (!dayMap[day]) {
        dayMap[day] = {
          date: day,
          glucose: { sum: 0, count: 0, inRange: 0 },
          carbs: { total: 0, count: 0 },
          insulin: { total: 0, count: 0 },
        };
      }
      return dayMap[day];
    };

    // Seed dayMap from pre-computed DailySummary records (primary source).
    const summaryMap: Record<string, any> = {};
    for (const ds of summaries) {
      if (!ds.date) continue;
      summaryMap[ds.date] = ds;
      const d = ensure(ds.date);
      if (Number.isFinite(ds.reading_count) && ds.reading_count > 0) {
        d.glucose.sum = ds.glucose_sum || 0;
        d.glucose.count = ds.reading_count;
        d.glucose.inRange = ds.glucose_in_range || 0;
      }
    }

    // Overlay raw readings for the last 2 days (replaces the summary if the
    // raw data is richer — the summary may lag by a few minutes).
    const recentDays = new Set<string>();
    recentGlucose.forEach((g: any) => {
      const day = dayKey(g.recorded_at);
      if (!day) return;
      const v = Number(g.value);
      if (!Number.isFinite(v)) return;
      recentDays.add(day);
      const d = ensure(day);
      // Reset the day's glucose to recompute from raw readings
      if (d.glucose._fromRaw !== true) {
        d.glucose = { sum: 0, count: 0, inRange: 0, _fromRaw: true };
      }
      d.glucose.sum += v;
      d.glucose.count++;
      if (v >= targetLow && v <= targetHigh) d.glucose.inRange++;
    });

    // Fallback: fill glucose stats for days where DailySummary had no data
    // (reading_count = 0). The sync pipeline sometimes creates empty
    // DailySummary records. For those days, fetch raw readings in 14-day
    // chunks and compute stats on the fly so the History page never shows
    // blank months. Limited to 6 parallel chunks (~84 days) to stay fast.
    const emptyDays = Object.values(dayMap)
      .filter((d: any) => d.glucose.count === 0 && !recentDays.has(d.date))
      .map((d: any) => d.date as string)
      .sort();

    if (emptyDays.length > 0) {
      const emptyDaySet = new Set(emptyDays);
      const gapStart = new Date(`${emptyDays[0]}T00:00:00Z`).getTime();
      const gapEnd = new Date(`${emptyDays[emptyDays.length - 1]}T23:59:59Z`).getTime();
      const chunkMs = 14 * dayMs;

      // Process from the most recent empty days first so recent months
      // (which the user is most likely viewing) are always covered, even
      // when empty days span a wide range.
      const chunks: { start: string; end: string }[] = [];
      for (let cur = gapEnd; cur > gapStart && chunks.length < 6; cur -= chunkMs) {
        const chunkStart = Math.max(cur - chunkMs, gapStart);
        chunks.push({ start: new Date(chunkStart).toISOString(), end: new Date(cur).toISOString() });
      }

      const chunkResults = await Promise.all(
        chunks.map((c) =>
          base44.entities.GlucoseReading.filter(
            { recorded_at: { $gte: c.start, $lte: c.end }, source: { $ne: "system" } },
            '-recorded_at', 5000
          ).catch(() => [] as any[])
        )
      );

      chunkResults.flat().forEach((g: any) => {
        const day = dayKey(g.recorded_at);
        if (!day || !emptyDaySet.has(day)) return;
        const v = Number(g.value);
        if (!Number.isFinite(v)) return;
        const d = ensure(day);
        if (d.glucose._fromRaw !== true) {
          d.glucose = { sum: 0, count: 0, inRange: 0, _fromRaw: true };
        }
        d.glucose.sum += v;
        d.glucose.count++;
        if (v >= targetLow && v <= targetHigh) d.glucose.inRange++;
      });
    }

    carbs.forEach((c: any) => {
      const day = dayKey(c.consumed_at);
      if (!day) return;
      const v = Number(c.carbs);
      if (!Number.isFinite(v)) return;
      const d = ensure(day);
      d.carbs.total += v;
      d.carbs.count++;
    });

    insulin.forEach((i: any) => {
      const day = dayKey(i.administered_at);
      if (!day) return;
      const v = Number(i.units);
      if (!Number.isFinite(v)) return;
      const d = ensure(day);
      d.insulin.total += v;
      d.insulin.count++;
    });

    const days = Object.values(dayMap).map((d: any) => ({
      date: d.date,
      glucose: {
        sum: Math.round(d.glucose.sum * 10) / 10,
        count: d.glucose.count,
        inRange: d.glucose.inRange,
      },
      carbs: { total: Math.round(d.carbs.total), count: d.carbs.count },
      insulin: { total: Math.round(d.insulin.total * 10) / 10, count: d.insulin.count },
    })).sort((a, b) => b.date.localeCompare(a.date));

    return Response.json({ rangeStart, rangeEnd, targetLow, targetHigh, days });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});