// The newest point the glucose line actually draws.
//
// The end-of-line marker used to be derived from its own list, so it could name
// a sample the plotted rows did not carry. A ReferenceDot outside the X domain
// is dropped silently by the chart library — the line kept rendering and the dot
// simply vanished. Reading the plotted rows themselves makes the dot a point of
// the line by construction, and guarantees it is inside the domain, so nothing
// has to be clamped or special-cased.

const GLUCOSE_KEY = "glucose";
const SEGMENT_PREFIX = "glucose_seg_";

/**
 * @param {Array<Record<string, unknown>>} rows  the chart's plotted rows
 * @returns {{ time: number, value: number } | null}
 */
export function newestDrawnPoint(rows) {
  if (!Array.isArray(rows)) return null;
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i];
    if (!row) continue;
    for (const key of Object.keys(row)) {
      if (key !== GLUCOSE_KEY && !key.startsWith(SEGMENT_PREFIX)) continue;
      const value = row[key];
      if (typeof value === "number" && Number.isFinite(value) && Number.isFinite(row.time)) {
        return { time: row.time, value };
      }
    }
  }
  return null;
}