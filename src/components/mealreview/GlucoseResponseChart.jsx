import { useEffect, useMemo, useRef, useState } from "react";
import { formatGlucose } from "@/lib/glucoseUnits";
import { buildGlucoseSegments } from "@/lib/glucoseSeries";
import { monotoneXPath } from "@/lib/monotonePath";
import { generateActivityCurve, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { MR } from "./mealReviewTheme";

// Card 1's chart. Same received readings, same window, same start anchor as
// before — only the drawing changed: the target range is shaded with sage
// boundaries and small range labels, the run of readings is drawn as one
// smooth line that breaks where a sample is genuinely missing, and the meal's
// own logged doses appear softly underneath.

const H = 214;
const PAD_T = 30;
const PAD_B = 32;
const PAD_X = 16;
const INSULIN_SHARE = 0.42; // fraction of the plot the soft dose curves use

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

function fmtUnits(units) {
  const n = Number(units);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

export default function GlucoseResponseChart({
  glucoseReadings,
  mealTime,
  reviewWindowEnd,
  now,
  targetLow = 70,
  targetHigh = 180,
  startValue,
  peakValue,
  timeToPeakMin,
  doses = [],
}) {
  const [ref, width] = useContainerWidth();
  const W = width || 330;

  const { segments, peakPoint, domain, end } = useMemo(() => {
    const windowEnd = Math.min(now, reviewWindowEnd || now);
    const raw = (Array.isArray(glucoseReadings) ? glucoseReadings : [])
      .map((r) => ({ time: new Date(r.recorded_at).getTime(), value: Number(r.value) }))
      .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value) && r.time >= mealTime && r.time <= windowEnd)
      .sort((a, b) => a.time - b.time);

    const points = [];
    if (Number.isFinite(startValue) && raw.length) {
      points.push({ time: mealTime, value: Number(startValue) });
    }
    raw.forEach((r) => {
      if (!points.length || r.time > points[points.length - 1].time) points.push(r);
    });

    // The peak marker sits on the reading nearest the analysis' peak value,
    // exactly as the previous chart resolved it.
    let near = null;
    if (points.length && Number.isFinite(peakValue)) {
      near = points[0];
      for (const p of points) {
        if (Math.abs(p.value - peakValue) < Math.abs(near.value - peakValue)) near = p;
      }
    }

    const values = points.map((p) => p.value);
    let lo = values.length ? Math.min(...values, targetLow) : targetLow;
    let hi = values.length ? Math.max(...values, targetHigh) : targetHigh;
    const pad = Math.max(12, (hi - lo) * 0.12);
    lo -= pad;
    hi += pad;

    return {
      segments: buildGlucoseSegments(points),
      peakPoint: near,
      domain: { min: lo, max: hi },
      end: windowEnd,
    };
  }, [glucoseReadings, mealTime, reviewWindowEnd, now, targetLow, targetHigh, startValue, peakValue]);

  const plotW = Math.max(1, W - PAD_X * 2);
  const plotH = Math.max(1, H - PAD_T - PAD_B);
  const span = Math.max(1, end - mealTime);

  const x = (t) => PAD_X + ((t - mealTime) / span) * plotW;
  const y = (v) =>
    PAD_T + (1 - (v - domain.min) / Math.max(1, domain.max - domain.min)) * plotH;

  const bandTop = y(targetHigh);
  const bandBottom = y(targetLow);
  const baseY = PAD_T + plotH;

  const totalPoints = segments.reduce((sum, segment) => sum + segment.length, 0);
  const hasCurve = totalPoints >= 2;

  // Soft dose curves for the meal's own logged bolus doses.
  const insulinCurves = useMemo(() => {
    if (!hasCurve) return [];
    const list = (Array.isArray(doses) ? doses : [])
      .filter((dose) => dose && !isBasalInsulinType(dose.insulin_type) && Number(dose.units) > 0);
    if (!list.length) return [];
    const maxUnits = Math.max(...list.map((dose) => Number(dose.units) || 0), 1);

    return list
      .map((dose, index) => {
        const curve = generateActivityCurve(
          { insulin_type: dose.insulin_type, units: Number(dose.units), administered_at: dose.administered_at },
          5
        );
        const visible = curve.filter((p) => p.time >= mealTime && p.time <= end);
        if (visible.length < 2) return null;

        const scale = (Number(dose.units) || 0) / maxUnits;
        const height = plotH * INSULIN_SHARE;
        const points = visible.map((p) => ({
          x: x(p.time),
          y: baseY - Math.max(0, Math.min(1, p.activity || 0)) * scale * height,
        }));
        const apex = points.reduce((best, p) => (p.y < best.y ? p : best), points[0]);
        return {
          key: dose.id || `dose-${index}`,
          units: Number(dose.units),
          line: monotoneXPath(points),
          area: `${monotoneXPath(points)} L ${points[points.length - 1].x.toFixed(1)} ${baseY.toFixed(
            1
          )} L ${points[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`,
          labelX: apex.x,
          labelY: Math.max(PAD_T + 8, apex.y - 5),
        };
      })
      .filter(Boolean);
  }, [doses, hasCurve, mealTime, end, plotH, baseY]);

  if (!hasCurve) {
    return (
      <div ref={ref} className="px-4 pb-1">
        <div
          className="flex items-center justify-center"
          style={{ height: H, background: MR.band, borderRadius: 24, border: `1px solid ${MR.border}` }}
        >
          <span style={{ fontSize: 12, color: MR.sec }}>Waiting for post-meal readings</span>
        </div>
      </div>
    );
  }

  const lastPoint = segments[segments.length - 1].slice(-1)[0];
  const startClock = formatClock(mealTime);
  const showPeak = Number.isFinite(peakValue) && Number.isFinite(timeToPeakMin) && peakPoint;
  const peakX = showPeak ? x(peakPoint.time) : null;
  const peakY = showPeak ? y(peakPoint.value) : null;
  const peakLabel = showPeak ? `peak ${formatGlucose(peakValue)} · ${Math.round(timeToPeakMin)} min` : "";
  const peakLabelLeft = peakX == null ? 0 : Math.min(Math.max(peakX, 74), W - 74);

  return (
    <div ref={ref}>
      <div className="relative">
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

          {/* Soft dose curves — modeled, labelled as such under the chart */}
          {insulinCurves.map((curve) => (
            <g key={curve.key}>
              <path d={curve.area} fill={MR.insulin} fillOpacity={0.10} stroke="none" />
              <path d={curve.line} fill="none" stroke={MR.insulin} strokeOpacity={0.4} strokeWidth={1.25} />
            </g>
          ))}

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

          {/* Start — open circle */}
          {Number.isFinite(startValue) && (
            <circle
              cx={x(mealTime)}
              cy={y(Number(startValue))}
              r={4}
              fill={MR.card}
              stroke={MR.ink}
              strokeWidth={1.75}
            />
          )}

          {/* Peak — open circle */}
          {showPeak && (
            <circle cx={peakX} cy={peakY} r={4} fill={MR.card} stroke={MR.ink} strokeWidth={1.75} />
          )}

          {/* Now — filled rust dot */}
          <circle cx={x(lastPoint.time)} cy={y(lastPoint.value)} r={4.5} fill={MR.rust} stroke={MR.card} strokeWidth={2} />
        </svg>

        {/* Peak label, above the peak point */}
        {showPeak && (
          <span
            className="absolute whitespace-nowrap tabular-nums"
            style={{
              left: peakLabelLeft,
              top: Math.max(0, peakY - 22),
              transform: "translateX(-50%)",
              fontSize: 10,
              fontWeight: 600,
              color: MR.ink,
            }}
          >
            {peakLabel}
          </span>
        )}

        {/* Dose labels sit above their own soft curve */}
        {insulinCurves.map((curve) => (
          <span
            key={`label-${curve.key}`}
            className="absolute whitespace-nowrap tabular-nums"
            style={{
              left: Math.min(Math.max(curve.labelX, 26), W - 26),
              top: curve.labelY,
              transform: "translateX(-50%)",
              fontSize: 9,
              fontWeight: 600,
              color: MR.rustDeep,
              opacity: 0.85,
            }}
          >
            {fmtUnits(curve.units)}u dose
          </span>
        ))}
      </div>

      <div className="flex items-center justify-between px-[18px] pt-1">
        <span className="tabular-nums" style={{ fontSize: 10, color: MR.sec }}>{startClock}</span>
        <span style={{ fontSize: 10, color: MR.sec }}>now</span>
      </div>

      {insulinCurves.length > 0 && (
        <div className="px-[18px] pt-1.5" style={{ fontSize: 10, color: MR.sec }}>
          Dose curve · Our best guess
        </div>
      )}
    </div>
  );
}