// Which day bars get a printed date under them.
//
// The chart must never let two date labels touch: each label is now two lines
// (month abbreviation over day number), so the safe centre-to-centre distance
// is one label's width plus breathing room. At the narrowest supported width
// (320px) the plotting strip is ~254px wide, and a two-line label is ~20px, so
// ticks need at least ~28px between centres.
//
// The period always keeps its real first and last day labelled, and thins the
// middle out as the period grows. A seven-day period labels every day.

export const MIN_LABEL_GAP_PX = 28;

/** Evenly spread tick indices for `dayCount` days, always including both ends. */
export function axisTickIndices(dayCount) {
  const n = Math.max(1, Math.floor(Number(dayCount) || 0));
  if (n <= 7) return Array.from({ length: n }, (_, i) => i);

  const maxLabels = 6;
  const stride = Math.ceil((n - 1) / (maxLabels - 1));
  const last = n - 1;
  const out = [];
  for (let i = 0; i < last; i += stride) out.push(i);

  // The final day is always labelled; drop the tick before it when the two
  // would sit closer than they can be read.
  if (out.length && last - out[out.length - 1] < Math.max(2, Math.round(stride * 0.6))) {
    out.pop();
  }
  out.push(last);
  return out;
}

/** Narrowest centre-to-centre distance between printed ticks, in pixels. */
export function smallestLabelGapPx(indices, dayCount, plotWidthPx) {
  const n = Math.max(1, Math.floor(Number(dayCount) || 0));
  const slot = Number(plotWidthPx) / n;
  const list = Array.isArray(indices) ? indices : [];
  let smallest = Infinity;
  for (let i = 1; i < list.length; i += 1) {
    smallest = Math.min(smallest, (list[i] - list[i - 1]) * slot);
  }
  return smallest;
}