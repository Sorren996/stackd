import { useState, useRef, useEffect, useMemo } from "react";
import { formatGlucose, formatGlucoseDelta, glucoseUnitLabel } from "@/lib/glucoseUnits";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  hairline: "#eadccf",
  card: "#fdf9f2",
  canvas: "#f7f1e8",
  amber: "#8a5a12",
  red: "#9c3f2e",
  sage: "#5b6550",
};

const CHART_H = 184;
const PAD_L = 12;
const PAD_R = 12;
const PAD_T = 30;
const PAD_B = 24;

// Estimated badge footprint (px) used for offset + clamp math.
const BADGE_H = 22;
const START_W = 42;
const PEAK_W = 118;
const RISE_W = 70;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

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

/**
 * Glucose chart hero for Meal Review.
 *
 * One curve over the response window, a subtle target-range band with dashed
 * boundaries, a dashed meal-time marker, pinned value badges (start, peak,
 * rise), and a "now" dot. On screens narrower than 380px the badges drop off
 * the chart and render as a single chip row underneath so nothing collides.
 */
export default function MealReviewChart({
  glucoseReadings,
  mealTime,
  reviewWindowEnd,
  now,
  targetLow = 70,
  targetHigh = 180,
  startValue,
  peakValue,
  timeToPeakMin,
  deltaFromBaseline,
}) {
  const [ref, width] = useContainerWidth();
  const W = width || 320;
  const isNarrow = width > 0 && width < 380;

  const { points, peak, vMin, vMax } = useMemo(() => {
    const end = Math.min(now, reviewWindowEnd || now);
    const raw = (Array.isArray(glucoseReadings) ? glucoseReadings : [])
      .map((r) => ({ time: new Date(r.recorded_at).getTime(), value: Number(r.value) }))
      .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value) && r.time >= mealTime && r.time <= end)
      .sort((a, b) => a.time - b.time);

    // Anchor the curve at the before-meal starting glucose so it reads from
    // the meal time even when the first CGM reading arrives a few minutes later.
    const pts = [];
    if (Number.isFinite(startValue) && raw.length) {
      pts.push({ time: mealTime, value: Number(startValue) });
    }
    raw.forEach((r) => {
      if (!pts.length || r.time > pts[pts.length - 1].time) pts.push(r);
    });

    let pk = pts.length ? pts[0] : null;
    for (const p of pts) if (!pk || p.value > pk.value) pk = p;

    const vals = pts.map((p) => p.value);
    let lo = vals.length ? Math.min(...vals, targetLow) : targetLow;
    let hi = vals.length ? Math.max(...vals, targetHigh) : targetHigh;
    const pad = Math.max(12, (hi - lo) * 0.12);
    lo -= pad;
    hi += pad;

    return { points: pts, peak: pk, vMin: lo, vMax: hi };
  }, [glucoseReadings, mealTime, reviewWindowEnd, now, targetLow, targetHigh, startValue]);

  const start = mealTime;
  const end = Math.min(now, reviewWindowEnd || now);
  const timeSpan = Math.max(1, end - start);
  const cW = Math.max(1, W - PAD_L - PAD_R);
  const cH = Math.max(1, CHART_H - PAD_T - PAD_B);

  const x = (t) => PAD_L + ((t - start) / timeSpan) * cW;
  const y = (v) => PAD_T + (1 - (v - vMin) / Math.max(1, vMax - vMin)) * cH;

  const bandTop = y(targetHigh);
  const bandBottom = y(targetLow);

  const path = points
    .map((p, i) => `${i ? "L" : "M"} ${x(p.time).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(" ");

  // Resolve peak value + time for badges. Prefer the provided peak (from the
  // analysis), fall back to the max point on the curve.
  const resolvedPeakValue = Number.isFinite(peakValue) ? peakValue : peak?.value;
  const resolvedPeakTime = peak && Number.isFinite(peakValue) && points.length
    ? (() => {
        // find the point nearest the provided peak value
        let best = points[0];
        for (const p of points) if (Math.abs(p.value - peakValue) < Math.abs(best.value - peakValue)) best = p;
        return best.time;
      })()
    : peak?.time;

  const hasCurve = points.length >= 2;
  const showStartBadge = Number.isFinite(startValue) && hasCurve;
  const showPeakBadge = Number.isFinite(resolvedPeakValue) && Number.isFinite(timeToPeakMin) && hasCurve;
  const showRiseBadge = Number.isFinite(deltaFromBaseline) && Math.abs(deltaFromBaseline) >= 1 && hasCurve;

  const px = Number.isFinite(resolvedPeakTime) ? x(resolvedPeakTime) : null;
  const py = Number.isFinite(resolvedPeakValue) ? y(resolvedPeakValue) : null;
  const sx = x(start);
  const sy = Number.isFinite(startValue) ? y(startValue) : null;

  const unit = glucoseUnitLabel();

  // Badge positions (clamped inside chart bounds).
  // Start badge: below-left of the start point (left edge).
  // Peak + rise badges: side-by-side above the peak point so they never
  // overlap each other or the curve below.
  const startBadge = showStartBadge && sy != null
    ? { left: clamp(sx - START_W + 6, PAD_L, W - PAD_R - START_W), top: clamp(sy + 8, PAD_T, CHART_H - PAD_B - BADGE_H) }
    : null;
  const peakBadge = showPeakBadge && px != null && py != null
    ? { left: clamp(px - PEAK_W - 2, PAD_L, W - PAD_R - PEAK_W), top: clamp(py - 8 - BADGE_H, 0, CHART_H - BADGE_H) }
    : null;
  const riseBadge = showRiseBadge && px != null && py != null
    ? { left: clamp(px + 2, PAD_L, W - PAD_R - RISE_W), top: clamp(py - 8 - BADGE_H, 0, CHART_H - BADGE_H) }
    : null;

  const startClock = formatClock(start);
  const nowClock = formatClock(end);

  if (!hasCurve) {
    return (
      <div ref={ref} className="mt-3">
        <div className="flex items-center justify-center rounded-[16px]" style={{ height: CHART_H, background: PALETTE.canvas, border: `1px solid ${PALETTE.hairline}` }}>
          <span className="text-[12px]" style={{ color: PALETTE.faint }}>Waiting for post-meal readings</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="mt-3">
      <div className="relative" style={{ height: CHART_H }}>
        <svg viewBox={`0 0 ${W} ${CHART_H}`} width={W} height={CHART_H} preserveAspectRatio="none" className="block">
          {/* Target-range band */}
          <rect
            x={PAD_L}
            y={Math.min(bandTop, bandBottom)}
            width={cW}
            height={Math.abs(bandBottom - bandTop)}
            fill={PALETTE.ink}
            fillOpacity={0.06}
          />
          {/* Dashed boundary lines */}
          <line x1={PAD_L} y1={bandTop} x2={W - PAD_R} y2={bandTop} stroke={PALETTE.ink} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="4 4" />
          <line x1={PAD_L} y1={bandBottom} x2={W - PAD_R} y2={bandBottom} stroke={PALETTE.ink} strokeOpacity={0.3} strokeWidth={1} strokeDasharray="4 4" />

          {/* Meal-time marker (dashed vertical at the left edge) */}
          <line x1={sx} y1={PAD_T} x2={sx} y2={CHART_H - PAD_B} stroke={PALETTE.ink} strokeOpacity={0.35} strokeWidth={1} strokeDasharray="3 4" />

          {/* Glucose curve */}
          <path d={path} fill="none" stroke={PALETTE.ink} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

          {/* Now dot — the last point on the curve */}
          <circle cx={x(points[points.length - 1].time)} cy={y(points[points.length - 1].value)} r={4} fill={PALETTE.ink} stroke={PALETTE.card} strokeWidth={2} />
        </svg>

        {/* "meal" label at the top of the meal marker */}
        <span
          className="absolute text-[10px] font-semibold uppercase tracking-wider"
          style={{ left: clamp(sx + 4, PAD_L, W - PAD_R - 28), top: PAD_T - 16, color: PALETTE.faint }}
        >
          meal
        </span>

        {/* Pinned value badges — only when not narrow */}
        {!isNarrow && startBadge && (
          <Badge style={startBadge} tone="neutral">
            {formatGlucose(startValue)}
          </Badge>
        )}
        {!isNarrow && peakBadge && (
          <Badge style={peakBadge} tone="peak">
            Peak {formatGlucose(resolvedPeakValue)} · +{Math.round(timeToPeakMin)}m
          </Badge>
        )}
        {!isNarrow && riseBadge && (
          <Badge style={riseBadge} tone={deltaFromBaseline > 0 ? "rise" : "drop"}>
            {formatGlucoseDelta(deltaFromBaseline)} rise
          </Badge>
        )}
      </div>

      {/* Time axis */}
      <div className="mt-1 flex items-center justify-between px-1">
        <span className="text-[10px] tabular-nums" style={{ color: PALETTE.faint }}>{startClock}</span>
        <span className="text-[10px]" style={{ color: PALETTE.faint }}>now</span>
      </div>

      {/* Narrow-screen chip row — one line, no collisions */}
      {isNarrow && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {showStartBadge && (
            <Badge tone="neutral">{formatGlucose(startValue)}</Badge>
          )}
          {showPeakBadge && (
            <Badge tone="peak">Peak {formatGlucose(resolvedPeakValue)} · +{Math.round(timeToPeakMin)}m</Badge>
          )}
          {showRiseBadge && (
            <Badge tone={deltaFromBaseline > 0 ? "rise" : "drop"}>{formatGlucoseDelta(deltaFromBaseline)} rise</Badge>
          )}
        </div>
      )}
    </div>
  );
}

function Badge({ children, style, tone = "neutral" }) {
  const color = tone === "peak" ? PALETTE.ink : tone === "rise" ? PALETTE.amber : tone === "drop" ? PALETTE.sage : PALETTE.ink;
  return (
    <span
      className="absolute whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
      style={{
        ...style,
        position: style?.top != null ? "absolute" : "relative",
        background: PALETTE.card,
        border: `1px solid ${PALETTE.hairline}`,
        color,
        boxShadow: "0 2px 6px rgba(63,56,48,0.08)",
        zIndex: 2,
      }}
    >
      {children}
    </span>
  );
}