// Stackd Insight — Projection Overlay
//
// Draws the projected glucose trajectory as a restrained dashed amber line with
// a subtle uncertainty band, over the ActivityGraph's glucose row.
//
// THE GLUCOSE LINE IS NOT SCRUBBABLE. There is no drag here of any kind: no hit
// rect, no pointer capture, no scroll pinning, no direction lock, no nearest-
// point snapping, no finger-following marker. A drag along the trace does
// nothing at all, in every window. The only gesture this file knows is a TAP on
// a past reading, which opens that reading's cream card.
//
// So this file does four things and nothing else:
//
//   1. The dashed forecast, drawn from the tip of the solid line onward with the
//      same shape-preserving smoothing as the measured line, so the two read as
//      one continuous trace: solid to the newest reading, dashed after it.
//   2. The uncertainty band, closed at the reading, which has no uncertainty.
//   3. Exactly one marker, ever: the tapped reading when a card is open, the
//      newest real reading otherwise. No drop line, no tick, no horizon dot.
//   4. The reading card, for a tapped reading and only a tapped reading.
//
// The horizon estimate is described by the strip above the chart, which needs no
// interaction at all — a forecast is an estimate to read, not a point to grab.
//
// SAFETY: an informational wellness estimate, never a clinical prediction.

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
import { BAR_HEIGHT } from "@/components/nav/navGeometry";

const MARGIN = 8;
const CARD_GAP = 12; // px between the marker and the card
// The floating pill nav never gets a card on top of it.
const NAV_CLEARANCE = BAR_HEIGHT + 34;
// How near a tap must land to a reading to open it. A tap anywhere else on the
// plot just closes an open card.
const TAP_RADIUS_PX = 26;

