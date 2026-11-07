import { base44 } from "@/api/base44Client";
import { withStartupDeadline } from "@/lib/startupDiagnostics";

// Insights reads exactly one authorized calendar window, sequentially paged.
// Never publish a partial window: any page failure rejects the entire attempt.
export async function fetchAllGlucoseReadings({ userId, start, end, signal }) {
  if (!userId) throw new Error("Insights requires an authenticated account");
  const query = {
    $or: [{ created_by_id: userId }, { user_id: userId }],
    recorded_at: { $gte: start.toISOString(), $lte: end.toISOString() },
  };
  const readings = new Map();
  const cursors = new Set();
  const deadline = Date.now() + 90_000;
  let cursor;
  do {
    signal?.throwIfAborted();
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("Insights request timed out");
    const page = await withStartupDeadline(
      base44.entities.GlucoseReading.filter(query, {
        sort: "-recorded_at", limit: 5000, cursor,
        fields: ["id", "recorded_at", "value", "source"],
      }),
      Math.min(30_000, remaining),
    );
    signal?.throwIfAborted();
    if (!Array.isArray(page?.items) || typeof page.has_more !== "boolean") {
      throw new Error("Incomplete Insights response");
    }
    for (const reading of page.items) readings.set(reading.id, reading);
    if (!page.has_more) return [...readings.values()];
    if (!page.next_cursor || cursors.has(page.next_cursor)) {
      throw new Error("Insights pagination did not advance");
    }
    cursor = page.next_cursor;
    cursors.add(cursor);
  } while (cursor);
}