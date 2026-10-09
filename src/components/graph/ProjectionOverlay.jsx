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
//   - Tap-hold-drag scrubs through every forecast point; the popup updates
//     continuously with projected values only and freezes on release.
//   - Keyboard: arrow keys step through each forecast point; Escape dismisses.
//
// SAFETY: This is an informational wellness estimate, never a clinical
// prediction. The dashed treatment and muted color ensure it never
// looks like a confirmed reading.

import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

const MINUTE_MS = 60 * 1000;
const MARGIN = 8;
const TOUCH_SLOP = 8; // px — movement below this is a tap, above is a scrub

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
  const [scrubbing, setScrubbing] = useState(false);
  const svgRef = useRef(null);
  const pointerDownRef = useRef(false);
  const scrubbingRef = useRef(false);
  const downPosRef = useRef({ x: 0, y: 0 });
  const svgRectRef = useRef(null);
  const rectRef = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });

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

  // Find the trajectory point nearest to a chart-local x coordinate.
  // Points are sorted by x (time increases → x increases), so a binary
  // search converges quickly. Clamps to the first/last point outside the range.
  const findNearestPointByX = useCallback((localX) => {
    if (!points.length) return null;
    if (localX <= points[0].x) return points[0];
    const last = points[points.length - 1];
    if (localX >= last.x) return last;
    let lo = 0;
    let hi = points.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].x < localX) lo = mid + 1;
      else hi = mid;
    }
    const a = points[lo - 1];
    const b = points[lo];
    return Math.abs(localX - a.x) <= Math.abs(localX - b.x) ? a : b;
  }, [points]);

  // ── Pointer handlers: tap + hold-drag scrub ──────────────────────────
  // Quick tap (no movement beyond TOUCH_SLOP) toggles the popup at the
  // nearest point — same as the previous click behavior. Once the finger
  // moves past TOUCH_SLOP, we enter scrub mode: the popup tracks the
  // nearest forecast point to the finger's x-position, showing projected
  // values only. On release, the popup freezes at the last position.
  const handlePointerDown = useCallback((e) => {
    if (!points.length || !e.isPrimary) return;
    pointerDownRef.current = true;
    scrubbingRef.current = false;
    setScrubbing(false);
    downPosRef.current = { x: e.clientX, y: e.clientY };
    if (svgRef.current) svgRectRef.current = svgRef.current.getBoundingClientRect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture not supported — events still fire on the rect */
    }
  }, [points]);

  const handlePointerMove = useCallback((e) => {
    if (!pointerDownRef.current) return;
    const dx = e.clientX - downPosRef.current.x;
    const dy = e.clientY - downPosRef.current.y;
    const dist = Math.hypot(dx, dy);

    // Enter scrub mode once the finger exceeds the touch-slop threshold.
    if (!scrubbingRef.current && dist > TOUCH_SLOP) {
      scrubbingRef.current = true;
      setScrubbing(true);
    }

    if (scrubbingRef.current && svgRectRef.current) {
      const localX = e.clientX - svgRectRef.current.left;
      const nearest = findNearestPointByX(localX);
      if (nearest) setActivePoint(nearest);
    }
  }, [findNearestPointByX]);

  const handlePointerUp = useCallback((e) => {
    if (!pointerDownRef.current) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released or not captured */
    }

    if (scrubbingRef.current) {
      // Scrub ended — freeze at the current position (do not close).
      scrubbingRef.current = false;
      setScrubbing(false);
    } else {
      // Tap — toggle the popup at the nearest point to the touch position.
      if (svgRectRef.current) {
        const localX = downPosRef.current.x - svgRectRef.current.left;
        const nearest = findNearestPointByX(localX);
        if (nearest) {
          setActivePoint((prev) =>
            prev && prev.x === nearest.x && prev.minOffset === nearest.minOffset ? null : nearest
          );
        }
      }
    }
    pointerDownRef.current = false;
  }, [findNearestPointByX]);

  const handlePointerCancel = useCallback(() => {
    pointerDownRef.current = false;
    if (scrubbingRef.current) {
      scrubbingRef.current = false;
      setScrubbing(false);
    }
  }, []);

  // ── Keyboard accessibility ───────────────────────────────────────────
  // Arrow keys step through each forecast point individually so keyboard
  // and screen-reader users can inspect every estimated value. Escape
  // dismisses. Enter/Space toggles the popup at the first point.
  const handleKeyDown = useCallback((e) => {
    if (!points.length) return;
    const currentIndex = activePoint
      ? points.findIndex((p) => p.minOffset === activePoint.minOffset)
      : -1;

    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp": {
        e.preventDefault();
        const next = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, points.length - 1);
        setActivePoint(points[next]);
        break;
      }
      case "ArrowLeft":
      case "ArrowDown": {
        e.preventDefault();
        const prev = currentIndex < 0 ? points.length - 1 : Math.max(currentIndex - 1, 0);
        setActivePoint(points[prev]);
        break;
      }
      case "Escape": {
        e.preventDefault();
        setActivePoint(null);
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        setActivePoint((prev) => (prev ? null : points[0]));
        break;
      }
      default:
        break;
    }
  }, [points, activePoint]);

  // Native touch listener (non-passive) — prevents iOS Safari from hijacking
  // the horizontal drag for page/scroll-container scrolling while the finger
  // is down on the scrub surface. Pointer events handle the actual scrub
  // logic; this just claims the gesture so move events keep firing.
  useEffect(() => {
    const el = rectRef.current;
    if (!el) return;
    const onTouchMove = (e) => {
      if (pointerDownRef.current) e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [points]);

  // Tooltip dimensions and local (chart-relative) position.
  const tooltipW = 78;
  const tooltipH = 64;
  const tooltipX = activePoint
    ? Math.max(4, Math.min(chartWidth - tooltipW - 4, activePoint.x - tooltipW / 2))
    : 0;
  const tooltipY = activePoint
    ? Math.max(4, activePoint.y - tooltipH - 10)
    : 0;

  // Convert chart-local coordinates to viewport coordinates via the SVG's
  // bounding rect, then clamp within the viewport. Runs in useLayoutEffect
  // so the tooltip never flashes at a stale position.
  useLayoutEffect(() => {
    if (!activePoint || !svgRef.current) {
      setPos({ left: 0, top: 0, ready: false });
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = rect.left + tooltipX;
    let top = rect.top + tooltipY;
    left = Math.max(MARGIN, Math.min(left, vw - tooltipW - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - tooltipH - MARGIN));
    setPos({ left, top, ready: true });
  }, [activePoint, tooltipX, tooltipY, tooltipW, tooltipH]);

  // Dismiss the tooltip on outside tap, any scroll, Escape, or resize.
  // The scrub surface is marked with data-projection-scrub so taps on the
  // projection don't close the popup (they start a new tap/scrub instead).
  useEffect(() => {
    if (!activePoint) return;
    const onDown = (e) => {
      if (e.target?.closest?.("[data-projection-scrub]")) return;
      setActivePoint(null);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") setActivePoint(null);
    };
    const onScroll = () => setActivePoint(null);
    const onResize = () => setActivePoint(null);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown, { passive: true });
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [activePoint]);

  if (points.length < 2) return null;

  // Accessible label for the SVG — describes the projection and current point.
  const ariaLabel = activePoint
    ? `Projected glucose ${activePoint.value} at ${formatProjectionTime(activePoint.time)}` +
      (activePoint.upper != null ? `, high estimate ${activePoint.upper}` : "") +
      (activePoint.lower != null ? `, low estimate ${activePoint.lower}` : "") +
      `. Use arrow keys to step through forecast points.`
    : "Projected glucose trajectory. Press Enter to open, then use arrow keys to step through forecast points.";

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

  return (
    <>
      {/* Screen-reader live region — announces the current forecast point */}
      <div className="sr-only" aria-live="polite">
        {activePoint
          ? `Projected glucose ${activePoint.value} at ${formatProjectionTime(activePoint.time)}`
          : ""}
      </div>
      <svg
        ref={svgRef}
        className="absolute top-0 left-0"
        style={{ width: chartWidth, height: glucoseChartHeight, overflow: "visible", outline: "none" }}
        tabIndex={0}
        role="button"
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
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
        {/* Active point marker — tracks the current scrub/keyboard position.
            Slightly larger and more opaque during scrub for emphasis. */}
        {activePoint && (
          <circle
            cx={activePoint.x}
            cy={activePoint.y}
            r={scrubbing ? 5 : 4}
            fill="#af751b"
            fillOpacity={scrubbing ? 0.85 : 0.7}
            stroke="#fdf9f2"
            strokeWidth={1.5}
            style={{ pointerEvents: "none" }}
          />
        )}
        {/* Scrub surface — transparent rect over the projection's x-range.
            Handles tap (toggle popup) and hold-drag (scrub through forecast
            points). data-projection-scrub marks it so the dismiss handler
            skips taps that land on the projection. touch-action: pan-y lets
            vertical page-scroll pass through while claiming horizontal drags
            for scrubbing, so the chart's horizontal pan is not stolen. */}
        <rect
          ref={rectRef}
          data-projection-scrub
          x={points[0].x}
          y={0}
          width={Math.max(1, points[points.length - 1].x - points[0].x)}
          height={glucoseChartHeight}
          fill="transparent"
          style={{ cursor: "pointer", touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
      </svg>

      {/* Tooltip bubble — portaled to document.body so it floats above all
          graph layers (insulin row, legend, glucose ticker). Closes on
          outside tap, scroll, Escape, or resize. */}
      {activePoint && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: pos.ready ? 1 : 0, y: pos.ready ? 0 : 6, scale: pos.ready ? 1 : 0.96 }}
            transition={{ duration: scrubbing ? 0 : 0.14 }}
            className="fixed z-[300] pointer-events-none"
            style={{
              left: pos.left,
              top: pos.top,
              width: tooltipW,
            }}
          >
            <div
              className="rounded-[8px] px-2 py-1.5 text-center"
              style={{
                background: "#fdf9f2",
                border: "1px solid #eadccf",
                boxShadow: "0 8px 28px rgba(63,56,48,0.16), 0 2px 8px rgba(63,56,48,0.08)",
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
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}