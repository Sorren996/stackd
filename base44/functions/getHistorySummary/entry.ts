import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Returns compact, pre-aggregated daily statistics for the authenticated user's
// last 9 months (270 days) of glucose, carb, and insulin logs. This keeps the
// History page fast: it receives ~270 small aggregate objects instead of every
// raw log, and derives weekly/monthly rollups client-side without re-fetching.
//
// User isolation is enforced by RLS (created_by_id) — these user-scoped queries
// can only ever return the caller's own records.

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

    // When connected to a CGM source, time-in-range and averages should
    // reflect only actual sensor readings — not manual logs or carry-forward.
    let dexcomConnected = false;
    try {
      const connections = await base44.entities.DexcomConnection.filter({ status: "connected" });
      dexcomConnected = connections.length > 0;
    } catch { /* fall back to all readings */ }

    // Dexcom generates ~288 readings/day, and database queries are capped at
    // 5000 rows. A single fetch only covers ~17 days — older months get cut
    // off entirely. Paginate through 14-day parallel chunks so the full 9-month
    // window is captured. Manual readings are sparse and fit in one query.
    const chunkDays = 14;
    const glucoseChunks: { start: string; end: string }[] = [];
    {
      let cursor = new Date(rangeStart);
      const end = new Date(rangeEnd);
      while (cursor < end) {
        const chunkEnd = new Date(Math.min(cursor.getTime() + chunkDays * dayMs, end.getTime()));
        glucoseChunks.push({ start: cursor.toISOString(), end: chunkEnd.toISOString() });
        cursor = chunkEnd;
      }
    }

    const [chunkResults, manualGlucose, carbs, insulin] = await Promise.all([
      Promise.all(
        glucoseChunks.map((c) =>
          base44.entities.GlucoseReading.filter(
            { recorded_at: { $gte: c.start, $lte: c.end } },
            '-recorded_at', 5000
          )
        )
      ),
      base44.entities.GlucoseReading.filter(
        { source: "manual", recorded_at: { $gte: rangeStart, $lte: rangeEnd } },
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

    const glucoseRecent = chunkResults.flat();
    const seenIds = new Set(glucoseRecent.map((g: any) => g.id));
    const glucose = [...glucoseRecent, ...manualGlucose.filter((g: any) => !seenIds.has(g.id))];

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

    // Include every real reading (manual + CGM); only carry-forward
    // "system" entries are excluded so they don't skew averages.
    const glucoseForStats = glucose.filter((g: any) => g.source !== "system");

    glucoseForStats.forEach((g: any) => {
      const day = dayKey(g.recorded_at);
      if (!day) return;
      const v = Number(g.value);
      if (!Number.isFinite(v)) return;
      const d = ensure(day);
      d.glucose.sum += v;
      d.glucose.count++;
      if (v >= targetLow && v <= targetHigh) d.glucose.inRange++;
    });

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

    // Prefer pre-computed DailySummary records for glucose stats when available.
    // This avoids recalculating glucose aggregates for days already summarized by
    // the incremental sync pipeline. Days without a summary fall back to the
    // on-the-fly computation above. Carbs and insulin are always computed from
    // raw logs so they stay current with user edits.
    const summaryMap: Record<string, any> = {};
    try {
      const summaries = await base44.entities.DailySummary.filter(
        { date: { $gte: rangeStart.slice(0, 10), $lte: rangeEnd.slice(0, 10) } },
        "-date", 300
      );
      for (const ds of summaries) {
        if (ds.date) summaryMap[ds.date] = ds;
      }
    } catch {
      // DailySummary read failure is non-fatal — fall back to on-the-fly
    }

    const days = Object.values(dayMap).map((d: any) => {
      const ds = summaryMap[d.date];
      // Prefer the on-the-fly computation (which now includes manual readings)
      // and only fall back to a pre-computed summary when raw readings weren't
      // available for this day.
      const useSummary = !d.glucose.count && ds && Number.isFinite(ds.reading_count) && ds.reading_count > 0;
      return {
        date: d.date,
        glucose: useSummary
          ? {
              sum: ds.glucose_sum || 0,
              count: ds.reading_count,
              inRange: ds.glucose_in_range || 0,
            }
          : {
              sum: Math.round(d.glucose.sum * 10) / 10,
              count: d.glucose.count,
              inRange: d.glucose.inRange,
            },
        carbs: { total: Math.round(d.carbs.total), count: d.carbs.count },
        insulin: { total: Math.round(d.insulin.total * 10) / 10, count: d.insulin.count },
      };
    }).sort((a, b) => b.date.localeCompare(a.date));

    return Response.json({ rangeStart, rangeEnd, targetLow, targetHigh, days });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});