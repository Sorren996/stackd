// Stackd Insight — Projection Overlay (Milestone 5)
//
// Renders the projected glucose trajectory as a restrained dashed line with a
// subtle uncertainty band, overlaid on the ActivityGraph's glucose row. The
// overlay is positioned inside the scrollable chart container so it scrolls and
// scales with the existing graph.
//
// DESIGN PRINCIPLES:
//   - Observed CGM readings remain the solid, prominent line.
//   - Projected values are a muted, dashed line — clearly not a reading.
//   - The uncertainty band is very subtle (7% opacity) — never looks like a
//     calibrated probability range unless the projection is empirically
//     calibrated.
//   - No confidence percentages, model versions, or parameter values are shown
//     to the user — just the visual trajectory.
//   - Tapping a point opens an editorial card: WHEN, WHAT, HOW SURE.
//   - Tap-hold-drag scrubs through every forecast point; keyboard arrows step
//     point by point; Escape dismisses.
//
// TWO RULES THIS FILE EXISTS TO ENFORCE:
//
//   1. A LABEL NEVER COMES FROM THE CLOCK. A forecast point is labelled from the
//      trajectory's own min_offset ("estimated in 20 min"), so it is always
//      +5, +10, +15 … A real reading is labelled from its own age against
//      server time ("now" under 90 seconds, otherwise "N min ago"). Wall-clock
//      rounding never produces "+1m", and a reading that has not posted cannot
//      appear as the anchor.
//
//   2. THE DASHED LINE IS ONLY THE FUTURE. It starts at the tip of the solid
//      line — the newest real reading — and every point before that reading is
//      dropped. The solid line is the record of what happened; a forecast never
//      draws over it and the card can never select a forecast point that has
//      since become a real reading.
//
// SAFETY: This is an informational wellness estimate, never a clinical
// prediction.

