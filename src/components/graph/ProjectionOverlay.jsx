// Stackd Insight — the glucose trace, and the one scrub that reads it.
//
// ONE LINE, ONE POSITION, ONE MARKER.
//
// THE LINE. Readings and forecast are one path built from one merged array:
// solid up to the newest reading, dashed after it. It is drawn here, not as two
// separate chart elements, so the measured line and the projection cannot be
// drawn out of step. A genuine gap in the sensor stream breaks the path; it is
// never bridged.
//
// THE POSITION. One number between 0 and 1, and it lives here because this is
// the layer the finger talks to. A (0) is the newest received reading, and that
// is where the marker rests on load. B (1) is the final forecast point, or A
// when there is no projection. The marker's x is A.x + (B.x - A.x) * position
// and its y is interpolated along the same drawn line at that time, so the dot
// is always on the trace and always somewhere real.
//
// Everything else on screen is DERIVED from that number and reported upward
// from it: the nearest drawn entry, which is what the readout beside the chart
// and the estimate strip above it describe. Nothing downstream keeps a second
// selection of its own, so the number can only change when the marker moves.
// Only the snapped entry is reported — not every pixel — so a drag repaints
// this layer alone and leaves the charts beneath it untouched.
//
// THE DRAG. Content x maps linearly between A and B to give the position,
// clamped to 0..1, and the marker sits exactly at that x. There is no
// hysteresis, no snap-back, no rubber band and no settle animation: the finger
// writes the position, the dot follows it, and lifting the finger leaves it
// where it is. The layer claims horizontal gestures for itself with
// touch-action: pan-y, so the chart's scroller never pans during a drag while a
// vertical swipe still scrolls the page.
//
// THE MARKER IS ALWAYS DRAWN, and always last in the svg. It is opaque to
// pointer events, so nothing on the plot can hide it and it never blocks the
// gesture that moves it.
//
// SAFETY: an informational wellness estimate, never a clinical prediction.

import { useCallback, useEffect, useRef, useState } from "react";
import { nearestEntry, valueAtTime, positionForTime, FORECAST_KIND, READING_KIND } from "@/lib/graphScrub";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";

const READING_STROKE = "#8c4a28";
const READING_WIDTH = 2.75;
const FORECAST_STROKE = "#AF751B";
const MARKER_INK = "#8C4A28";

const clamp01 = (value) => Math.min(1, Math.max(0, value));

/**
 * One path string for a run of points. A run of a single point becomes a
 * zero-length round-capped segment, which paints the dot that lone reading
 * would otherwise not have.
 */
function pathOfRun(points, xOf, yOf) {
  if (!points.length) return "";
  if (points.length === 1) {
    const x = xOf(points[0].time);
    const y = yOf(points[0].value);
    return `M ${x} ${y} L ${x + 0.01} ${y}`;
  }
  return points
    .map((point, index) => `${index ? "L" : "M"} ${xOf(point.time)} ${yOf(point.value)}`)
    .join(" ");
}

