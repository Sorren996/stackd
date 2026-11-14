// Stackd Insight — Projection Overlay (Milestone 5)
//
// Renders the projected glucose trajectory as a restrained dashed line with a
// subtle uncertainty band, overlaid on the ActivityGraph's glucose row. The
// overlay is positioned inside the scrollable chart container so it scrolls and
// scales with the existing graph.
//
// DESIGN PRINCIPLES:
//   - Observed CGM readings remain the solid, prominent line.
//   - Projected values are a muted, dashed amber line (#AF751B, 5 5, 2px, round
//     caps) drawn with the same shape-preserving smoothing as the measured
//     line — never a chain of straight segments.
//   - The uncertainty band is #AF751B at 10% opacity, no stroke, also smoothed.
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
import ProjectionTooltipCard, {
  projectionCardCopy,
  CARD_WIDTH_PX,
  CARD_HEIGHT_PX,
} from "@/components/graph/ProjectionTooltipCard";
import { useServerNow } from "@/lib/serverClock";
import { onGlucoseUnitsChange } from "@/lib/glucoseUnits";
import { monotoneXPath } from "@/lib/monotonePath";
import { resolveScrubPoint, resolveCardFlip } from "@/lib/projection/projectionScrub";
import { BAR_HEIGHT } from "@/components/nav/navGeometry";

const MARGIN = 8;
const TOUCH_SLOP = 8; // px — horizontal movement that confirms a scrub
const HOLD_DELAY = 200; // ms — stationary hold before entering scrub mode
const HIT_BAND = 54; // px — total height of the hit path stroke (27px each side)
const CARD_GAP = 12; // px between the marker and the card
// The floating pill nav never gets a card on top of it.
const NAV_CLEARANCE = BAR_HEIGHT + 34;
// Scroll and resize dismissal stay quiet for a moment after a gesture, so the
// tail of a scrub cannot blink the card away.
const DISMISS_GRACE_MS = 350;

