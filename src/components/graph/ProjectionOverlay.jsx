// Passive glucose trace. Native timeline scrolling selects received readings;
// neither the measured line nor the forecast captures taps or drag gestures.
import { useCallback, useLayoutEffect, useRef } from "react";
import { nearestEntry, FORECAST_KIND } from "@/lib/graphScrub";

const READING_STROKE = "#8c4a28";
const READING_WIDTH = 2.75;
const FORECAST_STROKE = "#AF751B";
const MARKER_INK = "#8C4A28";



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
  domainStart,
  totalMs,
  chartWidth,
  glucoseChartHeight,
  getGlucoseY,
  // The 24-hour view draws candles instead of a line, and keeps its own taps.
  showReadingLine = true,
  // Bumped by the chart's "Now" control to re-read the scroll position.
  resetSignal = 0,
  onSelectionChange = null,
  scrollContainerRef = null,
}) {
  const markerRef = useRef(null);
  const reportRef = useRef(onSelectionChange);
  reportRef.current = onSelectionChange;

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

  // The marker belongs to a received reading under the viewport centre.
  // Update its content-space coordinates directly during native scrolling,
  // without a drag handler or a second, independently moving selection.
  useLayoutEffect(() => {
    const el = scrollContainerRef?.current;
    const readings = entries.filter((entry) => entry.kind !== FORECAST_KIND);
    let lastKey = null;
    const update = () => {
      const centreX = el ? el.scrollLeft + el.clientWidth / 2 : xOf(anchor?.time);
      const time = domainStart + centreX / chartWidth * totalMs;
      const selected = nearestEntry(readings, time);
      if (markerRef.current) {
        markerRef.current.style.display = selected ? "" : "none";
        if (selected) markerRef.current.setAttribute("transform", `translate(${xOf(selected.time)} ${yOf(selected.value)})`);
      }
      const key = selected ? `${selected.time}:${selected.value}` : "";
      if (key !== lastKey) {
        lastKey = key;
        reportRef.current?.(selected);
      }
    };
    update();
    el?.addEventListener("scroll", update, { passive: true });
    return () => el?.removeEventListener("scroll", update);
  }, [entries, anchor, domainStart, totalMs, chartWidth, xOf, yOf, scrollContainerRef, resetSignal]);

  if (!entries.length) return null;

  return (
    <svg
      className="absolute top-0 left-0"
      style={{ width: chartWidth, height: glucoseChartHeight, pointerEvents: "none" }}
      aria-hidden="true"
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

      {/* One plain marker, positioned by the timeline's native scroll offset. */}
      <g ref={markerRef} style={{ pointerEvents: "none" }}>
        <circle r={3.6} fill={MARKER_INK} stroke="var(--site-surface)" strokeWidth={1.6} />
      </g>
    </svg>
  );
}