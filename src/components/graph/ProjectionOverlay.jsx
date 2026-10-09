// Stackd Insight — Projection Overlay (Milestone 5)
//
// Renders the projected glucose trajectory as a restrained dashed line
// with a subtle uncertainty band, overlaid on the ActivityGraph's glucose
// row. The overlay is positioned inside the scrollable chart container so
// it scrolls and scales with the existing graph.
//
// DESIGN PRINCIPLES:
//   - Observed CGM readings remain the solid, prominent line.
//   - Projected values are a muted, dashed line — clearly not a reading.
//   - The uncertainty band is very subtle (7% opacity) — never looks like
//     a calibrated probability range unless the projection is empirically
//     calibrated.
//   - No confidence percentages, model versions, or parameter values
//     are shown to the user — just the visual trajectory.
//   - The "now" reference line already separates observed from projected.
//
// SAFETY: This is an informational wellness estimate, never a clinical
// prediction. The dashed treatment and muted color ensure it never
// looks like a confirmed reading.

import { useMemo } from "react";

const MINUTE_MS = 60 * 1000;

export default function ProjectionOverlay({
  projection,
  domainStart,
  totalMs,
  chartWidth,
  glucoseChartHeight,
  glucoseMarginTop,
  plotHeight,
  effectiveMin,
  effectiveMax,
  getGlucoseY,
}) {
  const points = useMemo(() => {
    if (!projection || !projection.trajectory || projection.abstained) return [];
    return projection.trajectory
      .map((p) => {
        const t = new Date(p.time).getTime();
        if (!Number.isFinite(t)) return null;
        const x = ((t - domainStart) / totalMs) * chartWidth;
        if (x < 0 || x > chartWidth) return null;
        const value = Number(p.value);
        const lower = Number(p.lower);
        const upper = Number(p.upper);
        if (!Number.isFinite(value)) return null;
        return {
          x,
          y: getGlucoseY(value),
          yLower: Number.isFinite(lower) ? getGlucoseY(lower) : null,
          yUpper: Number.isFinite(upper) ? getGlucoseY(upper) : null,
        };
      })
      .filter(Boolean);
  }, [projection, domainStart, totalMs, chartWidth, getGlucoseY]);

  if (points.length < 2) return null;

  // Build the dashed line path.
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // Build the uncertainty band path (lower edge L→R, upper edge R→L).
  const hasBand = points.every((p) => p.yLower != null && p.yUpper != null);
  let bandPath = "";
  if (hasBand) {
    const lower = points.map((p) => `L ${p.x.toFixed(1)} ${p.yLower.toFixed(1)}`).join(" ");
    const upper = points
      .slice()
      .reverse()
      .map((p) => `L ${p.x.toFixed(1)} ${p.yUpper.toFixed(1)}`)
      .join(" ");
    bandPath = `M ${points[0].x.toFixed(1)} ${points[0].yLower.toFixed(1)} ${lower.slice(1)} L ${points[points.length - 1].x.toFixed(1)} ${points[points.length - 1].yUpper.toFixed(1)} ${upper.slice(1)} Z`;
  }

  return (
    <svg
      className="pointer-events-none absolute top-0 left-0"
      style={{ width: chartWidth, height: glucoseChartHeight, overflow: "visible" }}
      aria-hidden="true"
    >
      {hasBand && (
        <path d={bandPath} fill="#af751b" fillOpacity={0.07} stroke="none" />
      )}
      <path
        d={linePath}
        stroke="#af751b"
        strokeWidth={1.5}
        strokeDasharray="5 4"
        strokeOpacity={0.45}
        fill="none"
        strokeLinecap="round"
      />
      {/* Anchor dot — connects the projection to the last actual reading */}
      <circle
        cx={points[0].x}
        cy={points[0].y}
        r={3}
        fill="#af751b"
        fillOpacity={0.3}
        stroke="#af751b"
        strokeWidth={1}
        strokeOpacity={0.4}
      />
    </svg>
  );
}