// The visible plot box: the horizontally scrollable window the chart is seen
// through. The card is clamped to this rather than to the whole viewport, so it
// can never drift outside the plot.
function plotBoxFor(el) {
  let node = el?.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX) && node.clientWidth > 0) {
      return node.getBoundingClientRect();
    }
    node = node.parentElement;
  }
  return null;
}

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
  // A forecast point is described by the estimate strip above the chart, so it
  // is reported to the parent instead of opening the cream card. A real reading
  // still opens the card: it is a measurement, not an estimate.
  onForecastSelect = null,
  // Bumped by the Now button, which returns to the newest reading and fades the
  // strip out by releasing the scrub.
  resetSignal = 0,
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
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false, flipped: false });
  const nowMs = useServerNow();
  // The card prints glucose in the reader's chosen unit, so a change of that
  // setting must repaint it at once rather than at the next clock tick.
  const [, setUnitsTick] = useState(0);
  useEffect(() => onGlucoseUnitsChange(() => setUnitsTick((t) => t + 1)), []);

  // The one resolved selection, readable synchronously by the per-frame scrub
  // resolver, so a frame can tell whether the point actually changed.
  const activePointRef = useRef(null);
  const select = useCallback((next) => {
    if (activePointRef.current === next) return;
    activePointRef.current = next;
    setActivePoint(next);
  }, []);

  // One report per selection change, never per frame. The parent draws the
  // estimate strip from this; null clears it and the strip fades itself out.
  useEffect(() => {
    if (!onForecastSelect) return;
    onForecastSelect(activePoint && activePoint.kind === "forecast" ? activePoint : null);
  }, [activePoint, onForecastSelect]);

  // The Now button releases the scrub, so the marker returns to the newest
  // reading and the strip fades away with it.
  const lastResetRef = useRef(resetSignal);
  useEffect(() => {
    if (resetSignal === lastResetRef.current) return;
    lastResetRef.current = resetSignal;
    select(null);
  }, [resetSignal, select]);

  // Latest pointer x and the pending frame: pointermove records only the x, and
  // the snap is resolved once per animation frame.
  const pointerXRef = useRef(null);
  const frameRef = useRef(null);
  // The points this gesture started against. A reading that arrives mid-gesture
  // must not re-clamp the selection under the finger.
  const gesturePointsRef = useRef(null);
  // Scroll and resize dismissal are held off during a gesture and just after it.
  const dismissSuppressUntilRef = useRef(0);
  // The current flip, kept so the deadband has something to compare against.
  const flippedRef = useRef(false);

  // The newest real reading: the tip of the solid line, and the only place the
  // dashed line may start. Without one there is nothing to anchor to.
  const anchorReading = useMemo(() => {
    const time = new Date(latestReading?.time ?? latestReading?.recorded_at).getTime();
    const value = Number(latestReading?.value);
    if (!Number.isFinite(time) || !Number.isFinite(value)) return null;
    return { time, value };
  }, [latestReading]);

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

  // The plotted points, readable from a frame callback without re-creating it.
  const pointsRef = useRef(points);
  pointsRef.current = points;

  // ── One snap per animation frame ──────────────────────────────────────
  // pointermove stores the latest x and asks for a single resolution on the next
  // frame. resolveScrubPoint holds the current selection until the pointer is
  // 8px past the midpoint and latches at both ends, and when the resolved point
  // is the one already selected, `select` skips the state update entirely.
  const resolveAtPointer = useCallback(() => {
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      const rect = svgRectRef.current;
      const clientX = pointerXRef.current;
      if (!rect || clientX == null) return;
      const source = gesturePointsRef.current || pointsRef.current;
      const next = resolveScrubPoint(source, clientX - rect.left, activePointRef.current);
      if (next) select(next);
    });
  }, [select]);

  const cancelFrame = useCallback(() => {
    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

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
      const nearest = resolveScrubPoint(
        gesturePointsRef.current || pointsRef.current,
        localX,
        activePointRef.current
      );
      if (nearest) select(nearest);
    }
  }, [select]);

  const handlePointerDown = useCallback((e) => {
    if (!points.length || !e.isPrimary) return;
    gestureStateRef.current = "pending";
    // Freeze the plotted points for this gesture: a reading that lands mid-drag
    // must not move the selection under the finger.
    gesturePointsRef.current = points;
    downPosRef.current = { x: e.clientX, y: e.clientY };
    pointerXRef.current = e.clientX;
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
        pointerXRef.current = e.clientX;
        resolveAtPointer();
      }
      return;
    }

    pointerXRef.current = e.clientX;
    resolveAtPointer();
  }, [resolveAtPointer, clearHoldTimer, enterScrubMode]);

  const handlePointerUp = useCallback(() => {
    clearHoldTimer();
    try {
      if (hitPathRef.current && pointerIdRef.current != null) {
        hitPathRef.current.releasePointerCapture(pointerIdRef.current);
      }
    } catch {
      /* already released or not captured */
    }

    cancelFrame();
    const state = gestureStateRef.current;
    gestureStateRef.current = "idle";
    pointerIdRef.current = null;
    gesturePointsRef.current = null;
    // A scroll or resize nudge just after the finger lifts must not dismiss.
    dismissSuppressUntilRef.current = Date.now() + DISMISS_GRACE_MS;

    if (state === "scrubbing") {
      scrubbingRef.current = false;
      setScrubbing(false);
    } else if (state === "pending") {
      if (svgRectRef.current) {
        const localX = downPosRef.current.x - svgRectRef.current.left;
        // A tap picks the nearest point outright, not the hysteresis result.
        const nearest = resolveScrubPoint(pointsRef.current, localX, null);
        if (nearest) {
          const same = activePointRef.current
            && activePointRef.current.x === nearest.x
            && activePointRef.current.kind === nearest.kind;
          select(same ? null : nearest);
        }
      }
    }
  }, [clearHoldTimer, cancelFrame, select]);

  const handlePointerCancel = useCallback(() => {
    clearHoldTimer();
    cancelFrame();
    gestureStateRef.current = "idle";
    pointerIdRef.current = null;
    gesturePointsRef.current = null;
    dismissSuppressUntilRef.current = Date.now() + DISMISS_GRACE_MS;
    if (scrubbingRef.current) {
      scrubbingRef.current = false;
      setScrubbing(false);
    }
  }, [clearHoldTimer, cancelFrame]);

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
        select(points[next]);
        break;
      }
      case "ArrowLeft":
      case "ArrowDown": {
        e.preventDefault();
        const prev = currentIndex < 0 ? points.length - 1 : Math.max(currentIndex - 1, 0);
        select(points[prev]);
        break;
      }
      case "Escape": {
        e.preventDefault();
        select(null);
        break;
      }
      case "Enter":
      case " ": {
        e.preventDefault();
        select(activePointRef.current ? null : points[0]);
        break;
      }
      default:
        break;
    }
  }, [points, activePoint, select]);

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

  // Only a real reading opens the cream card. A forecast point is described by
  // the estimate strip above the chart, so it never gets a card of its own.
  const cardPoint = activePoint && activePoint.kind === "reading" ? activePoint : null;

  // Resolve the card's position: above the selected point, flipped below when
  // it would cross the top of the plot, clamped inside the visible plot box on
  // both axes and never over the floating nav. The card's box is a fixed size,
  // so it cannot move under the reader's finger, and the flip only changes once
  // the point has cleared the deadband.
  useLayoutEffect(() => {
    if (!cardPoint || !svgRef.current) {
      flippedRef.current = false;
      setPos((prev) => (prev.ready || prev.left || prev.top
        ? { left: 0, top: 0, ready: false, flipped: false }
        : prev));
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const plot = plotBoxFor(svgRef.current) || rect;
    const width = CARD_WIDTH_PX;
    const height = CARD_HEIGHT_PX;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const pointLeft = rect.left + cardPoint.x;
    const pointTop = rect.top + cardPoint.y;

    // Space left above the marker inside the plot once gap and card are placed;
    // negative means the card does not fit above it.
    const slack = pointTop - CARD_GAP - height - (rect.top - MARGIN);
    const flipped = resolveCardFlip(slack, flippedRef.current);
    flippedRef.current = flipped;
    let top = flipped ? pointTop + CARD_GAP : pointTop - CARD_GAP - height;

    // Horizontal clamp against the plot's own box, never beyond the viewport.
    const boundsLeft = Math.max(MARGIN, plot.left + MARGIN);
    const boundsRight = Math.min(vw, plot.right) - MARGIN;
    let left = pointLeft - width / 2;
    left = Math.min(Math.max(left, boundsLeft), Math.max(boundsLeft, boundsRight - width));
    top = Math.max(MARGIN, Math.min(top, vh - NAV_CLEARANCE - height));

    setPos((prev) => (
      prev.ready && prev.left === left && prev.top === top && prev.flipped === flipped
        ? prev
        : { left, top, ready: true, flipped }
    ));
  }, [cardPoint, nowMs]);

  // Dismiss on tap outside, scroll, Escape or resize — but never while a scrub
  // is in flight or in the moment just after it. A one-pixel scroll nudge used
  // to clear the card mid-drag and the next pointermove put it back: the blink.
  useEffect(() => {
    if (!activePoint) return;
    const holdsCard = () => (
      gestureStateRef.current === "pending"
      || gestureStateRef.current === "scrubbing"
      || Date.now() < dismissSuppressUntilRef.current
    );
    const onDown = (e) => {
      if (e.target?.closest?.("[data-projection-scrub]")) return;
      select(null);
    };
    const onEsc = (e) => {
      if (e.key === "Escape") select(null);
    };
    const onScroll = () => {
      if (!holdsCard()) select(null);
    };
    const onResize = () => {
      if (!holdsCard()) select(null);
    };
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
  }, [activePoint, select]);

  if (forecastPoints.length === 0) return null;

  // The selected point, carrying the facts its card needs.
  // A past reading is labelled by its own age against server time — never as a
  // forecast, so a clock skew cannot produce a phantom "now" plus "+1m".
  const selected = activePoint
    ? {
        ...activePoint,
        ageSeconds: activePoint.kind === "reading" ? pointAgeSeconds(activePoint, nowMs) : null,
      }
    : null;

  const selectedCopy = projectionCardCopy(selected);

  const ariaLabel = selectedCopy
    ? `Projected glucose ${selectedCopy.valueLabel}, ${selectedCopy.eyebrow}` +
      (selectedCopy.range ? `, ${selectedCopy.range}` : "") +
      `. Use arrow keys to step through the points.`
    : "Projected glucose trajectory. Press Enter to open, then use arrow keys to step through the points.";

  // ── Drawing ───────────────────────────────────────────────────────────
  // Both the median and the band are drawn with the SAME shape-preserving
  // smoothing as the measured line (Fritsch–Carlson), so the forecast reads as
  // one continuous curve rather than a chain of straight segments, and the
  // curve cannot overshoot a value the model never produced.
  const linePath = monotoneXPath(points.map((p) => ({ x: p.x, y: p.y })));

  // The band covers the forecast and closes at the reading, which has no
  // uncertainty of its own: upper edge forward, lower edge back.
  const bandPoints = points.filter((p) => p.kind === "forecast");
  const hasBand = bandPoints.length > 1 && bandPoints.every((p) => p.lower != null && p.upper != null);
  let bandPath = "";
  if (hasBand) {
    const upper = points.map((p) => ({ x: p.x, y: getGlucoseY(p.upper != null ? p.upper : p.value) }));
    const lower = points.map((p) => ({ x: p.x, y: getGlucoseY(p.lower != null ? p.lower : p.value) }));
    const back = monotoneXPath([...lower].reverse()).replace(/^M/, "L");
    bandPath = `${monotoneXPath(upper)} ${back} Z`;
  }

  // The last drawn forecast point carries a small dot, so the eye finds where
  // the estimate stops. No number is attached to it.
  const endPoint = points[points.length - 1];

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {selectedCopy
          ? `Projected glucose ${selectedCopy.valueLabel}, ${selectedCopy.eyebrow}` +
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
        {hasBand && <path d={bandPath} fill="#AF751B" fillOpacity={0.1} stroke="none" />}
        <path
          d={linePath}
          stroke="#AF751B"
          strokeWidth={2}
          strokeDasharray="5 5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
        {endPoint && (
          <circle
            cx={endPoint.x}
            cy={endPoint.y}
            r={2.4}
            fill="#AF751B"
            fillOpacity={0.85}
            style={{ pointerEvents: "none" }}
          />
        )}
        {/* Active point marker — a rust dot inside a 12% halo, and nothing else.
            No drop line, no tick, no connector to the axis and no stub toward a
            card: the estimate is described in the strip above the chart, and a
            reading opens the card on its own. */}
        {selected && (
          <>
            <circle
              cx={selected.x}
              cy={selected.y}
              r={9}
              fill="#8C4A28"
              fillOpacity={scrubbing ? 0.2 : 0.12}
              style={{ pointerEvents: "none" }}
            />
            <circle
              cx={selected.x}
              cy={selected.y}
              r={3.6}
              fill="#8C4A28"
              stroke="#FDF9F2"
              strokeWidth={1.6}
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

      {selected && selected.kind === "reading" && createPortal(
        <AnimatePresence>
          {/* Opacity only: a vertical entrance would animate every time the
              card flipped between a reading and a forecast point. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: pos.ready ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: scrubbing ? 0 : 0.14 }}
            className="fixed z-[300] pointer-events-none"
            style={{ left: pos.left, top: pos.top }}
          >
            <ProjectionTooltipCard point={selected} />
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}