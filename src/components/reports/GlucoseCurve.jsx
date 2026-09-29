import { useMemo } from "react";

// Lightweight SVG glucose curve used across the reports. Each series point is
// { min, value } at 5-min intervals (or a partial day). Renders the band
// background for low/range/high, a smooth polyline, and self-drawn markers.
// Uses the app's sage-led palette, not clinical colors. Bands are computed in
// mg/dL internally; tick labels are converted to display units by callers.

export function normX(index, count) {
  if (count <= 1) return count ? 0.5 : 0;
  return index / (count - 1);
}

export default function GlucoseCurve({
  series,
  height = 120,
  targetLow = 70,
  targetHigh = 180,
  stroke = "#3f3830",
  strokeWidth = 2,
  showBands = true,
  lineDots = false,
  markers = [], // [{ x: 0..1, kind: 'carb'|'dose'|'low'|'high' }]
  className = "",
}) {
  const viewBoxWidth = 320;
  const padY = 5;

  const view = useMemo(() => {
    const values = (series || []).filter((p) => typeof p?.value === "number" && Number.isFinite(p.value));
    if (values.length === 0) return null;
    const rawMin = Math.min(...values.map((p) => p.value), targetLow);
    const rawMax = Math.max(...values.map((p) => p.value), targetHigh);
    const yMax = Math.max(rawMax + 12, targetHigh + 22);
    const yMin = Math.max(0, rawMin - 14);
    const yy = (v) => padY + ((yMax - v) / (yMax - yMin)) * (height - padY * 2);
    const band = (v) => yy(Math.max(v, yMin - 2));
    return {
      values,
      yMax,
      yMin,
      yy,
      rangeTop: band(targetLow),
      rangeBottom: band(targetHigh),
      lowBottom: band(1),
      points: values.map((p, i) => `${(normX(i, values.length) * viewBoxWidth).toFixed(1)},${yy(p.value).toFixed(1)}`).join(" "),
      dots: values.map((p, i) => ({ x: normX(i, values.length), y: yy(p.value) })),
    };
  }, [series, height, targetLow, targetHigh]);

  if (!view) return null;

  return (
    <svg
      viewBox={`0 0 ${viewBoxWidth} ${height}`}
      preserveAspectRatio="none"
      className={className}
      width="100%"
      height={height}
    >
      {showBands && (
        <g>
          <rect x={0} y={0} width={viewBoxWidth} height={Math.max(0, view.rangeTop)} fill="#8a5a12" opacity={0.12} />
          <rect x={0} y={view.rangeTop} width={viewBoxWidth} height={Math.max(0, view.rangeBottom - view.rangeTop)} fill="#5b6550" opacity={0.10} />
          <rect x={0} y={view.lowBottom} width={viewBoxWidth} height={Math.max(0, height - view.lowBottom)} fill="#9c3f2e" opacity={0.12} />
        </g>
      )}

      <polyline
        points={view.points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />

      {lineDots &&
        view.dots.map((d, i) => (
          <circle key={i} cx={d.x * viewBoxWidth} cy={d.y} r={1.6} fill={stroke} />
        ))}

      {markers.map((m, i) => {
        const cx = m.x * viewBoxWidth;
        const cy = m.kind === "low" ? view.lowBottom : m.kind === "high" ? view.rangeTop * 0.5 : height - 5;
        const fill = m.kind === "carb" ? "#8a5a12" : m.kind === "dose" ? "#3f3830" : m.kind === "low" ? "#9c3f2e" : "#8a5a12";
        return (
          <g key={i}>
            <line x1={cx} y1={height - 2} x2={cx} y2={height - 11} stroke={fill} strokeWidth={1.5} />
            <circle cx={cx} cy={height - 4} r={3} fill={fill} stroke="#fdf9f2" strokeWidth={1} />
          </g>
        );
      })}
    </svg>
  );
}