// The horizontally scrollable window the chart is seen through. It is the
// content-space origin for a tap, and the box the card is clamped to.
function scrollParentOf(el) {
  let node = el?.parentElement;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowX) && node.clientWidth > 0) return node;
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
  getGlucoseY,
  latestReading = null,
  readings = [],
  scrollContainerRef = null,
}) {
  // The reading a tap opened. Nothing else is ever selected.
  const [selected, setSelected] = useState(null);
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false, flipped: false });
  const svgRef = useRef(null);
  const flippedRef = useRef(false);
  const nowMs = useServerNow();
  // The card prints glucose in the reader's chosen unit, so a change of that
  // setting must repaint it at once rather than at the next clock tick.
  const [, setUnitsTick] = useState(0);
  useEffect(() => onGlucoseUnitsChange(() => setUnitsTick((t) => t + 1)), []);

  // The newest real reading: the tip of the solid line, and the only place the
  // dashed line may start. Without one there is nothing to anchor to.
  const anchorReading = useMemo(() => {
    const time = new Date(latestReading?.time ?? latestReading?.recorded_at).getTime();
    const value = Number(latestReading?.value);
    if (!Number.isFinite(time) || !Number.isFinite(value)) return null;
    return { time, value };
  }, [latestReading]);

  const toPlotPoint = useCallback((time, value, kind, extra = null) => ({
    time,
    value,
    kind,
    x: ((time - domainStart) / totalMs) * chartWidth,
    y: getGlucoseY(value),
    ...extra,
  }), [domainStart, totalMs, chartWidth, getGlucoseY]);

  // The dashed tail: the reading itself, then every forecast point after it.
  // Keeping the reading as the first entry is what makes the dashes meet the
  // tip of the solid line instead of floating beside it.
  const forecastPath = useMemo(() => {
    if (!projection || !Array.isArray(projection.trajectory) || projection.abstained) return [];
    const forecast = projection.trajectory
      .map((p) => {
        const time = new Date(p.time).getTime();
        const value = Number(p.value);
        if (!Number.isFinite(time) || !Number.isFinite(value)) return null;
        return {
          time,
          value,
          minOffset: Number.isFinite(Number(p.min_offset)) ? Number(p.min_offset) : null,
          lower: Number.isFinite(Number(p.lower)) ? Math.round(Number(p.lower)) : null,
          upper: Number.isFinite(Number(p.upper)) ? Math.round(Number(p.upper)) : null,
        };
      })
      .filter(Boolean)
      // Only the future: a point at or before the newest real reading is
      // already history and is never drawn as a forecast.
      .filter((p) => (anchorReading ? p.time > anchorReading.time : true))
      .sort((a, b) => a.time - b.time);

    const plotted = [];
    if (anchorReading) {
      plotted.push(toPlotPoint(anchorReading.time, anchorReading.value, "reading"));
    }
    for (const point of forecast) {
      plotted.push(toPlotPoint(point.time, point.value, "forecast", {
        minOffset: point.minOffset,
        lower: point.lower,
        upper: point.upper,
      }));
    }
    return plotted.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  }, [projection, anchorReading, toPlotPoint]);

  // Every drawn reading, so a tap can land on one and the resting marker has a
  // place to sit when there is no anchor.
  const readingPoints = useMemo(() => {
    const points = [];
    for (const reading of readings || []) {
      const time = Number.isFinite(reading?.time)
        ? reading.time
        : new Date(reading?.recorded_at).getTime();
      const value = Number(reading?.value);
      if (!Number.isFinite(time) || !Number.isFinite(value)) continue;
      const point = toPlotPoint(time, value, "reading");
      if (point.x >= 0 && point.x <= chartWidth && Number.isFinite(point.y)) points.push(point);
    }
    return points.sort((a, b) => a.x - b.x);
  }, [readings, toPlotPoint, chartWidth]);

  // The newest real reading on the plot: where the single marker rests.
  const restingPoint = anchorReading
    ? toPlotPoint(anchorReading.time, anchorReading.value, "reading")
    : readingPoints[readingPoints.length - 1] || null;

  // Where a tap landed, in the chart's own content space.
  const contentXOf = useCallback((clientX) => {
    const el = scrollContainerRef?.current || scrollParentOf(svgRef.current);
    if (!el) return clientX;
    return clientX - el.getBoundingClientRect().left + el.scrollLeft;
  }, [scrollContainerRef]);

  // ── Tap: a past reading only ──────────────────────────────────────────
  // Tapping a dashed forecast does nothing at all — not even a dismissal. The
  // future is described by the strip, not picked at. Tapping anywhere else on
  // the plot closes an open card.
  const handleTap = useCallback((e) => {
    const contentX = contentXOf(e.clientX);
    const newestX = restingPoint?.x;
    if (Number.isFinite(newestX) && contentX > newestX) return;

    let nearest = null;
    let nearestDistance = Infinity;
    for (const point of readingPoints) {
      const distance = Math.abs(point.x - contentX);
      if (distance < nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }
    if (nearest && nearestDistance <= TAP_RADIUS_PX) {
      setSelected(nearest);
      return;
    }
    setSelected(null);
  }, [contentXOf, readingPoints, restingPoint]);

  const cardPoint = selected;

  // Keyboard: the card must be reachable without a finger. Arrow keys step
  // through the drawn readings; Escape closes.
  const handleKeyDown = useCallback((e) => {
    if (!readingPoints.length) return;
    const index = selected
      ? readingPoints.findIndex((p) => p.time === selected.time && p.kind === selected.kind)
      : -1;

    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(readingPoints[index < 0 ? 0 : Math.min(index + 1, readingPoints.length - 1)]);
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(readingPoints[index < 0 ? readingPoints.length - 1 : Math.max(index - 1, 0)]);
    } else if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setSelected(null);
    }
  }, [readingPoints, selected]);

  // Anywhere outside the plot closes the card.
  useEffect(() => {
    if (!selected) return;
    const outside = (e) => {
      if (svgRef.current && svgRef.current.contains(e.target)) return;
      setSelected(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setSelected(null);
    };
    const onScrollOrResize = () => setSelected(null);
    document.addEventListener("mousedown", outside);
    document.addEventListener("touchstart", outside, { passive: true });
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("touchstart", outside);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [selected]);

  // Resolve the card's position: above the point, flipped below when it would
  // cross the top of the plot, clamped inside the visible plot box on both axes
  // and never over the floating nav. The card's box is a fixed size, so it
  // cannot move under the reader's finger, and the flip only changes once the
  // point has cleared the deadband.
  const FLIP_DEADBAND_PX = 16;
  useLayoutEffect(() => {
    if (!cardPoint || !svgRef.current) {
      flippedRef.current = false;
      setPos((prev) => (prev.ready || prev.left || prev.top
        ? { left: 0, top: 0, ready: false, flipped: false }
        : prev));
      return;
    }
    const rect = svgRef.current.getBoundingClientRect();
    const scrollEl = scrollContainerRef?.current || scrollParentOf(svgRef.current);
    const plot = scrollEl ? scrollEl.getBoundingClientRect() : rect;
    const height = CARD_HEIGHT_PX;
    const width = CARD_WIDTH_PX;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const pointLeft = rect.left + cardPoint.x;
    const pointTop = rect.top + cardPoint.y;

    // Space left above the marker inside the plot once gap and card are placed;
    // negative means the card does not fit above it.
    const slack = pointTop - CARD_GAP - height - (rect.top - MARGIN);
    const flipped = flippedRef.current ? slack <= FLIP_DEADBAND_PX : slack < -FLIP_DEADBAND_PX;
    flippedRef.current = flipped;
    let top = flipped ? pointTop + CARD_GAP : pointTop - CARD_GAP - height;

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
  }, [cardPoint, nowMs, scrollContainerRef]);

  if (!forecastPath.length && !readingPoints.length) return null;

  const hasFuture = forecastPath.some((p) => p.kind === "forecast");

  const selectedPoint = selected
    ? { ...selected, ageSeconds: pointAgeSeconds(selected, nowMs) }
    : null;
  const selectedCopy = projectionCardCopy(selectedPoint);

  const spoken = selectedCopy ? `Glucose ${selectedCopy.valueLabel}, ${selectedCopy.eyebrow}` : "";

  // ── Drawing ───────────────────────────────────────────────────────────
  // The dashed tail, smoothed exactly like the measured line, so the forecast
  // leaves the tip of the readings' polyline as one continuous curve and can
  // never overshoot a value the model did not produce.
  const linePath = monotoneXPath(forecastPath.map((p) => ({ x: p.x, y: p.y })));

  // The band covers the forecast and closes at the reading, which has no
  // uncertainty of its own: upper edge forward, lower edge back.
  const bandReady = forecastPath.filter((p) => p.kind === "forecast").length > 1
    && forecastPath.every((p) => p.kind === "reading" || (p.lower != null && p.upper != null));
  let bandPath = "";
  if (bandReady) {
    const upper = forecastPath.map((p) => ({ x: p.x, y: getGlucoseY(p.upper != null ? p.upper : p.value) }));
    const lower = forecastPath.map((p) => ({ x: p.x, y: getGlucoseY(p.lower != null ? p.lower : p.value) }));
    const back = monotoneXPath([...lower].reverse()).replace(/^M/, "L");
    bandPath = `${monotoneXPath(upper)} ${back} Z`;
  }

  // EXACTLY ONE MARKER. The tapped reading when a card is open, the newest real
  // reading otherwise. A second dot — at the horizon or anywhere else — is not
  // drawn, so no pair of markers can ever appear together.
  const marker = cardPoint || restingPoint;

  return (
    <>
      <div className="sr-only" aria-live="polite">
        {spoken}
      </div>
      <svg
        ref={svgRef}
        className="absolute top-0 left-0"
        style={{ width: chartWidth, height: glucoseChartHeight, overflow: "visible", outline: "none" }}
        tabIndex={0}
        role="button"
        aria-label="Glucose chart. Use arrow keys to step through the readings."
        onKeyDown={handleKeyDown}
        onClick={handleTap}
      >
        {bandReady && <path d={bandPath} fill="#AF751B" fillOpacity={0.1} stroke="none" style={{ pointerEvents: "none" }} />}
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
        {/* The dot: a rust point inside a halo, and nothing else. No drop line,
            no tick, no connector to the axis. */}
        {marker && (
          <g style={{ pointerEvents: "none" }}>
            <circle cx={marker.x} cy={marker.y} r={9} fill="#8C4A28" fillOpacity={0.12} />
            <circle cx={marker.x} cy={marker.y} r={3.6} fill="#8C4A28" stroke="#FDF9F2" strokeWidth={1.6} />
          </g>
        )}
        {/* A tap target for the whole plot and nothing else: no pointer down,
            move or up handlers, no capture, no touch-action override — so a
            drag over the trace is simply left alone by this layer. */}
        <rect
          x={0}
          y={glucoseMarginTop}
          width={chartWidth}
          height={Math.max(0, Math.min(plotHeight, glucoseChartHeight - glucoseMarginTop))}
          fill="transparent"
          style={{ pointerEvents: "all" }}
        />
      </svg>

      {cardPoint && createPortal(
        <AnimatePresence>
          {/* Opacity only: a vertical entrance would animate every time the card
              flipped between above and below the reading. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: pos.ready ? 1 : 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14 }}
            className="fixed z-[300] pointer-events-none"
            style={{ left: pos.left, top: pos.top }}
          >
            <ProjectionTooltipCard point={selectedPoint} />
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}