import { useMemo, useState, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import ProjectionTooltipCard, { projectionCardCopy } from "@/components/graph/ProjectionTooltipCard";
import { glucoseTrendWord } from "@/lib/glucoseTrend";
import { useServerNow } from "@/lib/serverClock";
import { BAR_HEIGHT } from "@/components/nav/navGeometry";

const MARGIN = 8;
const TOUCH_SLOP = 8; // px — horizontal movement that confirms a scrub
const HOLD_DELAY = 200; // ms — stationary hold before entering scrub mode
const HIT_BAND = 54; // px — total height of the hit path stroke (27px each side)
const CARD_GAP = 12; // px between the marker and the card
// The floating pill nav never gets a card on top of it.
const NAV_CLEARANCE = BAR_HEIGHT + 34;

function pointAgeSeconds(point, nowMs) {
  if (!Number.isFinite(point?.time) || !Number.isFinite(nowMs)) return null;
  return Math.max(0, Math.round((nowMs - point.time) / 1000));
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
  latestReading = null,
  readings = [],
}) {
  const [activePoint, setActivePoint] = useState(null);
  const [scrubbing, setScrubbing] = useState(false);
  const svgRef = useRef(null);
  const hitPathRef = useRef(null);
  const cardRef = useRef(null);
  // Gesture state machine: "idle" | "pending" | "scrubbing" | "cancelled"
  const gestureStateRef = useRef("idle");
  const scrubbingRef = useRef(false);
  const downPosRef = useRef({ x: 0, y: 0 });
  const pointerIdRef = useRef(null);
  const svgRectRef = useRef(null);
  const holdTimerRef = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false, flipped: false });
  const nowMs = useServerNow();

  // The newest real reading: the tip of the solid line, and the only place the
  // dashed line may start. Without one there is nothing to anchor to.
  const anchorReading = useMemo(() => {
    const time = new Date(latestReading?.time ?? latestReading?.recorded_at).getTime();
    const value = Number(latestReading?.value);
    if (!Number.isFinite(time) || !Number.isFinite(value)) return null;
    return { time, value };
  }, [latestReading]);

  const trendWord = useMemo(() => glucoseTrendWord(readings), [readings]);

  const points = useMemo(() => {
    if (!projection || !projection.trajectory || projection.abstained) return [];
    const forecast = projection.trajectory
      .map((p) => {
        const t = new Date(p.time).getTime();
        if (!Number.isFinite(t)) return null;
        const value = Number(p.value);
        if (!Number.isFinite(value)) return null;
        const minOffset = Number(p.min_offset);
        return {
          time: t,
          value,
          minOffset: Number.isFinite(minOffset) ? minOffset : null,
          lower: Number.isFinite(Number(p.lower)) ? Math.round(Number(p.lower)) : null,
          upper: Number.isFinite(Number(p.upper)) ? Math.round(Number(p.upper)) : null,
        };
      })
      .filter(Boolean)
      // Only the future: a point at or before the newest real reading is
      // already history and must never be drawn or selectable as a forecast.
      .filter((p) => (anchorReading ? p.time > anchorReading.time : true))
      .sort((a, b) => a.time - b.time);

    let lastOffset = 0;
    const plotted = [];
    if (anchorReading) {
      // Re-anchor: the dashed line begins at the reading's own value, so it
      // meets the tip of the solid line instead of floating beside it.
      plotted.push({
        time: anchorReading.time,
        value: anchorReading.value,
        minOffset: 0,
        lower: null,
        upper: null,
        kind: "reading",
      });
    }
    for (const point of forecast) {
      // Labels come from the trajectory's own spacing, never from the clock.
      const offset = point.minOffset != null
        ? point.minOffset
        : Math.round((point.time - anchorReading.time) / 60000);
      const stepped = Math.max(lastOffset + 1, Math.round(offset));
      lastOffset = stepped;
      plotted.push({ ...point, minOffset: stepped, kind: "forecast" });
    }

    return plotted.map((p) => {
      const x = ((p.time - domainStart) / totalMs) * chartWidth;
      return { ...p, x, y: getGlucoseY(p.value) };
    }).filter((p) => Number.isFinite(p.x) && p.x >= 0 && p.x <= chartWidth);
  }, [projection, domainStart, totalMs, chartWidth, getGlucoseY, anchorReading]);

  const forecastPoints = useMemo(() => points.filter((p) => p.kind === "forecast"), [points]);

  // Find the plotted point nearest to a chart-local x coordinate.
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
  // The hit path is a 54px-tall transparent stroke along the plotted line, so
  // only touches near it engage; everything else scrolls the dashboard.
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
    try {
      if (hitPathRef.current && pointerIdRef.current != null) {
        hitPathRef.current.setPointerCapture(pointerIdRef.current);
      }
    } catch {
      /* pointer capture not supported — events still fire on the hit path */
    }
    if (svgRectRef.current) {
      const localX = downPosRef.current.x - svgRectRef.current.left;
      const nearest = findNearestPointByX(localX);
      if (nearest) setActivePoint(nearest);
    }
  }, [findNearestPointByX]);

  const handlePointerDown = useCallback((e) => {
    if (!points.length || !e.isPrimary) return;
    gestureStateRef.current = "pending";
    downPosRef.current = { x: e.clientX, y: e.clientY };
    pointerIdRef.current = e.pointerId;
    if (svgRef.current) svgRectRef.current = svgRef.current.getBoundingClientRect();
    scrubbingRef.current = false;
    setScrubbing(false);
    clearHoldTimer();
    holdTimerRef.current = setTimeout(() => {
      if (gestureStateRef.current === "pending") enterScrubMode();
    }, HOLD_DELAY);
  }, [points, clearHoldTimer, enterScrubMode]);

  const handlePointerMove = useCallback((e) => {
    const state = gestureStateRef.current;
    if (state === "idle" || state === "cancelled") return;

    const dx = e.clientX - downPosRef.current.x;
    const dy = e.clientY - downPosRef.current.y;

    if (state === "pending") {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > TOUCH_SLOP) {
        clearHoldTimer();
        gestureStateRef.current = "cancelled";
        return;
      }
      if (Math.abs(dx) >= Math.abs(dy) && Math.abs(dx) > TOUCH_SLOP) {
        clearHoldTimer();
        enterScrubMode();
      }
      return;
    }

    if (svgRectRef.current) {
      const localX = e.clientX - svgRectRef.current.left;
      const nearest = findNearestPointByX(localX);
      if (nearest) setActivePoint(nearest);
    }
  }, [findNearestPointByX, clearHoldTimer, enterScrubMode]);

  const handlePointerUp = useCallback(() => {
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
      scrubbingRef.current = false;
      setScrubbing(false);
    } else if (state === "pending") {
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
  // Arrow keys step through every plotted point, starting at the newest
  // reading and moving forward through the forecast.
  const handleKeyDown = useCallback((e) => {
    if (!points.length) return;
    const currentIndex = activePoint
      ? points.findIndex((p) => p.x === activePoint.x && p.kind === activePoint.kind)
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

  // Non-passive touch listener — only locks down scrolling AFTER scrub mode is
  // confirmed, so a vertical swipe still scrolls the dashboard.
  useEffect(() => {
    const el = hitPathRef.current;
    if (!el) return;
    const onTouchMove = (e) => {
      if (gestureStateRef.current === "scrubbing") e.preventDefault();
    };
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", onTouchMove);
  }, [points]);

  // Resolve the card's position: above the selected point, flipped below when
  // it would cross the top of the plot, clamped inside the viewport on both
  // axes and never over the floating nav. The card sizes itself to its content,
  // so its real box is measured after paint.
  useLayoutEffect(() => {
    if (!activePoint || !svgRef.current) {
      setPos({ left: 0, top: 0, ready: false, flipped: false });
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const box = cardRef.current?.getBoundingClientRect();
    const width = box?.width || 180;
    const height = box?.height || 84;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const pointLeft = rect.left + activePoint.x;
    const pointTop = rect.top + activePoint.y;

    // Flip below the marker when the card would leave the plot's own top edge.
    const plotTop = rect.top;
    const wantsAbove = pointTop - CARD_GAP - height >= plotTop - MARGIN;
    const flipped = !wantsAbove;
    let top = flipped ? pointTop + CARD_GAP : pointTop - CARD_GAP - height;

    let left = pointLeft - width / 2;
    left = Math.max(MARGIN, Math.min(left, vw - width - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - NAV_CLEARANCE - height));

    setPos({ left, top, ready: true, flipped });
  }, [activePoint, nowMs]);

  // Dismiss on tap outside, scroll, Escape or resize.
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

  if (forecastPoints.length === 0) return null;

  // The selected point, carrying the facts its card needs.
  const selected = activePoint
    ? {
        ...activePoint,
        ageSeconds: activePoint.kind === "reading" ? pointAgeSeconds(activePoint, nowMs) : null,
        trendWord: activePoint.kind === "reading" ? trendWord : null,
      }
    : null;

  const selectedCopy = projectionCardCopy(selected);

  const ariaLabel = selectedCopy
    ? `Projected glucose ${selectedCopy.value}, ${selectedCopy.eyebrow}` +
      (selectedCopy.range ? `, ${selectedCopy.range}` : "") +
      `. Use arrow keys to step through the points.`
    : "Projected glucose trajectory. Press Enter to open, then use arrow keys to step through the points.";

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  // The uncertainty band covers the forecast only — it starts from the reading,
  // which has no uncertainty of its own.
  const bandPoints = points.filter((p) => p.kind === "forecast");
  const hasBand = bandPoints.length > 1 && bandPoints.every((p) => p.lower != null && p.upper != null);
  let bandPath = "";
  if (hasBand) {
    const first = { x: points[0].x, y: points[0].y };
    const upperOf = (p) => getGlucoseY(p.upper);
    const lowerOf = (p) => getGlucoseY(p.lower);
    const forward = bandPoints.map((p) => `L ${p.x.toFixed(1)} ${lowerOf(p).toFixed(1)}`).join(" ");
    const back = bandPoints
      .slice()
      .reverse()
      .map((p) => `L ${p.x.toFixed(1)} ${upperOf(p).toFixed(1)}`)
      .join(" ");
    bandPath = `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ${forward} ${back} Z`;
  }

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {selectedCopy
          ? `Projected glucose ${selectedCopy.value}, ${selectedCopy.eyebrow}` +
            (selectedCopy.range ? `, ${selectedCopy.range}` : "")
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
        {hasBand && <path d={bandPath} fill="#c4965a" fillOpacity={0.16} stroke="none" />}
        <path
          d={linePath}
          stroke="#c4965a"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeOpacity={0.85}
          fill="none"
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />
        {/* Active point marker — a soft halo under a small solid dot. */}
        {selected && (
          <>
            <circle
              cx={selected.x}
              cy={selected.y}
              r={9}
              fill="#af751b"
              fillOpacity={scrubbing ? 0.2 : 0.16}
              style={{ pointerEvents: "none" }}
            />
            <circle
              cx={selected.x}
              cy={selected.y}
              r={3.6}
              fill="#8C4A28"
              stroke="#fdf8f1"
              strokeWidth={1.4}
              style={{ pointerEvents: "none" }}
            />
          </>
        )}
        {/* Scrub hit path — a 54px-tall transparent stroke along the line. */}
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

      {selected && createPortal(
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: pos.flipped ? -4 : 4 }}
            animate={{ opacity: pos.ready ? 1 : 0, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: scrubbing ? 0 : 0.14 }}
            className="fixed z-[300] pointer-events-none"
            style={{ left: pos.left, top: pos.top }}
          >
            <div ref={cardRef}>
              <ProjectionTooltipCard point={selected} />
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}