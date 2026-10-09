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
const TOUCH_SLOP = 8; // px — horizontal movement that confirms a scrub
const HOLD_DELAY = 200; // ms — stationary hold before entering scrub mode
const HIT_BAND = 54; // px — total height of the hit path stroke (27px each side of the line)

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
  const hitPathRef = useRef(null);
  // Gesture state machine: "idle" | "pending" | "scrubbing" | "cancelled"
  const gestureStateRef = useRef("idle");
  const scrubbingRef = useRef(false);
  const downPosRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef(null);
  const svgRectRef = useRef(null);
  const holdTimerRef = useRef(null);
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

  // ── Gesture disambiguation: tap / hold / scrub / scroll ─────────────
  // The hit path is a 54px-tall transparent stroke along the projected line,
  // so only touches within ~27px of the line engage scrub logic; everything
  // else passes through to normal chart scrolling.
  //
  // State machine:
  //   idle      — no touch active.
  //   pending   — touch-down on the line; waiting for hold timer or movement
  //               to disambiguate. No pointer capture, no preventDefault —
  //               the browser may still scroll the dashboard vertically.
  //   scrubbing — hold timer fired OR horizontal movement confirmed; pointer
  //               captured, touchmove preventDefaulted, popup tracks finger.
  //   cancelled — vertical movement detected first; release the gesture so
  //               the browser scrolls the dashboard normally.
  //
  // Quick tap (pointer-up from pending with minimal movement) toggles the
  // popup at the nearest forecast point — unchanged from before.

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const enterScrubMode = useCallback(() => {
    if (gestureStateRef.current !== "pending") return;
    gestureStateRef.current = "scrubbing";
    scrubbingRef.current = true;
    setScrubbing(true);
    // Capture the pointer so horizontal movement anywhere continues scrubbing.
    try {
      if (hitPathRef.current && pointerIdRef.current != null) {
        hitPathRef.current.setPointerCapture(pointerIdRef.current);
      }
    } catch {
      /* pointer capture not supported — events still fire on the hit path */
    }
    // Snap the popup to the nearest point at the down position.
    if (svgRectRef.current) {
      const localX = downPosRef.current.x - svgRectRef.current.left;
      const nearest = findNearestPointByX(localX);
      if (nearest) setActivePoint(nearest);
    }
  }, [findNearestPointByX]);

  const handlePointerDown = useCallback((e) => {
    if (!points.length || !e.isPrimary) return;
    // The hit path already filters touches to within ~27px of the line.
    // Start in pending state — do NOT capture or preventDefault yet, so
    // the browser can still scroll the dashboard if the finger moves vertically.
    gestureStateRef.current = "pending";
    downPosRef.current = { x: e.clientX, y: e.clientY };
    pointerIdRef.current = e.pointerId;
    if (svgRef.current) svgRectRef.current = svgRef.current.getBoundingClientRect();
    scrubbingRef.current = false;
    setScrubbing(false);
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      // Finger stayed put for the hold delay → enter scrub mode.
      if (gestureStateRef.current === "pending") enterScrubMode();
    }, HOLD_DELAY);
  }, [points, clearHoldTimer, enterScrubMode]);

  const handlePointerMove = useCallback((e) => {
    const state = gestureStateRef.current;
    if (state === "idle" || state === "cancelled") return;

    const dx = e.clientX - downPosRef.current.x;
    const dy = e.clientY - downPosRef.current.y;

    if (state === "pending") {
      // Disambiguate direction before claiming the gesture.
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > TOUCH_SLOP) {
        // Vertical movement first → let the browser scroll the dashboard.
        clearHoldTimer();
        gestureStateRef.current = "cancelled";
        return;
      }
      if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > TOUCH_SLOP) {
        // Horizontal movement → enter scrub mode.
        clearHoldTimer();
        enterScrubMode();
      }
      // Movement below slop — stay pending (hold timer may still fire).
      return;
    }

    // Scrubbing — track the nearest forecast point.
    if (svgRectRef.current) {
      const localX = e.clientX - svgRectRef.current.left;
      const nearest = findNearestPointByX(localX);
      if (nearest) setActivePoint(nearest);
    }
  }, [findNearestPointByX, clearHoldTimer, enterScrubMode]);

  const handlePointerUp = useCallback((e) => {
    clearHoldTimer();
    try {
      if (hitPathRef.current && pointerIdRef.current != null) {
        hitPathRef.current.releasePointerCapture(pointerIdRef.current);
      }
    } catch {
      /* already released or not captured */
    }

    const state = gestureStateRef.current;
    gestureStateRef.current = "idle";
    pointerIdRef.current = null;

    if (state === "scrubbing") {
      // Scrub ended — freeze the popup at the last position (do not close).
      scrubbingRef.current = false;
      setScrubbing(false);
    } else if (state === "pending") {
      // Quick tap — toggle the popup at the nearest point.
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
    // "cancelled" → browser handled the scroll; nothing to do.
  }, [findNearestPointByX, clearHoldTimer]);

  const handlePointerCancel = useCallback(() => {
    clearHoldTimer();
    gestureStateRef.current = "idle";
    pointerIdRef.current = null;
    if (scrubbingRef.current) {
      scrubbingRef.current = false;
      setScrubbing(false);
    }
  }, [clearHoldTimer]);

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

  // Native touch listener (non-passive) — only locks down scrolling AFTER
  // scrub mode is confirmed. In the pending state the browser is free to
  // scroll the dashboard vertically, so swipes over the projection region
  // that start as vertical movement pass through naturally.
  useEffect(() => {
    const el = hitPathRef.current;
    if (!el) return;
    const onTouchMove = (e) => {
      if (gestureStateRef.current === "scrubbing") e.preventDefault();
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
        {/* Scrub hit path — a 54px-tall transparent stroke along the projected
            line. Only touches within ~27px of the line engage scrub logic;
            touches outside this band pass through to normal chart scrolling.
            touch-action: pan-y lets vertical dashboard scrolling pass through
            while the gesture is still pending; the native touchmove listener
            locks it down (preventDefault) only after scrub mode is confirmed. */}
        <path
          ref={hitPathRef}
          data-projection-scrub
          d={linePath}
          fill="none"
          stroke="#af751b"
          strokeOpacity={0.001}
          strokeWidth={HIT_BAND}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ cursor: "pointer", touchAction: "pan-y", pointerEvents: "stroke" }}
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