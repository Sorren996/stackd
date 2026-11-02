import { useEffect, useMemo, useRef, useState } from "react";
import { formatGlucose } from "@/lib/glucoseUnits";
import { buildGlucoseSegments } from "@/lib/glucoseSeries";
import { monotoneXPath } from "@/lib/monotonePath";
import { MR } from "./mealReviewTheme";

// The one measured glucose picture for the meals being reviewed.
//
// Same received readings, same target range and the same genuine gap breaks as
// the previous chart. What changed is the window: it can span more than one
// logged meal, so a single timeline carries the named meals along its axis
// instead of one curve per meal. Modeled dose curves are no longer drawn over
// the glucose scale; they live in the estimates disclosures further down.

const H = 224;
const PAD_T = 32; // space for the observed-high caption
const PAD_B = 40; // space for the meal names / clock under the plot
const PAD_X = 18;

function useContainerWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function clipName(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  return text.length > 16 ? `${text.slice(0, 15)}…` : text;
}

export default function MealWindowChart({
  glucoseReadings,
  from,
  to,
  now,
  targetLow = 70,
  targetHigh = 180,
  markers = [],
  startValue = null,
  peakValue = null,
  timeToPeakMin = null,
  allowHighest = false,
  peakMode = "peak",
}) {
  const [ref, width] = useContainerWidth();
  const W = width || 330;

  const { segments, highPoint, domain, end } = useMemo(() => {
    const windowEnd = Math.min(Number.isFinite(now) ? now : Date.now(), Number.isFinite(to) ? to : Date.now());
    const raw = (Array.isArray(glucoseReadings) ? glucoseReadings : [])
      .map((r) => ({ time: new Date(r.recorded_at).getTime(), value: Number(r.value) }))
      .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value) && r.time >= from && r.time <= windowEnd)
      .sort((a, b) => a.time - b.time);

    const points = [];
    if (Number.isFinite(startValue) && raw.length) {
      points.push({ time: from, value: Number(startValue) });
    }
    raw.forEach((r) => {
      if (!points.length || r.time > points[points.length - 1].time) points.push(r);
    });

    // The known peak: the reading nearest the analysis' peak value, exactly as
    // the single-meal chart resolved it. When there is no analysis peak (a
    // shared timeline, or a window with no declared peak) the drawing falls
    // back to the highest reading it is actually showing — and only when the
    // caller allows it, so a no-peak state stays a no-peak state.
    let high = null;
    const hasAnalysisPeak = Number.isFinite(peakValue) && Number.isFinite(timeToPeakMin) && points.length > 0;
    if (hasAnalysisPeak) {
      high = points[0];
      for (const p of points) {
        if (Math.abs(p.value - peakValue) < Math.abs(high.value - peakValue)) high = p;
      }
    } else if (allowHighest && points.length) {
      high = points[0];
      for (const p of points) if (p.value > high.value) high = p;
    }

    const values = points.map((p) => p.value);
    let lo = values.length ? Math.min(...values, targetLow) : targetLow;
    let hi = values.length ? Math.max(...values, targetHigh) : targetHigh;
    const pad = Math.max(12, (hi - lo) * 0.12);
    lo -= pad;
    hi += pad;

    return {
      segments: buildGlucoseSegments(points),
      highPoint: high,
      domain: { min: lo, max: hi },
      end: windowEnd,
    };
  }, [glucoseReadings, from, to, now, targetLow, targetHigh, startValue, peakValue, timeToPeakMin, allowHighest]);

  const plotW = Math.max(1, W - PAD_X * 2);
  const plotH = Math.max(1, H - PAD_T - PAD_B);
  const span = Math.max(1, end - from);

  const x = (t) => PAD_X + ((t - from) / span) * plotW;
  const y = (v) => PAD_T + (1 - (v - domain.min) / Math.max(1, domain.max - domain.min)) * plotH;

  const bandTop = y(targetHigh);
  const bandBottom = y(targetLow);
  const baseY = PAD_T + plotH;

  const totalPoints = segments.reduce((sum, segment) => sum + segment.length, 0);
  const hasCurve = totalPoints >= 2;

  if (!hasCurve) {
    return (
      <div ref={ref} className="px-4 pb-1">
        <div
          className="flex items-center justify-center"
          style={{ height: H - 20, background: MR.band, borderRadius: 22, border: `1px solid ${MR.border}` }}
        >
          <span style={{ fontSize: 12, color: MR.sec }}>Waiting for post-meal readings</span>
        </div>
      </div>
    );
  }

  const lastPoint = segments[segments.length - 1].slice(-1)[0];
  const startClock = formatClock(from);

  // Meal names ride the time axis at their own logged position. Two nearby
  // meals drop to a second label row instead of overlapping.
  const markerLabels = [];
  markers.forEach((marker) => {
    if (!Number.isFinite(marker?.time)) return;
    const cx = Math.min(Math.max(x(marker.time), 32), W - PAD_X - 30);
    let row = 0;
    while (row < 2 && markerLabels.some((p) => p.row === row && Math.abs(p.cx - cx) < 56)) row += 1;
    markerLabels.push({ cx, row: Math.min(row, 1), name: clipName(marker.name) });
  });

  const highCaption = highPoint
    ? `${peakMode === "highest" ? "Highest so far" : "Peak"} ${formatGlucose(highPoint.value)}${
        Number.isFinite(timeToPeakMin) ? ` · ${Math.round(timeToPeakMin)} min` : ""
      }`
    : null;

  const startLabelText = Number.isFinite(startValue) ? formatGlucose(startValue) : null;
  const nowLabelText = formatGlucose(lastPoint.value);
  const nowLabelX = Math.min(Math.max(x(lastPoint.time), 22), W - 22);
  const startLabelX = Math.min(Math.max(x(from), 22), W - 22);

  return (
    <div ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block" role="presentation">
        {/* The person's own configured target range */}
        <rect
          x={PAD_X}
          y={Math.min(bandTop, bandBottom)}
          width={plotW}
          height={Math.abs(bandBottom - bandTop)}
          fill={MR.band}
        />
        <line x1={PAD_X} y1={bandTop} x2={W - PAD_X} y2={bandTop} stroke={MR.sage} strokeWidth={1} />
        <line x1={PAD_X} y1={bandBottom} x2={W - PAD_X} y2={bandBottom} stroke={MR.sage} strokeWidth={1} />

        {/* Named meal positions on the shared timeline */}
        {markers.map((marker, index) => {
          if (!Number.isFinite(marker?.time)) return null;
          const mx = x(marker.time);
          return (
            <line
              key={`marker-${index}`}
              x1={mx}
              y1={PAD_T}
              x2={mx}
              y2={baseY}
              stroke={MR.ink}
              strokeOpacity={0.16}
              strokeWidth={1}
              strokeDasharray="2 4"
            />
          );
        })}

        {/* Smooth line through the received readings, broken at real gaps */}
        {segments.map((segment, index) => {
          if (segment.length < 2) return null;
          return (
            <path
              key={`segment-${index}`}
              d={monotoneXPath(segment.map((p) => ({ x: x(p.time), y: y(p.value) })))}
              fill="none"
              stroke={MR.rust}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Range labels */}
        <text x={W - PAD_X + 2} y={bandTop - 5} textAnchor="end" fontSize={9} fill={MR.sec}>
          {formatGlucose(targetHigh)}
        </text>
        <text x={W - PAD_X + 2} y={bandBottom + 11} textAnchor="end" fontSize={9} fill={MR.sec}>
          {formatGlucose(targetLow)}
        </text>

        {/* Start of the window — open circle */}
        {startLabelText && (
          <circle cx={x(from)} cy={y(Number(startValue))} r={4} fill={MR.card} stroke={MR.ink} strokeWidth={1.75} />
        )}

        {/* Observed high — open circle */}
        {highPoint && (
          <circle cx={x(highPoint.time)} cy={y(highPoint.value)} r={4} fill={MR.card} stroke={MR.ink} strokeWidth={1.75} />
        )}

        {/* Now — filled rust dot */}
        <circle cx={x(lastPoint.time)} cy={y(lastPoint.value)} r={4.5} fill={MR.rust} stroke={MR.card} strokeWidth={2} />

        {/* Observed-high caption, top left of the plot */}
        {highCaption && (
          <text x={PAD_X} y={16} fontSize={10} fontWeight={600} fill={MR.ink}>
            {highCaption}
          </text>
        )}

        {/* Start value, under its dot */}
        {startLabelText && (
          <text
            x={startLabelX}
            y={Math.min(y(Number(startValue)) + 17, baseY - 2)}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill={MR.ink}
          >
            {startLabelText}
          </text>
        )}

        {/* Current value, above its dot */}
        <text x={nowLabelX} y={Math.max(y(lastPoint.value) - 11, PAD_T + 8)} textAnchor="middle" fontSize={10} fontWeight={600} fill={MR.rust}>
          {nowLabelText}
        </text>

        {/* Time axis: meal names at their own position, or the window start */}
        {markerLabels.length > 0 ? (
          markerLabels.map((label, index) => (
            <text
              key={`name-${index}`}
              x={label.cx}
              y={baseY + 16 + label.row * 13}
              textAnchor="middle"
              fontSize={9.5}
              fill={MR.sec}
            >
              {label.name}
            </text>
          ))
        ) : (
          startClock && (
            <text x={PAD_X} y={baseY + 16} fontSize={9.5} fill={MR.sec}>
              {startClock}
            </text>
          )
        )}
        <text x={W - PAD_X} y={baseY + 16} textAnchor="end" fontSize={9.5} fill={MR.sec}>
          now
        </text>
      </svg>
    </div>
  );
}