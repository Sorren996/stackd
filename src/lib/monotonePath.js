// Shape-preserving (monotone) smoothing for a real sample series.
//
// A monotone cubic through the actual samples:
//  - passes exactly through every sample value, so no reading is moved
//  - never overshoots a local extreme, so the curve cannot invent a peak,
//    dip or measurement that was never recorded
//
// Pure function, no React — directly testable.

const finite = (value) => Number.isFinite(value);

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
  const dx = [];
  const slope = [];

  for (let i = 0; i < count - 1; i += 1) {
    dx[i] = pts[i + 1].x - pts[i].x;
    slope[i] = dx[i] === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx[i];
  }

  // Fritsch–Carlson tangents, the same shape-preserving construction d3's
  // curveMonotoneX uses (and therefore the same one recharts draws).
  const tangents = new Array(count).fill(0);
  tangents[0] = slope[0];
  tangents[count - 1] = slope[count - 2];

  for (let i = 1; i < count - 1; i += 1) {
    if (slope[i - 1] * slope[i] <= 0) {
      tangents[i] = 0;
      continue;
    }
    const w1 = 2 * dx[i] + dx[i - 1];
    const w2 = dx[i] + 2 * dx[i - 1];
    tangents[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  }

  let path = `M ${pts[0].x} ${pts[0].y}`;

  for (let i = 0; i < count - 1; i += 1) {
    const width = dx[i] === 0 ? 1e-6 : dx[i];
    const c1x = pts[i].x + width / 3;
    const c1y = pts[i].y + (tangents[i] * width) / 3;
    const c2x = pts[i + 1].x - width / 3;
    const c2y = pts[i + 1].y - (tangents[i + 1] * width) / 3;
    path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${pts[i + 1].x} ${pts[i + 1].y}`;
  }

  return path;
}