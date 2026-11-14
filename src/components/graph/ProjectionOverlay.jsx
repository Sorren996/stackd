// Passive glucose trace. Native scrolling puts centre time on the smooth path;
// the header names received readings and the strip names real forecast points.
// Neither the measured line nor the forecast captures gestures.
import { useCallback, useLayoutEffect, useRef } from "react";
import { nearestEntry, FORECAST_KIND } from "@/lib/graphScrub";
import { monotoneXPath, monotoneXValue } from "@/lib/monotonePath";

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
  return monotoneXPath(points.map((point) => ({ x: xOf(point.time), y: yOf(point.value) })));
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

  const bandPoints = anchor ? [anchor, ...forecastPoints.filter((p) => Number.isFinite(p.upper) && Number.isFinite(p.lower))] : [];
  const upperPath = monotoneXPath(bandPoints.map((p) => ({ x: xOf(p.time), y: yOf(p === anchor ? p.value : p.upper) })));
  const lowerPath = monotoneXPath([...bandPoints].reverse().map((p) => ({ x: xOf(p.time), y: yOf(p === anchor ? p.value : p.lower) })));
  const bandPath = bandPoints.length > 1 ? `${upperPath} ${lowerPath.replace(/^M/, "L")} Z` : "";

  // Native scrolling alone drives the centre marker. The header receives a
  // real reading; future selections report only real model points to the strip.
  useLayoutEffect(() => {
    const el = scrollContainerRef?.current;
    const readings = entries.filter((entry) => entry.kind !== FORECAST_KIND);
    const forecasts = entries.filter((entry) => entry.kind === FORECAST_KIND);
    const runs = [];
    readings.forEach((entry) => { (runs[entry.run ?? 0] ||= []).push(entry); });
    const futureRun = anchor ? [anchor, ...forecasts] : [];
    let lastKey = null;
    const update = () => {
      const centreX = el ? el.scrollLeft + el.clientWidth / 2 : xOf(anchor?.time);
      const centreTime = anchor && Math.abs(centreX - xOf(anchor.time)) <= 0.5
        ? anchor.time : domainStart + centreX / chartWidth * totalMs;
      const future = anchor && centreTime > anchor.time && forecasts.length > 0;
      const selected = nearestEntry(future ? forecasts : readings, centreTime);
      const run = future ? futureRun : runs[selected?.run ?? 0] || [];
      // No interpolation across genuine reading gaps.
      const onRun = run.length && centreTime >= run[0].time && centreTime <= run[run.length - 1].time;
      const y = onRun ? monotoneXValue(run.map((p) => ({ x: xOf(p.time), y: yOf(p.value) })), centreX)
        : selected ? yOf(selected.value) : null;
      if (markerRef.current) {
        markerRef.current.style.display = selected ? "" : "none";
        if (selected) markerRef.current.setAttribute("transform", `translate(${centreX} ${y})`);
      }
      const key = selected ? `${selected.kind}:${selected.time}:${selected.value}` : "";
      if (key !== lastKey) {
        lastKey = key;
        reportRef.current?.(selected ? { ...selected, centreTime } : null);
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
      style={{ width: chartWidth, height: glucoseChartHeight, pointerEvents: "none", zIndex: 20 }}
      aria-hidden="true"
    >
      {bandPath && <path d={bandPath} fill={FORECAST_STROKE} fillOpacity={0.1} stroke="none" />}
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

      {/* One centre marker above the chart layers, with no interaction target. */}
      <g ref={markerRef} style={{ pointerEvents: "none" }}>
        <circle r={9} fill={MARKER_INK} fillOpacity={0.12} />
        <circle r={3.6} fill={MARKER_INK} stroke="#FDF9F2" strokeWidth={1.6} />
      </g>
    </svg>
  );
}