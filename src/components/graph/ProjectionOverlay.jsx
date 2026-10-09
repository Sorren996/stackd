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
//   - Tapping a projected point shows its value and time in a small bubble
//     (Issue 3: tap-to-show-values for readability).
//
// SAFETY: This is an informational wellness estimate, never a clinical
// prediction. The dashed treatment and muted color ensure it never
// looks like a confirmed reading.

import { useMemo, useState, useCallback } from "react";

const MINUTE_MS = 60 * 1000;

function formatProjectionTime(time) {
  if (!Number.isFinite(time)) return "";
  const d = new Date(time);
  const now = new Date();
  const diffMin = Math.round((time - now.getTime()) / MINUTE_MS);
  if (diffMin <= 0) return "now";
  if (diffMin < 60) return `+${diffMin}m`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m ? `+${h}h ${m}m` : `+${h}h`;
}

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
  const [activePoint, setActivePoint] = useState(null);

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
          value: Math.round(value),
          upper: Number.isFinite(upper) ? Math.round(upper) : null,
          lower: Number.isFinite(lower) ? Math.round(lower) : null,
          time: t,
          minOffset: Number(p.min_offset) || 0,
        };
      })
      .filter(Boolean);
  }, [projection, domainStart, totalMs, chartWidth, getGlucoseY]);

  const handlePointTap = useCallback((point) => {
    setActivePoint((prev) =>
      prev && prev.x === point.x ? null : point
    );
  }, []);

  if (points.length < 2) return null;

  // Build the dashed mean line path.
  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // Build faint high (upper bound) and low (lower bound) line paths so the
  // range reads as lines, not only as a shaded fill. Amber for the high
  // line, sage for the low line — tuned to the app's muted palette and
  // fainter than the mean line so the mean stays visually dominant.
  const upperPoints = points.filter((p) => p.yUpper != null);
  const lowerPoints = points.filter((p) => p.yLower != null);
  const upperLinePath = upperPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.yUpper.toFixed(1)}`)
    .join(" ");
  const lowerLinePath = lowerPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.yLower.toFixed(1)}`)
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

  // Tooltip positioning — clamp within chart bounds.
  const tooltipW = 78;
  const tooltipH = 64;
  const tooltipX = activePoint
    ? Math.max(4, Math.min(chartWidth - tooltipW - 4, activePoint.x - tooltipW / 2))
    : 0;
  const tooltipY = activePoint
    ? Math.max(4, activePoint.y - tooltipH - 10)
    : 0;

  return (
    <>
      <svg
        className="absolute top-0 left-0"
        style={{ width: chartWidth, height: glucoseChartHeight, overflow: "visible" }}
        aria-hidden="true"
      >
        {hasBand && (
          <path d={bandPath} fill="#af751b" fillOpacity={0.07} stroke="none" />
        )}
        {/* Faint high (upper bound) line — muted amber, thinner than the mean */}
        {upperLinePath && (
          <path
            d={upperLinePath}
            stroke="#8a5a12"
            strokeWidth={1}
            strokeDasharray="3 3"
            strokeOpacity={0.42}
            fill="none"
            strokeLinecap="round"
            style={{ pointerEvents: "none" }}
          />
        )}
        {/* Faint low (lower bound) line — muted sage, thinner than the mean */}
        {lowerLinePath && (
          <path
            d={lowerLinePath}
            stroke="#4d5742"
            strokeWidth={1}
            strokeDasharray="3 3"
            strokeOpacity={0.42}
            fill="none"
            strokeLinecap="round"
            style={{ pointerEvents: "none" }}
          />
        )}
        {/* Mean projected trajectory — visually dominant */}
        <path
          d={linePath}
          stroke="#af751b"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeOpacity={0.5}
          fill="none"
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
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
          style={{ pointerEvents: "none" }}
        />
        {/* Active point marker */}
        {activePoint && (
          <circle
            cx={activePoint.x}
            cy={activePoint.y}
            r={4}
            fill="#af751b"
            fillOpacity={0.7}
            stroke="#fdf9f2"
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
        )}
        {/* Invisible hit circles at each trajectory point — tap to show value */}
        {points.map((p, i) => (
          <circle
            key={`hit-${i}`}
            cx={p.x}
            cy={p.y}
            r={12}
            fill="transparent"
            style={{ cursor: "pointer", touchAction: "manipulation" }}
            onClick={() => handlePointTap(p)}
          />
        ))}
      </svg>

      {/* Tooltip bubble — shows projected value and time offset */}
      {activePoint && (
        <div
          className="absolute z-10 pointer-events-none"
          style={{
            left: tooltipX,
            top: tooltipY,
            width: tooltipW,
          }}
        >
          <div
            className="rounded-[8px] px-2 py-1.5 text-center"
            style={{
              background: "#fdf9f2",
              border: "1px solid #eadccf",
              boxShadow: "0 4px 14px rgba(63,56,48,0.12)",
            }}
          >
            <div
              className="text-[9px] font-medium leading-tight"
              style={{ color: "#746959" }}
            >
              {formatProjectionTime(activePoint.time)}
            </div>
            {/* Mean estimate */}
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className="text-[9px] font-medium" style={{ color: "#746959" }}>Est.</span>
              <span className="text-[14px] font-semibold tabular-nums leading-tight" style={{ color: "#8a5a12" }}>
                {activePoint.value}
              </span>
            </div>
            {/* Highest estimated value (upper bound) — same trajectory point */}
            {activePoint.upper != null && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-medium" style={{ color: "#746959" }}>High</span>
                <span className="text-[11px] font-semibold tabular-nums leading-tight" style={{ color: "#8a5a12" }}>
                  ~{activePoint.upper}
                </span>
              </div>
            )}
            {/* Lowest estimated value (lower bound) — same trajectory point */}
            {activePoint.lower != null && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-medium" style={{ color: "#746959" }}>Low</span>
                <span className="text-[11px] font-semibold tabular-nums leading-tight" style={{ color: "#4d5742" }}>
                  ~{activePoint.lower}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}