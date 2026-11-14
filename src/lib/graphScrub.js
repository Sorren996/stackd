// THE SCRUB POSITION MODEL — one line, one number, everything derives from it.
//
// A scrub position is a single number between 0 and 1:
//
//   • A (0) is the newest received reading, and that is the position on load.
//   • B (1) is the final forecast point when a projection exists. With no
//     projection, B equals A.
//
// The marker, the number beside the chart and the estimate strip all read from
// this one model, so no two of them can ever be wired to different things: the
// readout can only change when the marker moves, because both come from here.
//
// Everything in this file is pure, so the position arithmetic can be checked
// without a chart.

export const READING_KIND = "reading";
export const FORECAST_KIND = "forecast";

// A projection's trajectory is written by the backend, where a time may arrive
// as an epoch number or an ISO string.
export function timeOf(value) {
  if (Number.isFinite(value)) return value;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : NaN;
}

/** The final forecast point's time, or null when there is no forecast. */
export function projectionEndTime(projection) {
  if (!projection || projection.abstained) return null;
  const trajectory = Array.isArray(projection.trajectory) ? projection.trajectory : [];
  let end = null;
  for (const point of trajectory) {
    const time = timeOf(point?.time);
    if (Number.isFinite(time) && (end === null || time > end)) end = time;
  }
  return end;
}

/**
 * The merged list the chart scrubs through: every drawn reading, then every
 * forecast point. Readings keep their run index, so a genuine gap in the
 * sensor stream stays a gap in the drawn line rather than being bridged.
 *
 * Returns the entries, A (`anchor`) and B (`horizon`).
 */
export function buildScrubEntries({ segments = [], trajectory = [], abstained = false } = {}) {
  const entries = [];

  (segments || []).forEach((segment, run) => {
    (segment || []).forEach((sample) => {
      const time = Number(sample?.time);
      const value = Number(sample?.value);
      if (!Number.isFinite(time) || !Number.isFinite(value)) return;
      entries.push({ kind: READING_KIND, time, value, run });
    });
  });
  entries.sort((a, b) => a.time - b.time);

  const anchor = entries.length ? entries[entries.length - 1] : null;

  const forecast = abstained ? [] : (trajectory || [])
    .map((point) => {
      const time = timeOf(point?.time);
      const value = Number(point?.value);
      if (!Number.isFinite(time) || !Number.isFinite(value)) return null;
      // Only the future: a point at or before the newest reading is history.
      if (anchor && time <= anchor.time) return null;
      return {
        kind: FORECAST_KIND,
        time,
        value,
        run: -1,
        minOffset: Number.isFinite(Number(point?.min_offset)) ? Number(point.min_offset) : null,
        lower: Number.isFinite(Number(point?.lower)) ? Math.round(Number(point.lower)) : null,
        upper: Number.isFinite(Number(point?.upper)) ? Math.round(Number(point.upper)) : null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.time - b.time);

  for (const point of forecast) entries.push(point);

  const horizon = forecast.length ? forecast[forecast.length - 1] : anchor;

  return { entries, anchor, horizon };
}

/** The position (0..1) at which the marker sits on a given time. */
export function positionForTime(anchor, horizon, time) {
  if (!anchor || !horizon || !Number.isFinite(time)) return 0;
  const span = horizon.time - anchor.time;
  if (!(span > 0)) return 0;
  return Math.min(1, Math.max(0, (time - anchor.time) / span));
}

/** The time the marker is over at a given position (0..1). */
export function positionTimeOf(anchor, horizon, position) {
  if (!anchor || !horizon) return null;
  const p = Math.min(1, Math.max(0, Number(position) || 0));
  return anchor.time + (horizon.time - anchor.time) * p;
}

/** The drawn entry nearest a time — what the readout names. */
export function nearestEntry(entries, time) {
  if (!Array.isArray(entries) || !entries.length || !Number.isFinite(time)) return null;
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (time <= first.time) return first;
  if (time >= last.time) return last;

  let lo = 0;
  let hi = entries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  const before = entries[lo - 1];
  const after = entries[lo];
  return time - before.time <= after.time - time ? before : after;
}

/**
 * The value the marker sits on at `time`, interpolated between the two drawn
 * points it falls between so the dot is always on the line.
 *
 * The one exception is a break in the drawn line: when the two bracketing
 * points belong to different runs of readings, there is no line between them to
 * sit on, so the dot rests on the nearer real point rather than floating across
 * blank space. The forecast is drawn continuously, so it always interpolates.
 */
export function valueAtTime(entries, time) {
  if (!Array.isArray(entries) || !entries.length || !Number.isFinite(time)) return null;
  const first = entries[0];
  const last = entries[entries.length - 1];
  if (time <= first.time) return first.value;
  if (time >= last.time) return last.value;

  let lo = 0;
  let hi = entries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (entries[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  const before = entries[lo - 1];
  const after = entries[lo];
  if (!before || !after) return before?.value ?? after?.value ?? null;

  const broken = before.kind === READING_KIND && after.kind === READING_KIND && before.run !== after.run;
  const gap = after.time - before.time;
  if (broken || !(gap > 0)) {
    return time - before.time <= after.time - time ? before.value : after.value;
  }
  const ratio = (time - before.time) / gap;
  return before.value + (after.value - before.value) * ratio;
}