export default function ProjectionOverlay({
  entries = [],
  anchor = null,
  horizon = null,
  domainStart,
  totalMs,
  chartWidth,
  glucoseChartHeight,
  glucoseMarginTop,
  plotHeight,
  getGlucoseY,
  // The 24-hour view draws candles instead of a line, and keeps its own taps.
  showReadingLine = true,
  interactive = true,
  // Bumped by the chart's "Now" control: the position returns to A.
  resetSignal = 0,
  onSelectionChange = null,
  scrollContainerRef = null,
}) {
  const [position, setPosition] = useState(0);
  const draggingRef = useRef(false);
  const reportRef = useRef(onSelectionChange);
  reportRef.current = onSelectionChange;

  useEffect(() => {
    setPosition(0);
  }, [resetSignal]);

  const xOf = useCallback(
    (time) => ((time - domainStart) / totalMs) * chartWidth,
    [domainStart, totalMs, chartWidth]
  );
  const yOf = useCallback((value) => getGlucoseY(value), [getGlucoseY]);

  // ── The line ────────────────────────────────────────────────────────────
  // The received readings, still broken into their own runs at real gaps.
  const readingRuns = [];
  const forecastPoints = [];
  for (const entry of entries) {
    if (entry.kind === FORECAST_KIND) {
      forecastPoints.push(entry);
      continue;
    }
    const run = entry.run ?? 0;
    if (!readingRuns[run]) readingRuns[run] = [];
    readingRuns[run].push(entry);
  }

  const solidPath = showReadingLine
    ? readingRuns.map((run) => pathOfRun(run || [], xOf, yOf)).filter(Boolean).join(" ")
    : "";
  // The dashes leave the newest reading itself, so the two meet on one line.
  const dashedPath = forecastPoints.length && anchor
    ? pathOfRun([anchor, ...forecastPoints], xOf, yOf)
    : "";

  // ── The marker, from the position ───────────────────────────────────────
  const span = anchor && horizon ? horizon.time - anchor.time : 0;
  const markerTime = anchor
    ? span > 0 ? anchor.time + span * clamp01(position) : anchor.time
    : null;
  const markerValue = markerTime == null ? null : valueAtTime(entries, markerTime);
  const marker = markerTime != null && Number.isFinite(markerValue)
    ? { x: xOf(markerTime), y: yOf(markerValue) }
    : null;

  // ── The readout's point, reported from the same position ────────────────
  const selected = markerTime == null ? null : nearestEntry(entries, markerTime);
  const selectedKey = selected ? `${selected.kind}:${selected.time}:${selected.value}` : "";
  useEffect(() => {
    reportRef.current?.(selected);
    // Reported on a change of drawn point, never on every pixel of a drag.
  }, [selectedKey]);

  // ── The drag ────────────────────────────────────────────────────────────
  const positionFromClientX = useCallback((clientX) => {
    const el = scrollContainerRef?.current;
    if (!el || !anchor || !horizon) return 0;
    const pixelSpan = xOf(horizon.time) - xOf(anchor.time);
    if (!(pixelSpan > 1)) return 0;
    const contentX = clientX - el.getBoundingClientRect().left + el.scrollLeft;
    return clamp01((contentX - xOf(anchor.time)) / pixelSpan);
  }, [scrollContainerRef, anchor, horizon, xOf]);

  const handlePointerDown = useCallback((event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    draggingRef.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch { /* capture is an optimisation, never a requirement */ }
    setPosition(positionFromClientX(event.clientX));
  }, [positionFromClientX]);

  const handlePointerMove = useCallback((event) => {
    if (!draggingRef.current) return;
    setPosition(positionFromClientX(event.clientX));
  }, [positionFromClientX]);

  const endDrag = useCallback((event) => {
    draggingRef.current = false;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch { /* the pointer may already be gone */ }
  }, []);

  // ── The keyboard reads the same position ────────────────────────────────
  const stepBy = useCallback((direction) => {
    if (!anchor || !horizon || !entries.length) return;
    const current = markerTime == null ? null : nearestEntry(entries, markerTime);
    const index = current ? entries.indexOf(current) : -1;
    const next = entries[Math.min(Math.max(index + direction, 0), entries.length - 1)];
    setPosition(positionForTime(anchor, horizon, next.time));
  }, [anchor, horizon, entries, markerTime]);

  const handleKeyDown = useCallback((event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      stepBy(1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      stepBy(-1);
    }
  }, [stepBy]);

  if (!entries.length) return null;

  const plotTop = glucoseMarginTop;
  const plotHeightClamped = Math.max(0, Math.min(plotHeight, glucoseChartHeight - glucoseMarginTop));

  return (
    <svg
      className="absolute top-0 left-0"
      style={{ width: chartWidth, height: glucoseChartHeight, outline: "none" }}
      tabIndex={0}
      role="slider"
      aria-label="Glucose trace. Drag across it, or use the arrow keys, to read a point."
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={Math.round(clamp01(position) * 100) / 100}
      aria-valuetext={marker != null
        ? `${formatGlucose(markerValue)} ${glucoseUnitLabel()}`
        : undefined}
      onKeyDown={handleKeyDown}
    >
      {solidPath && (
        <path
          d={solidPath}
          fill="none"
          stroke={READING_STROKE}
          strokeWidth={READING_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}

      {dashedPath && (
        <path
          d={dashedPath}
          fill="none"
          stroke={FORECAST_STROKE}
          strokeWidth={2}
          strokeDasharray="5 5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ pointerEvents: "none" }}
        />
      )}

      {/* One hit layer over the whole plot. pan-y hands horizontal movement to
          this layer alone, so the chart's scroller cannot pan while a drag is
          writing the position, while a vertical swipe still scrolls the page. */}
      {interactive && (
        <rect
          x={0}
          y={plotTop}
          width={chartWidth}
          height={plotHeightClamped}
          fill="transparent"
          style={{ pointerEvents: "all", touchAction: "pan-y", cursor: "ew-resize" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onLostPointerCapture={endDrag}
        />
      )}

      {/* Drawn last, so nothing can sit on top of it. Pointer-transparent, so it
          never intercepts the gesture that moves it. */}
      {marker && (
        <g style={{ pointerEvents: "none" }}>
          <circle cx={marker.x} cy={marker.y} r={9} fill={MARKER_INK} fillOpacity={0.12} />
          <circle cx={marker.x} cy={marker.y} r={3.6} fill={MARKER_INK} stroke="#FDF9F2" strokeWidth={1.6} />
        </g>
      )}
    </svg>
  );
}