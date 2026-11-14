// Shape-preserving (monotone) smoothing for a real sample series.
//
// A monotone cubic through the actual samples:
//  - passes exactly through every sample value, so no reading is moved
//  - never overshoots a local extreme, so the curve cannot invent a peak,
//    dip or measurement that was never recorded
//
// Pure function, no React — directly testable.

const finite = (value) => Number.isFinite(value);

function monotoneXTangents(pts) {
  const dx = [], slope = [];
  for (let i = 0; i < pts.length - 1; i++) {
    dx[i] = pts[i + 1].x - pts[i].x;
    slope[i] = dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i];
  }
  const tangents = new Array(pts.length).fill(0);
  tangents[0] = slope[0] || 0;
  tangents[pts.length - 1] = slope[slope.length - 1] || 0;
  for (let i = 1; i < pts.length - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) continue;
    const w1 = 2 * dx[i] + dx[i - 1];
    const w2 = dx[i] + 2 * dx[i - 1];
    tangents[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  }
  return tangents;
}

// Evaluate the exact cubic used by monotoneXPath, not a straight chord.
export function monotoneXValue(points, x) {
  if (!points.length) return null;
  if (x <= points[0].x) return points[0].y;
  if (x >= points[points.length - 1].x) return points[points.length - 1].y;
  const tangents = monotoneXTangents(points);
  const i = points.findIndex((p, index) => index < points.length - 1 && x <= points[index + 1].x);
  const a = points[i], b = points[i + 1];
  const width = b.x - a.x;
  const t = (x - a.x) / width, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a.y + (t3 - 2 * t2 + t) * width * tangents[i]
    + (-2 * t3 + 3 * t2) * b.y + (t3 - t2) * width * tangents[i + 1];
}

/**
 * Build an SVG path that runs smoothly through every point, in order.
 *
 * @param {Array<{x:number,y:number}>} points — ascending by x
 * @returns {string} an SVG path ("M" + one cubic "C" per interval)
 */
export function monotoneXPath(points) {
  const pts = (Array.isArray(points) ? points : [])
    .filter((point) => point && finite(Number(point.x)) && finite(Number(point.y)))
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }));

  if (!pts.length) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

  const count = pts.length;
  const tangents = monotoneXTangents(pts);
  let path = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 0; i < count - 1; i += 1) {
    const width = pts[i + 1].x - pts[i].x || 1e-6;
    const c1x = pts[i].x + width / 3;
    const c1y = pts[i].y + (tangents[i] * width) / 3;
    const c2x = pts[i + 1].x - width / 3;
    const c2y = pts[i + 1].y - (tangents[i + 1] * width) / 3;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }

  return path;
}