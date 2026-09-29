// Shared loader for the Stackd Reports system: fetches the authenticated
// user's Dexcom glucose, insulin doses, and carb entries across BOTH the
// selected range and the immediately preceding equivalent range, then computes
// the full multi-report bundle via reportsCore.

import { computeReports } from "./reportsCore.ts";

const msPerDay = 24 * 60 * 60 * 1000;

export async function buildReports(base44, windowDays, tzOffsetMinutes) {
  const user = await base44.auth.me();
  if (!user) return { error: "Unauthorized", status: 401 };

  const days = Number(windowDays);
  if (!Number.isFinite(days) || days < 1 || days > 90) {
    return { error: "Pick a date range between 1 and 90 days.", status: 400 };
  }

  const now = new Date();
  const rangeEnd = now.getTime();
  const rangeStart = rangeEnd - days * msPerDay;
  const priorStart = rangeStart - days * msPerDay;
  const priorEnd = rangeStart - 1;

  // ── Fetch Dexcom glucose (5-min cadence) in parallel 7-day chunks so we
  //    never exceed the per-query row cap. Both the current and prior range.
  const readChunk = async (start, end) => {
    const chunks = [];
    let cursor = start;
    while (cursor < end) {
      const ce = Math.min(cursor + 7 * msPerDay, end);
      chunks.push({ start: new Date(cursor).toISOString(), end: new Date(ce).toISOString() });
      cursor = ce;
    }
    const results = await Promise.all(chunks.map((c) =>
      base44.entities.GlucoseReading.filter(
        { recorded_at: { $gte: c.start, $lte: c.end } },
        "-recorded_at",
        5000
      ).catch(() => [])
    ));
    const merged = results.flat();
    const seen = new Set();
    const out = [];
    for (const r of merged) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
    return out;
  };

  const [currentGlucoseRaw, priorGlucoseRaw] = await Promise.all([
    readChunk(rangeStart, rangeEnd),
    readChunk(priorStart, priorEnd),
  ]);

  // Window the results precisely (chunk edges may overshoot by a hair).
  const currentGlucose = currentGlucoseRaw.filter((r) => {
    const t = new Date(r.recorded_at).getTime();
    return t >= rangeStart && t <= rangeEnd;
  });
  const priorGlucose = priorGlucoseRaw.filter((r) => {
    const t = new Date(r.recorded_at).getTime();
    return t >= priorStart && t <= priorEnd;
  });

  // ── Fetch insulin doses + carb entries for both ranges (small bounded). ──
  const fetchRange = (listEntity, field, start, end) => {
    const q = { [field]: { $gte: new Date(start).toISOString(), $lte: new Date(end).toISOString() } };
    return base44.entities[listEntity].filter(q, `-${field}`, 2000).catch(() => []);
  };

  const [currentDoses, priorDoses, currentCarbs, priorCarbs] = await Promise.all([
    fetchRange("InsulinDose", "administered_at", rangeStart, rangeEnd),
    fetchRange("InsulinDose", "administered_at", priorStart, priorEnd),
    fetchRange("CarbEntry", "consumed_at", rangeStart, rangeEnd),
    fetchRange("CarbEntry", "consumed_at", priorStart, priorEnd),
  ]);

  // ── Resolve the user's target range (server-side authority) ──
  let targetLow = 70, targetHigh = 180;
  try {
    const s = await base44.entities.UserSettings.list("-created_date", 1);
    if (s && s[0]) {
      const lo = Number(s[0].target_range_low), hi = Number(s[0].target_range_high);
      if (Number.isFinite(lo) && lo > 0) targetLow = lo;
      if (Number.isFinite(hi) && hi > 0) targetHigh = hi;
    }
  } catch { /* default range */ }

  const reports = computeReports({
    windowDays: days,
    tzOffsetMinutes: Number(tzOffsetMinutes) || 0,
    targetLow,
    targetHigh,
    current: { readings: currentGlucose, doses: currentDoses, carbs: currentCarbs },
    prior: { readings: priorGlucose, doses: priorDoses, carbs: priorCarbs },
  });

  // User + system meta for report headers.
  let cgmSystem = "Dexcom";
  try {
    const conns = await base44.entities.DexcomConnection.filter({ status: "connected" }, "-created_date", 1);
    const conn = conns[0];
    if (conn?.cgm_model) {
      cgmSystem = conn.cgm_model === "G7_15" ? "Dexcom G7 (15-day)" : `Dexcom ${conn.cgm_model}`;
    }
  } catch { cgmSystem = "Dexcom"; }

  return {
    status: 200,
    data: {
      ...reports,
      meta: {
        displayName: user.full_name || user.email || "Stackd user",
        email: user.email || "",
        cgmSystem,
        generatedAt: new Date().toISOString(),
        expectedPerDay: 288,
      },
    },
  };
}