// Shared loader: fetch the authenticated user's Dexcom readings for a window
// and compute the full Insights object. Used by computeInsights (page) and
// generateInsightsPdf (download + email) so they render identical numbers.

import { computeInsights, EXPECTED_READINGS_PER_DAY } from "./insightsCore.ts";

const msPerDay = 24 * 60 * 60 * 1000;

export async function buildInsights(base44, windowDays, tzOffsetMinutes) {
  const user = await base44.auth.me();
  if (!user) return { error: "Unauthorized", status: 401 };

  const days = Number(windowDays);
  if (![7, 14, 30, 90].includes(days)) {
    return { error: "Invalid window, choose 7, 14, 30 or 90 days.", status: 400 };
  }

  const now = new Date();
  const rangeStart = new Date(now.getTime() - days * msPerDay);
  const rangeEnd = now;

  // Paginate Dexcom readings in parallel 7-day chunks (7d * 288 ≈ 2016 < the
  // 5000-row query cap). Only Dexcom source counts toward the window.
  const chunks = [];
  let cursor = new Date(rangeStart);
  while (cursor < rangeEnd) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + 7 * msPerDay, rangeEnd.getTime()));
    chunks.push({ start: cursor.toISOString(), end: chunkEnd.toISOString() });
    cursor = chunkEnd;
  }

  const chunkResults = await Promise.all(
    chunks.map((c) =>
      base44.entities.GlucoseReading.filter(
        { recorded_at: { $gte: c.start, $lte: c.end }, source: { $in: ["dexcom", "dexcom_share"] } },
        "-recorded_at",
        5000
      ).catch(() => [])
    ).concat(
      // Catch any Dexcom reading slightly past the chunk bounds on the edges.
      base44.entities.GlucoseReading.filter(
        { source: { $in: ["dexcom", "dexcom_share"] }, recorded_at: { $gte: rangeStart.toISOString(), $lte: rangeEnd.toISOString() } },
        "-recorded_at",
        5000
      ).catch(() => [])
    )
  );

  // Merge and de-duplicate across chunks.
  const merged = chunkResults.flat();
  const seen = new Set();
  const readings = [];
  for (const r of merged) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    readings.push(r);
  }

  // Only compute over readings within the window (edge guards may overshoot).
  const windowed = readings.filter((r) => {
    const t = new Date(r.recorded_at).getTime();
    return t >= rangeStart.getTime() && t <= rangeEnd.getTime() + 1;
  });

  const insights = computeInsights(windowed, { windowDays: days, tzOffsetMinutes: Number(tzOffsetMinutes) || 0 });

  // User + system meta for the report header.
  let cgmSystem = "Dexcom";
  try {
    const conns = await base44.entities.DexcomConnection.filter({ status: "connected" }, "-created_date", 1);
    const conn = conns[0];
    if (conn?.cgm_model) {
      cgmSystem = conn.cgm_model === "G7_15" ? "Dexcom G7 (15-day)" : `Dexcom ${conn.cgm_model}`;
    } else {
      cgmSystem = "Dexcom";
    }
  } catch {
    cgmSystem = "Dexcom";
  }

  return {
    status: 200,
    data: {
      ...insights,
      meta: {
        displayName: user.full_name || user.email || "Stackd user",
        email: user.email || "",
        cgmSystem,
        generatedAt: new Date().toISOString(),
        expectedPerDay: EXPECTED_READINGS_PER_DAY,
      },
    },
  };
}