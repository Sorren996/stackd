import { base44 } from "@/api/base44Client";

const CHUNK_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Fetches all glucose readings within a date range by paginating through
// parallel 14-day chunks. Database queries are capped at 5000 rows, and
// Dexcom generates ~288 readings/day, so 14 days (~4032 readings) stays
// safely within the limit. Also fetches manual readings separately to
// catch any that might span beyond the chunked range.
export async function fetchAllGlucoseReadings(rangeDays = 270) {
  const now = Date.now();
  const rangeStart = new Date(now - rangeDays * DAY_MS).toISOString();
  const rangeEnd = new Date(now).toISOString();

  const chunks = [];
  let cursor = new Date(rangeStart);
  const end = new Date(rangeEnd);
  while (cursor < end) {
    const chunkEnd = new Date(Math.min(cursor.getTime() + CHUNK_DAYS * DAY_MS, end.getTime()));
    chunks.push({ start: cursor.toISOString(), end: chunkEnd.toISOString() });
    cursor = chunkEnd;
  }

  const [chunkResults, manual] = await Promise.all([
    Promise.all(
      chunks.map((c) =>
        base44.entities.GlucoseReading.filter(
          { recorded_at: { $gte: c.start, $lte: c.end } },
          "-recorded_at", 5000
        )
      )
    ),
    base44.entities.GlucoseReading.filter({ source: "manual" }, "-recorded_at", 5000),
  ]);

  const all = chunkResults.flat();
  const seenIds = new Set(all.map((g) => g.id));
  return [...all, ...manual.filter((g) => !seenIds.has(g.id))];
}