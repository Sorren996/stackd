import { useEffect, useRef } from "react";
import { buildGlucoseSegments } from "@/lib/glucoseSeries";
import { monotoneXPath } from "@/lib/monotonePath";
import { formatSharedHourTick } from "@/lib/sharing/sharedTimeFormat";

const ROW_HEIGHT = 168;
const TOP = 14;
const BOTTOM = 22;
const SPACING = 9; // px per reading — the strip scrolls, points are never squashed
const INK = "#3f3830";
const MUTED = "#746959";
const RANGE = "#5b6550";
const HIGH = "#9a6f2f";
const LOW = "#a2564a";

/**
 * The followed person's glucose, as a scrollable strip.
 *
 * Glucose only: no projection, no insulin markers, no meals, no rescue carbs.
 * Every value arrives already windowed and target-bounded by the server
 * projection, so this component can only draw what the sharer switched on.
 */
export default function SharedGlucoseChart({ readings, targetLow, targetHigh }) {
  const scrollerRef = useRef(null);
  const points = (Array.isArray(readings) ? readings : []).filter((r) =>
    Number.isFinite(Number(r?.value))
  );

  // The newest reading lives at the right edge, exactly like the patient chart.
  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [points.length]);

  if (points.length < 2) {
    return (
      <p className="text-xs" style={{ color: MUTED }}>
        Not enough of their readings in the last 24 hours to draw a strip yet.
      </p>
    );
  }

  const values = points.map((p) => Number(p.value));
  const lows = Number.isFinite(Number(targetLow)) ? [Number(targetLow)] : [];
  const highs = Number.isFinite(Number(targetHigh)) ? [Number(targetHigh)] : [];
  const minY = Math.max(40, Math.floor(Math.min(...values, ...lows) - 20));
  const maxY = Math.ceil(Math.max(...values, ...highs) + 20);
  const span = Math.max(1, maxY - minY);
  const plotH = ROW_HEIGHT - TOP - BOTTOM;

  const yFor = (v) => TOP + plotH - ((v - minY) / span) * plotH;
  const xFor = (i) => i * SPACING + SPACING / 2;
  const width = points.length * SPACING;

  const segmentPaths = buildGlucoseSegments(
    points.
    map((p, i) => ({
      time: new Date(p.recorded_at || p.created_at || p.created_date).getTime(),
      value: Number(p.value),
      index: i
    })).
    filter((s) => Number.isFinite(s.time) && Number.isFinite(s.value))
  ).
  filter((segment) => segment.length > 1).
  map((segment) => monotoneXPath(segment.map((sample) => ({ x: xFor(sample.index), y: yFor(sample.value) })))).
  filter(Boolean);

  // One tick each time their local hour changes, so the strip stays readable
  // even when readings arrive irregularly.
  const ticks = [];
  let lastHour = null;
  points.forEach((p, i) => {
    const at = new Date(p.recorded_at);
    if (Number.isNaN(at.getTime())) return;
    const hour = at.getHours();
    if (hour !== lastHour) {
      lastHour = hour;
      // Written on a 12-hour clock ("1 PM", midnight "12 AM", noon "12 PM").
      ticks.push({ x: xFor(i), label: formatSharedHourTick(at) });
    }
  });

  const inRange = (v) =>
    Number.isFinite(Number(targetLow)) && Number.isFinite(Number(targetHigh))
      ? v >= Number(targetLow) && v <= Number(targetHigh)
      : true;

  return (
    <div
      ref={scrollerRef}
      className="w-full overflow-x-auto overscroll-x-contain"
      style={{ WebkitOverflowScrolling: "touch" }}
      role="img"
      aria-label={`Their glucose over the last 24 hours, ${points.length} readings`}
    >
      <svg width={width} height={ROW_HEIGHT} style={{ display: "block" }}>
        {/* Today's target band, taken from THEIR plan */}
        {Number.isFinite(Number(targetLow)) && Number.isFinite(Number(targetHigh)) && (
          <rect
            x={0}
            y={yFor(Number(targetHigh))}
            width={width}
            height={Math.max(1, yFor(Number(targetLow)) - yFor(Number(targetHigh)))}
            fill={RANGE}
            opacity={0.1}
          />
        )}

        {ticks.map((tick) => (
          <g key={`${tick.x}-${tick.label}`}>
            <line x1={tick.x} y1={TOP} x2={tick.x} y2={TOP + plotH} stroke={MUTED} strokeWidth={1} opacity={0.18} />
            <text x={tick.x + 3} y={ROW_HEIGHT - 6} fontSize={9} fill={MUTED}>
              {tick.label}
            </text>
          </g>
        ))}

        {segmentPaths.map((d, i) => (
          <path
            key={`trace_${i}`}
            d={d}
            fill="none"
            stroke={INK}
            strokeWidth={1.7}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}

        {points.map((p, i) => {
          const v = Number(p.value);
          const colour = inRange(v) ? RANGE : v > Number(targetHigh) ? HIGH : LOW;
          return <circle key={p.id || i} cx={xFor(i)} cy={yFor(v)} r={1.6} fill={colour} />;
        })}
      </svg>
    </div>
  );
}