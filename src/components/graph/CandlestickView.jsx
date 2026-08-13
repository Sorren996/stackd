import { useMemo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ComposedChart, Bar, Area, XAxis, YAxis, ReferenceLine } from "recharts";
import { format } from "date-fns";
import { ArrowUp } from "lucide-react";
import { bucketGlucoseForCandles, bucketInsulinForBars, bucketSpikes } from "@/lib/glucoseBucketing";

const HOUR_MS = 60 * 60 * 1000;
const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 250;
const INSULIN_STRIP_HEIGHT = 44;

function valueToY(value, marginTop, plotHeight) {
  const clamped = Math.min(Math.max(value, GLUCOSE_MIN), GLUCOSE_MAX);
  return marginTop + (GLUCOSE_MAX - clamped) / (GLUCOSE_MAX - GLUCOSE_MIN) * plotHeight;
}

/**
 * Custom recharts Bar shape that renders a candlestick: a rounded rect
 * spanning high-to-low with a solid dot at the average. Portions above the
 * user's target high fade to red; portions below target low fade to blue.
 */
function CandlestickShape(props) {
  const { x, width, payload, marginTop, plotHeight, targetHighY, targetLowY } = props;

  if (payload.high == null || payload.low == null) return null;

  const highY = valueToY(payload.high, marginTop, plotHeight);
  const lowY = valueToY(payload.low, marginTop, plotHeight);
  const avgY = valueToY(payload.avg, marginTop, plotHeight);

  const barWidth = Math.max(4, width * 0.5);
  const barX = x + (width - barWidth) / 2;
  const barHeight = Math.max(2, lowY - highY);
  const rx = Math.min(barWidth / 2, 4);

  const hasSpikes = (payload.spikeCount || 0) > 0;
  const neutralColor = hasSpikes ? "rgba(134,102,87,0.55)" : "rgba(54,48,61,0.6)";
  const dotColor = hasSpikes ? "#E9A284" : "#FFFFFF";

  const exceedsHigh = highY < targetHighY;
  const belowLow = lowY > targetLowY;
  const redBottom = Math.min(targetHighY, lowY);
  const blueTop = Math.max(targetLowY, highY);

  return (
    <g>
      <rect x={barX} y={highY} width={barWidth} height={barHeight} rx={rx} fill={neutralColor} />
      {exceedsHigh && redBottom > highY && (
        <rect x={barX} y={highY} width={barWidth} height={redBottom - highY} rx={rx} fill="url(#candle_high_fade)" />
      )}
      {belowLow && lowY > blueTop && (
        <rect x={barX} y={blueTop} width={barWidth} height={lowY - blueTop} rx={rx} fill="url(#candle_low_fade)" />
      )}
      <circle cx={x + width / 2} cy={avgY} r={3} fill={dotColor} />
    </g>
  );
}

function TimeAxisTick({ x, y, payload }) {
  const date = new Date(payload.value);
  if (date.getHours() % 6 !== 0) return null;
  return (
    <text x={x} y={y + 11} textAnchor="middle" fill="rgba(255,255,255,0.22)" fontSize={9} fontWeight={500}>
      {format(date, "h a")}
    </text>
  );
}

