import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ComposedChart, Bar, Area, XAxis, YAxis, ReferenceLine } from "recharts";
import { AnimatePresence, motion } from "framer-motion";
import { format } from "date-fns";
import { ArrowUp, X } from "lucide-react";
import { bucketGlucoseForCandles, bucketSpikes } from "@/lib/glucoseBucketing";
import { generateActivityCurve, getInsulinProfile, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { GLUCOSE_STATUS_COLORS, FIXED_LOW_REFERENCE } from "@/lib/glucoseStatus";
import Spike24hTooltip from "@/components/graph/Spike24hTooltip";

const HOUR_MS = 60 * 60 * 1000;
const STEP_MS = 15 * 60 * 1000;
const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 250;
const INSULIN_PLANE_HEIGHT = 82;
const SPIKE_ROW_HEIGHT = 32;
const LOWER_GAP = 4;

const PALETTE = {
  surface: "#0c1314",
  cardBg: "#151d1e",
  muted: "#8a9496",
  green: "#58a97c",
  high: "#d4a056",
  low: "#6b92c4",
  spike: "#E9A284",
};

function valueToY(value, marginTop, plotHeight, min, max) {
  const clamped = Math.min(Math.max(value, min), max);
  return marginTop + (max - clamped) / (max - min) * plotHeight;
}

function avgDotColor(avg, targetLow, targetHigh) {
  if (avg == null) return "#ffffff";
  if (avg > targetHigh) return PALETTE.high;
  if (avg < targetLow) return PALETTE.low;
  return "#ffffff";
}

/**
 * Refined hourly candlestick: a narrow rounded stem spanning high→low with a
 * crisp average dot. Only the portion above the upper target fades into the
 * high color, and only the portion below the lower target fades into the low
 * color — the rest stays neutral.
 */
function CandlestickShape(props) {
  const { x, width, payload, marginTop, plotHeight, targetHighY, targetLowY, targetLow, targetHigh, glucoseMin, glucoseMax } = props;
  if (payload.high == null || payload.low == null) return null;

  const rawHigh = payload.high;
  const rawLow = payload.low;
  const plotTop = marginTop;
  const plotBottom = marginTop + plotHeight;
  const MIN_EDGE_BODY = 8;

  // A candle whose entire range falls outside the viewport would otherwise clamp
  // to a single edge and collapse to a sliver. Pin a visible body at the edge so
  // there's always a marker, with a small cap line signalling it extends beyond.
  const entirelyAbove = rawLow > glucoseMax;
  const entirelyBelow = rawHigh < glucoseMin;

  let drawHighY = valueToY(rawHigh, marginTop, plotHeight, glucoseMin, glucoseMax);
  let drawLowY = valueToY(rawLow, marginTop, plotHeight, glucoseMin, glucoseMax);
  if (entirelyAbove) {
    drawHighY = plotTop;
    drawLowY = plotTop + MIN_EDGE_BODY;
  } else if (entirelyBelow) {
    drawLowY = plotBottom;
    drawHighY = plotBottom - MIN_EDGE_BODY;
  }

  const avgY = valueToY(payload.avg, marginTop, plotHeight, glucoseMin, glucoseMax);
  const clampedAvgY = Math.min(Math.max(avgY, plotTop), plotBottom);

  const barWidth = Math.max(5, Math.min(13, width * 0.4));
  const barX = x + (width - barWidth) / 2;
  const barHeight = Math.max(2, drawLowY - drawHighY);
  const rx = Math.min(barWidth / 2, 3);

  const exceedsHigh = drawHighY < targetHighY;
  const belowLow = drawLowY > targetLowY;
  const redBottom = Math.min(targetHighY, drawLowY);
  const blueTop = Math.max(targetLowY, drawHighY);
  const dotColor = avgDotColor(payload.avg, targetLow, targetHigh);

  return (
    <g>
      <rect x={barX} y={drawHighY} width={barWidth} height={barHeight} rx={rx} fill="rgba(58,54,66,0.5)" />
      {exceedsHigh && redBottom > drawHighY && (
        <rect x={barX} y={drawHighY} width={barWidth} height={redBottom - drawHighY} fill="url(#candle_high_fade)" />
      )}
      {belowLow && drawLowY > blueTop && (
        <rect x={barX} y={blueTop} width={barWidth} height={drawLowY - blueTop} fill="url(#candle_low_fade)" />
      )}
      <circle cx={x + width / 2} cy={clampedAvgY} r={3.4} fill={dotColor} />
      <circle cx={x + width / 2} cy={clampedAvgY} r={3.4} fill="none" stroke="rgba(12,19,20,0.7)" strokeWidth={1} />
      {entirelyAbove && (
        <line x1={barX - 1} y1={plotTop} x2={barX + barWidth + 1} y2={plotTop} stroke={PALETTE.high} strokeWidth={1.5} strokeLinecap="round" />
      )}
      {entirelyBelow && (
        <line x1={barX - 1} y1={plotBottom} x2={barX + barWidth + 1} y2={plotBottom} stroke={PALETTE.low} strokeWidth={1.5} strokeLinecap="round" />
      )}
    </g>
  );
}

function TimeAxisTick({ x, y, payload }) {
  const date = new Date(payload.value);
  if (date.getHours() % 6 !== 0) return null;
  return (
    <text x={x} y={y + 11} textAnchor="middle" fill="rgba(255,255,255,0.32)" fontSize={9} fontWeight={600} letterSpacing={0.4}>
      {format(date, "h a")}
    </text>
  );
}

function doseTime(dose) {
  return new Date(dose.administered_at || dose.created_at || dose.created_date).getTime();
}

export default function CandlestickView({
  glucoseReadings,
  doses,
  carbEntries = [],
  spikeEvents = [],
  detectedSpikes = [],
  targetRange,
  chartWidth,
  chartHeight,
  marginTop,
  xAxisHeight,
  domainStart,
  domainEnd,
  glucoseMin = 40,
  glucoseMax = 400,
  highReference = 250,
}) {
  const targetLow = targetRange.low;
  const targetHigh = targetRange.high;
  const plotHeight = chartHeight - marginTop - xAxisHeight;
  const targetHighY = valueToY(targetHigh, marginTop, plotHeight, glucoseMin, glucoseMax);
  const targetLowY = valueToY(targetLow, marginTop, plotHeight, glucoseMin, glucoseMax);

  const candleData = useMemo(
    () => bucketGlucoseForCandles(glucoseReadings, domainStart, domainEnd),
    [glucoseReadings, domainStart, domainEnd]
  );

  // Normalize every spike (client-detected or backend-tracked) into one shape
  // so the lower-plane markers and tooltip can render them uniformly.
  const allSpikes = useMemo(() => {
    const merged = detectedSpikes.map((s) => ({
      startTime: s.startTime,
      startGlucose: s.startGlucose,
      peakGlucose: s.peakGlucose,
      peakTime: s.peakTime,
      riseAmount: s.riseAmount,
      durationMinutes: s.durationMinutes,
      rateOfRise: s.rateOfRise,
      user_dismissed: s.user_dismissed,
      user_tagged_cause: s.user_tagged_cause,
      eventId: s.eventId || null,
    }));
    const detectedStarts = detectedSpikes.map((s) => new Date(s.startTime).getTime());
    for (const e of spikeEvents) {
      if (!e.start_time) continue;
      const eventStart = new Date(e.start_time).getTime();
      if (detectedStarts.some((ds) => Math.abs(ds - eventStart) < 5 * 60 * 1000)) continue;
      merged.push({
        startTime: e.start_time,
        startGlucose: e.starting_glucose,
        peakGlucose: e.peak_glucose,
        peakTime: e.peak_time || e.end_time,
        riseAmount: (e.peak_glucose || 0) - (e.starting_glucose || 0),
        durationMinutes: e.duration_minutes,
        rateOfRise: e.rate_of_rise,
        user_dismissed: e.user_dismissed,
        user_tagged_cause: e.user_tagged_cause,
        eventId: e.id,
      });
    }
    return merged;
  }, [detectedSpikes, spikeEvents]);

  // Hourly bundles: spikes within the same hour are grouped (≈2–3 typically).
  const spikeBundles = useMemo(
    () => bucketSpikes(allSpikes, domainStart, domainEnd).filter((b) => b.count > 0),
    [allSpikes, domainStart, domainEnd]
  );

  const chartData = useMemo(
    () => candleData.map((candle) => ({ ...candle, bg: glucoseMax })),
    [candleData, glucoseMax]
  );

  // Insulin pharmacokinetic activity curves, compressed for the 24h scale.
  const insulinCurves = useMemo(
    () =>
      (doses || [])
        .map((dose, i) => {
          const curve = generateActivityCurve(dose, 15);
          if (!curve.length) return null;
          const units = Number(dose.units) || 0;
          if (!units) return null;
          const isBasal = isBasalInsulinType(dose.insulin_type);
          const profile = getInsulinProfile(dose.insulin_type);
          return {
            key: `c24dose_${i}`,
            dose,
            curve,
            units,
            isBasal,
            color: profile?.color || "#5ba3b8",
          };
        })
        .filter(Boolean),
    [doses]
  );

  const maxBolusUnits = useMemo(
    () => Math.max(...insulinCurves.filter((d) => !d.isBasal).map((d) => d.units), 1),
    [insulinCurves]
  );
  const maxBasalUnits = useMemo(
    () => Math.max(...insulinCurves.filter((d) => d.isBasal).map((d) => d.units), 1),
    [insulinCurves]
  );

  const insulinData = useMemo(() => {
    const points = [];
    for (let t = domainStart; t <= domainEnd; t += STEP_MS) {
      const point = { time: t };
      insulinCurves.forEach(({ key, curve, units, isBasal }) => {
        let activity = 0;
        if (curve.length && t >= curve[0].time && t <= curve[curve.length - 1].time) {
          let lo = 0;
          for (let j = 0; j < curve.length - 1; j++) {
            if (curve[j].time <= t && curve[j + 1].time >= t) {
              lo = j;
              break;
            }
          }
          const hi = Math.min(lo + 1, curve.length - 1);
          const span = curve[hi].time - curve[lo].time;
          const ratio = span > 0 ? (t - curve[lo].time) / span : 0;
          activity = curve[lo].activity + (curve[hi].activity - curve[lo].activity) * ratio;
        }
        const refMax = isBasal ? maxBasalUnits : maxBolusUnits;
        const visualMax = isBasal ? 30 : 70;
        point[key] = activity * (units / refMax) * visualMax;
      });
      points.push(point);
    }
    return points;
  }, [insulinCurves, domainStart, domainEnd, maxBolusUnits, maxBasalUnits]);

  const doseKeys = useMemo(
    () => insulinCurves.map((dc) => ({ key: dc.key, color: dc.color, isBasal: dc.isBasal })),
    [insulinCurves]
  );

  const timeTicks = [];
  for (let t = domainStart; t <= domainEnd; t += HOUR_MS) {
    timeTicks.push(t);
  }

  const rangeTotal = glucoseMax - glucoseMin;
  const highPct = ((glucoseMax - targetHigh) / rangeTotal * 100).toFixed(1);
  const lowPct = ((glucoseMax - targetLow) / rangeTotal * 100).toFixed(1);

  const candleCount = (domainEnd - domainStart) / HOUR_MS;
  const candleSlotWidth = chartWidth / candleCount;
  const totalMs = domainEnd - domainStart;

  // Collision-aware spike rail: place each bundle at its timestamp, stagger into
  // two compact lanes when neighbors overlap, and only locally bundle when both
  // lanes are full — so repeated spikes stay readable without giant bundles.
  const positionedSpikeChips = useMemo(() => {
    const sorted = [...spikeBundles].sort((a, b) => a.time - b.time);
    const chips = [];
    const laneRightEdge = [-Infinity, -Infinity];
    const GAP = 2;
    const chipWidth = (count) => 22 + (count > 1 ? 14 + String(count - 1).length * 6 : 0);

    for (const bundle of sorted) {
      const x = ((bundle.time - domainStart) / totalMs) * chartWidth + candleSlotWidth / 2;
      const w = chipWidth(bundle.spikes.length);
      let placed = false;
      for (let lane = 0; lane < 2; lane++) {
        if (x - w / 2 >= laneRightEdge[lane] + GAP) {
          chips.push({ ...bundle, x, lane, w });
          laneRightEdge[lane] = x + w / 2;
          placed = true;
          break;
        }
      }
      if (!placed) {
        const last = chips[chips.length - 1];
        if (last) {
          last.spikes = [...last.spikes, ...bundle.spikes];
          last.maxRise = Math.max(last.maxRise || 0, bundle.maxRise || 0);
          last.w = chipWidth(last.spikes.length);
        } else {
          chips.push({ ...bundle, x, lane: 0, w });
          laneRightEdge[0] = x + w / 2;
        }
      }
    }
    return chips;
  }, [spikeBundles, domainStart, totalMs, chartWidth, candleSlotWidth]);

  const [activeTooltip, setActiveTooltip] = useState(null);
  const [spikeBundle, setSpikeBundle] = useState(null);

  const buildCandleTooltip = (candle, rect) => {
    const start = candle.time;
    const end = start + HOUR_MS;
    const hourValues = (glucoseReadings || [])
      .filter((r) => r.time >= start && r.time < end)
      .map((r) => Number(r.value))
      .filter((v) => Number.isFinite(v));
    const inRange = hourValues.filter((v) => v >= targetLow && v <= targetHigh).length;
    const tir = hourValues.length ? Math.round((inRange / hourValues.length) * 100) : null;
    const hourDoses = (doses || []).filter((d) => {
      const t = doseTime(d);
      return t >= start && t < end;
    });
    const hourCarbs = (carbEntries || []).filter((c) => {
      const t = new Date(c.consumed_at || c.created_date).getTime();
      return t >= start && t < end;
    });
    return { ...candle, rect, tir, readingCount: hourValues.length, hourDoses, hourCarbs };
  };

  const handleClick = (candle, event) => {
    if (candle.high == null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setActiveTooltip((prev) => (prev && prev.time === candle.time ? null : buildCandleTooltip(candle, rect)));
  };

  useEffect(() => {
    if (!activeTooltip) return;
    const handler = (e) => {
      if (e.target.closest("[data-candle-touch]")) return;
      setActiveTooltip(null);
    };
    const onEsc = (e) => e.key === "Escape" && setActiveTooltip(null);
    document.addEventListener("pointerdown", handler);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("pointerdown", handler);
      document.removeEventListener("keydown", onEsc);
    };
  }, [activeTooltip]);

  if (!chartWidth) return null;

  const lowerTop = chartHeight + LOWER_GAP;

  return (
    <div className="relative" style={{ width: chartWidth }}>
      {/* ── UPPER PLANE: hourly glucose candlesticks ── */}
      <ComposedChart
        width={chartWidth}
        height={chartHeight}
        data={chartData}
        margin={{ top: marginTop, right: 0, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id="candle_range_grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5ba88a" stopOpacity={0} />
            <stop offset={`${highPct}%`} stopColor="#5ba88a" stopOpacity={0} />
            <stop offset={`${highPct}%`} stopColor="#5ba88a" stopOpacity={0.04} />
            <stop offset={`${lowPct}%`} stopColor="#5ba88a" stopOpacity={0.04} />
            <stop offset={`${lowPct}%`} stopColor="#5ba88a" stopOpacity={0} />
            <stop offset="100%" stopColor="#5ba88a" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="candle_high_fade" gradientUnits="userSpaceOnUse" x1="0" y1={marginTop} x2="0" y2={targetHighY}>
            <stop offset="0%" stopColor="#d4a056" stopOpacity={0.55} />
            <stop offset="100%" stopColor="#d4a056" stopOpacity={0.06} />
          </linearGradient>
          <linearGradient id="candle_low_fade" gradientUnits="userSpaceOnUse" x1="0" y1={targetLowY} x2="0" y2={marginTop + plotHeight}>
            <stop offset="0%" stopColor={GLUCOSE_STATUS_COLORS.low} stopOpacity={0.06} />
            <stop offset="100%" stopColor={GLUCOSE_STATUS_COLORS.low} stopOpacity={0.55} />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="time"
          type="number"
          domain={[domainStart, domainEnd]}
          ticks={timeTicks}
          tick={<TimeAxisTick />}
          axisLine={false}
          tickLine={false}
          height={xAxisHeight}
          interval={0}
        />
        <YAxis yAxisId="glucose" domain={[glucoseMin, glucoseMax]} allowDataOverflow hide />

        <Area yAxisId="glucose" type="monotoneX" dataKey="bg" stroke="none" fill="url(#candle_range_grad)" isAnimationActive={false} dot={false} />
        <ReferenceLine yAxisId="glucose" y={targetHigh} stroke="rgba(255,255,255,0.16)" strokeWidth={1} strokeDasharray="3 5" />
        <ReferenceLine yAxisId="glucose" y={targetLow} stroke="rgba(255,255,255,0.16)" strokeWidth={1} strokeDasharray="3 5" />
        <ReferenceLine
          yAxisId="glucose"
          y={highReference}
          stroke={GLUCOSE_STATUS_COLORS.high}
          strokeOpacity={0.45}
          strokeWidth={1}
          strokeDasharray="6 5"
          label={{ value: `High ${highReference}`, position: "insideTopRight", fill: GLUCOSE_STATUS_COLORS.high, fontSize: 9, opacity: 0.7 }}
        />
        <ReferenceLine
          yAxisId="glucose"
          y={FIXED_LOW_REFERENCE}
          stroke={GLUCOSE_STATUS_COLORS.low}
          strokeOpacity={0.4}
          strokeWidth={1}
          strokeDasharray="6 5"
          label={{ value: `${FIXED_LOW_REFERENCE}`, position: "insideBottomRight", fill: GLUCOSE_STATUS_COLORS.low, fontSize: 9, opacity: 0.65 }}
        />

        <Bar
          yAxisId="glucose"
          dataKey="high"
          shape={<CandlestickShape marginTop={marginTop} plotHeight={plotHeight} targetHighY={targetHighY} targetLowY={targetLowY} targetLow={targetLow} targetHigh={targetHigh} glucoseMin={glucoseMin} glucoseMax={glucoseMax} />}
          isAnimationActive={false}
        />
      </ComposedChart>

      {/* Touch targets for candle tooltips */}
      {candleData.map((candle) => {
        if (candle.high == null) return null;
        const x = ((candle.time - domainStart) / totalMs) * chartWidth;
        return (
          <div
            key={`touch_${candle.time}`}
            data-candle-touch
            className="absolute z-[25] cursor-pointer select-none"
            style={{ left: x, width: candleSlotWidth, top: 0, height: chartHeight, touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
            onClick={(e) => handleClick(candle, e)}
          />
        );
      })}

      {/* ── LOWER PLANE: insulin activity ── */}
      <div className="absolute left-0 right-0" style={{ top: lowerTop }}>
        <ComposedChart
          width={chartWidth}
          height={INSULIN_PLANE_HEIGHT}
          data={insulinData}
          margin={{ top: 6, right: 0, left: 0, bottom: 0 }}
        >
          <defs>
            {doseKeys.map((k) => (
              <linearGradient key={`c24_insulin_${k.key}`} id={`c24_insulin_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={k.color} stopOpacity={0.7} />
                <stop offset="100%" stopColor={k.color} stopOpacity={0.12} />
              </linearGradient>
            ))}
          </defs>
          <XAxis dataKey="time" type="number" domain={[domainStart, domainEnd]} ticks={timeTicks} tick={false} axisLine={false} tickLine={false} height={0} interval={0} />
          <YAxis yAxisId="insulin" domain={[0, 75]} hide />
          {doseKeys.filter((k) => k.isBasal).map((k) => (
            <Area key={k.key} yAxisId="insulin" type="basis" dataKey={k.key} stroke={k.color} strokeWidth={1} strokeOpacity={0.32} fill={`url(#c24_insulin_${k.key})`} fillOpacity={0.18} dot={false} activeDot={false} isAnimationActive={false} />
          ))}
          {doseKeys.filter((k) => !k.isBasal).map((k) => (
            <Area key={k.key} yAxisId="insulin" type="basis" dataKey={k.key} stroke={k.color} strokeWidth={1} strokeOpacity={0.4} fill={`url(#c24_insulin_${k.key})`} fillOpacity={0.22} dot={false} activeDot={false} isAnimationActive={false} />
          ))}
        </ComposedChart>
      </div>

      {/* ── SPIKE EVENTS: compact markers beneath the timeline ── */}
      <div className="absolute left-0 right-0" style={{ top: lowerTop + INSULIN_PLANE_HEIGHT + 2, height: SPIKE_ROW_HEIGHT }}>
        {positionedSpikeChips.map((chip, i) => {
          const count = chip.spikes.length;
          const allHandled = chip.spikes.every((s) => s.user_dismissed || s.user_tagged_cause);
          const chipColor = allHandled ? PALETTE.green : PALETTE.spike;
          return (
            <button
              key={`spike_${i}`}
              type="button"
              onClick={(e) => { e.stopPropagation(); setSpikeBundle(chip); }}
              className="absolute flex items-center gap-0.5 rounded-full px-1.5 py-0.5 backdrop-blur-sm transition hover:brightness-125"
              style={{ left: chip.x, top: chip.lane === 0 ? 2 : 16, transform: "translateX(-50%)", background: "rgba(10,16,14,0.7)", border: `1px solid ${chipColor}40` }}
            >
              <ArrowUp className="h-2.5 w-2.5" style={{ color: chipColor }} strokeWidth={2.5} />
              {count > 1 && <span className="text-[9px] font-bold" style={{ color: chipColor }}>+{count - 1}</span>}
            </button>
          );
        })}
      </div>

      {/* ── Candlestick tooltip ── */}
      {activeTooltip && activeTooltip.rect && activeTooltip.high != null && createPortal(
        (() => {
          const tipW = 210;
          let left = activeTooltip.rect.left + activeTooltip.rect.width / 2 - tipW / 2;
          left = Math.max(8, Math.min(left, window.innerWidth - tipW - 8));
          const top = activeTooltip.rect.top + valueToY(activeTooltip.high, marginTop, plotHeight, glucoseMin, glucoseMax) - 8;
          const openBelow = top - 110 < 0;
          const hourStart = activeTooltip.time;
          const hourEnd = hourStart + HOUR_MS;
          const doseUnits = activeTooltip.hourDoses.reduce((s, d) => s + (Number(d.units) || 0), 0);
          const carbGrams = activeTooltip.hourCarbs.reduce((s, c) => s + (Number(c.carbs) || 0), 0);
          return (
            <div className="fixed z-[200]" style={{ left, top: openBelow ? activeTooltip.rect.bottom + 8 : top, transform: openBelow ? "none" : "translateY(-100%)" }}>
              <div className="rounded-2xl border p-3" style={{ width: tipW, background: "linear-gradient(165deg, rgba(18,28,23,0.98), rgba(10,16,13,0.99))", borderColor: "rgba(255,255,255,0.12)", boxShadow: "0 18px 50px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Hourly glucose</p>
              <p className="mt-0.5 text-[11px] font-medium text-white/55">{format(hourStart, "h a")} – {format(hourEnd, "h a")}</p>
              <div className="mt-2 flex items-end justify-between">
                <div>
                  <p className="text-[10px] text-white/40">Range</p>
                  <p className="text-base font-bold text-white">{Math.round(activeTooltip.low)}–{Math.round(activeTooltip.high)}<span className="ml-1 text-[10px] font-normal text-white/40">mg/dL</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/40">Average</p>
                  <p className="text-base font-bold" style={{ color: avgDotColor(activeTooltip.avg, targetLow, targetHigh) }}>{Math.round(activeTooltip.avg)}</p>
                </div>
              </div>
              {activeTooltip.tir != null && (
                <div className="mt-2 flex items-center justify-between border-t border-white/8 pt-2">
                  <span className="text-[10px] text-white/40">Time in comfort zone</span>
                  <span className="text-[11px] font-semibold text-white/80">{activeTooltip.tir}%</span>
                </div>
              )}
              {(doseUnits > 0 || carbGrams > 0) && (
                <div className="mt-2 flex flex-wrap gap-1.5 border-t border-white/8 pt-2">
                  {doseUnits > 0 && <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-300/80">{doseUnits.toFixed(doseUnits % 1 ? 1 : 0)}u support</span>}
                  {carbGrams > 0 && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300/80">{Math.round(carbGrams)}g nourishment</span>}
                </div>
              )}
              </div>
            </div>
          );
        })(),
        document.body
      )}

      {/* ── Spike tooltip modal ── */}
      <AnimatePresence>
        {spikeBundle && (
          <Spike24hTooltip bundle={spikeBundle} doses={doses} carbEntries={carbEntries} onClose={() => setSpikeBundle(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}