export default function CandlestickView({
  glucoseReadings,
  doses,
  spikeEvents = [],
  detectedSpikes = [],
  targetRange,
  chartWidth,
  chartHeight,
  marginTop,
  xAxisHeight,
  domainStart,
  domainEnd,
}) {
  const targetLow = targetRange.low;
  const targetHigh = targetRange.high;
  const plotHeight = chartHeight - marginTop - xAxisHeight;
  const targetHighY = valueToY(targetHigh, marginTop, plotHeight);
  const targetLowY = valueToY(targetLow, marginTop, plotHeight);

  const candleData = useMemo(
    () => bucketGlucoseForCandles(glucoseReadings, domainStart, domainEnd),
    [glucoseReadings, domainStart, domainEnd]
  );

  const insulinBuckets = useMemo(
    () => bucketInsulinForBars(doses, domainStart, domainEnd),
    [doses, domainStart, domainEnd]
  );

  const allSpikes = useMemo(() => {
    const merged = [...detectedSpikes];
    const detectedStarts = detectedSpikes.map((s) => new Date(s.startTime).getTime());
    for (const e of spikeEvents) {
      if (!e.start_time) continue;
      const eventStart = new Date(e.start_time).getTime();
      if (detectedStarts.some((ds) => Math.abs(ds - eventStart) < 5 * 60 * 1000)) continue;
      merged.push({
        startTime: e.start_time,
        riseAmount: (e.peak_glucose || 0) - (e.starting_glucose || 0),
        user_dismissed: e.user_dismissed,
        user_tagged_cause: e.user_tagged_cause,
        eventId: e.id,
      });
    }
    return merged;
  }, [detectedSpikes, spikeEvents]);

  const spikeBundles = useMemo(
    () => bucketSpikes(allSpikes, domainStart, domainEnd),
    [allSpikes, domainStart, domainEnd]
  );

  const chartData = useMemo(
    () =>
      candleData.map((candle) => {
        const spikes = spikeBundles.find((b) => b.time === candle.time);
        return { ...candle, bg: GLUCOSE_MAX, spikeCount: spikes?.count || 0 };
      }),
    [candleData, spikeBundles]
  );

  const maxInsulinUnits = useMemo(
    () => Math.max(...insulinBuckets.map((b) => b.units), 1),
    [insulinBuckets]
  );

  const timeTicks = [];
  for (let t = domainStart; t <= domainEnd; t += HOUR_MS) {
    timeTicks.push(t);
  }

  const rangeTotal = GLUCOSE_MAX - GLUCOSE_MIN;
  const highPct = ((GLUCOSE_MAX - targetHigh) / rangeTotal * 100).toFixed(1);
  const lowPct = ((GLUCOSE_MAX - targetLow) / rangeTotal * 100).toFixed(1);

  const candleCount = (domainEnd - domainStart) / HOUR_MS;
  const candleSlotWidth = chartWidth / candleCount;

  const [activeTooltip, setActiveTooltip] = useState(null);

  const handleClick = (candle, event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setActiveTooltip((prev) => (prev && prev.time === candle.time ? null : { ...candle, rect }));
  };

  useEffect(() => {
    if (!activeTooltip) return;
    const handler = (e) => {
      if (e.target.closest("[data-candle-touch]")) return;
      setActiveTooltip(null);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [activeTooltip]);

  if (!chartWidth) return null;

  return (
    <div className="relative" style={{ width: chartWidth }}>
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
            <stop offset={`${highPct}%`} stopColor="#5ba88a" stopOpacity={0.05} />
            <stop offset={`${lowPct}%`} stopColor="#5ba88a" stopOpacity={0.05} />
            <stop offset={`${lowPct}%`} stopColor="#5ba88a" stopOpacity={0} />
            <stop offset="100%" stopColor="#5ba88a" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="candle_high_fade" gradientUnits="userSpaceOnUse" x1="0" y1={marginTop} x2="0" y2={targetHighY}>
            <stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#ef4444" stopOpacity={0.08} />
          </linearGradient>
          <linearGradient id="candle_low_fade" gradientUnits="userSpaceOnUse" x1="0" y1={targetLowY} x2="0" y2={marginTop + plotHeight}>
            <stop offset="0%" stopColor="#6b92c4" stopOpacity={0.08} />
            <stop offset="100%" stopColor="#6b92c4" stopOpacity={0.5} />
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
        <YAxis yAxisId="glucose" domain={[GLUCOSE_MIN, GLUCOSE_MAX]} allowDataOverflow hide />

        <Area
          yAxisId="glucose"
          type="monotoneX"
          dataKey="bg"
          stroke="none"
          fill="url(#candle_range_grad)"
          isAnimationActive={false}
          dot={false}
        />
        <ReferenceLine yAxisId="glucose" y={targetHigh} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 4" />
        <ReferenceLine yAxisId="glucose" y={targetLow} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 4" />

        <Bar
          yAxisId="glucose"
          dataKey="high"
          shape={<CandlestickShape marginTop={marginTop} plotHeight={plotHeight} targetHighY={targetHighY} targetLowY={targetLowY} />}
          isAnimationActive={false}
        />
      </ComposedChart>

      {/* Long-press touch targets */}
      {candleData.map((candle) => {
        if (candle.high == null) return null;
        const x = ((candle.time - domainStart) / (domainEnd - domainStart)) * chartWidth;
        return (
          <div
            key={`touch_${candle.time}`}
            data-candle-touch
            className="absolute top-0 z-[25] cursor-pointer select-none"
            style={{ left: x, width: candleSlotWidth, height: chartHeight, touchAction: "none", WebkitUserSelect: "none", userSelect: "none" }}
            onClick={(e) => handleClick(candle, e)}
          />
        );
      })}

      {/* Spike bundle badges */}
      {spikeBundles
        .filter((b) => b.count > 0)
        .map((bucket) => {
          const candle = candleData.find((c) => c.time === bucket.time);
          if (!candle || candle.high == null) return null;
          const x = ((bucket.time - domainStart) / (domainEnd - domainStart)) * chartWidth + candleSlotWidth / 2;
          const highY = valueToY(candle.high, marginTop, plotHeight);
          const allHandled = bucket.spikes.every((s) => s.user_dismissed || s.user_tagged_cause);
          const badgeColor = allHandled ? "rgba(91,168,138,0.9)" : "rgba(99,77,65,0.9)";
          const iconColor = allHandled ? "rgba(91,168,138,0.9)" : "#E9A284";

          return (
            <div
              key={`spike_badge_${bucket.time}`}
              className="pointer-events-none absolute z-[26]"
              style={{ left: x, top: highY - 22, transform: "translateX(-50%)" }}
            >
              <div
                className="flex items-center gap-0.5 rounded-full px-1.5 py-0.5"
                style={{ background: badgeColor, border: `1px solid ${iconColor}40` }}
              >
                <ArrowUp className="h-2.5 w-2.5" style={{ color: iconColor }} strokeWidth={2.5} />
                {bucket.count > 1 && (
                  <span className="text-[9px] font-bold" style={{ color: iconColor }}>+{bucket.count - 1}</span>
                )}
              </div>
            </div>
          );
        })}

      {/* Insulin effort strip */}
      <div className="mt-1 flex items-end gap-px" style={{ height: INSULIN_STRIP_HEIGHT, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
        {insulinBuckets.map((bucket) => {
          const heightPct = maxInsulinUnits > 0 ? (bucket.units / maxInsulinUnits) * 100 : 0;
          return (
            <div key={`insulin_${bucket.time}`} className="flex flex-1 items-end justify-center">
              <div
                className="w-3/4 rounded-t-sm"
                style={{
                  height: `${heightPct}%`,
                  minHeight: bucket.units > 0 ? "4px" : "0",
                  background: "rgba(53,168,121,0.6)",
                  boxShadow: bucket.units > 0 ? "0 0 4px rgba(53,168,121,0.25)" : "none",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-0.5 text-center text-[9px] font-medium uppercase tracking-wider text-white/20">
        Support per hour
      </div>

      {/* Long-press tooltip */}
      {activeTooltip && activeTooltip.rect && activeTooltip.high != null && createPortal(
        <div
          className="fixed z-[200] pointer-events-none"
          style={{
            left: activeTooltip.rect.left + activeTooltip.rect.width / 2,
            top: activeTooltip.rect.top + valueToY(activeTooltip.high, marginTop, plotHeight) - 8,
            transform: "translate(-50%, -100%)",
          }}
        >
          <div
            className="rounded-xl border px-3 py-2"
            style={{
              background: "linear-gradient(165deg, rgba(18,28,23,0.97), rgba(10,16,13,0.98))",
              borderColor: "rgba(255,255,255,0.14)",
              boxShadow: "0 8px 28px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.1)",
            }}
          >
            <p className="text-[10px] font-medium text-white/40">{format(new Date(activeTooltip.time), "h:mm a")}</p>
            <p className="mt-0.5 text-sm font-bold text-white">
              {Math.round(activeTooltip.low)} – {Math.round(activeTooltip.high)}
              <span className="ml-1 text-xs font-normal text-white/40">mg/dL</span>
            </p>
            <p className="mt-0.5 text-xs text-white/60">
              Avg <span className="font-semibold text-white/80">{Math.round(activeTooltip.avg)}</span> mg/dL
            </p>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}