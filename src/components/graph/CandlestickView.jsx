import { useMemo } from "react";
import { ComposedChart, Bar, XAxis, YAxis, ReferenceLine } from "recharts";
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
 * spanning high-to-low with a solid dot at the average. Candles that contain
 * spikes are highlighted in warm terracotta to match the reference design.
 */
function CandlestickShape(props) {
  const { x, width, payload, marginTop, plotHeight } = props;

  if (payload.high == null || payload.low == null) return null;

  const highY = valueToY(payload.high, marginTop, plotHeight);
  const lowY = valueToY(payload.low, marginTop, plotHeight);
  const avgY = valueToY(payload.avg, marginTop, plotHeight);

  const barWidth = Math.max(4, width * 0.5);
  const barX = x + (width - barWidth) / 2;
  const barHeight = Math.max(2, lowY - highY);

  const hasSpikes = (payload.spikeCount || 0) > 0;
  const barColor = hasSpikes ? "rgba(134,102,87,0.55)" : "rgba(54,48,61,0.6)";
  const dotColor = hasSpikes ? "#E9A284" : "#FFFFFF";

  return (
    <g>
      <rect x={barX} y={highY} width={barWidth} height={barHeight} rx={Math.min(barWidth / 2, 4)} fill={barColor} />
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
  containerWidth,
  chartHeight,
  marginTop,
  xAxisHeight,
}) {
  const targetLow = targetRange.low;
  const targetHigh = targetRange.high;
  const plotHeight = chartHeight - marginTop - xAxisHeight;

  const now = Date.now();
  const domainStart = Math.floor(now / HOUR_MS) * HOUR_MS - 23 * HOUR_MS;
  const domainEnd = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS;

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
        return { ...candle, spikeCount: spikes?.count || 0 };
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

  if (!containerWidth) return null;

  return (
    <div className="relative" style={{ width: containerWidth }}>
      {/* Target range labels */}
      <div className="pointer-events-none absolute right-0 top-0 z-20" style={{ height: chartHeight }}>
        <span
          className="absolute right-0 text-[9px] font-medium leading-none text-white/25"
          style={{ top: valueToY(targetHigh, marginTop, plotHeight), transform: "translateY(-120%)" }}
        >
          {Math.round(targetHigh)}
        </span>
        <span
          className="absolute right-0 text-[9px] font-medium leading-none text-white/25"
          style={{ top: valueToY(targetLow, marginTop, plotHeight), transform: "translateY(20%)" }}
        >
          {Math.round(targetLow)}
        </span>
      </div>

      <ComposedChart
        width={containerWidth}
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

        <ReferenceLine yAxisId="glucose" y={targetHigh} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 4" />
        <ReferenceLine yAxisId="glucose" y={targetLow} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 4" />

        <Bar
          yAxisId="glucose"
          dataKey="high"
          shape={<CandlestickShape marginTop={marginTop} plotHeight={plotHeight} />}
          isAnimationActive={false}
        />
      </ComposedChart>

      {/* Spike bundle badges */}
      {spikeBundles
        .filter((b) => b.count > 0)
        .map((bucket) => {
          const candle = candleData.find((c) => c.time === bucket.time);
          if (!candle || candle.high == null) return null;
          const bucketWidth = containerWidth / 24;
          const x = ((bucket.time - domainStart) / (domainEnd - domainStart)) * containerWidth + bucketWidth / 2;
          const highY = valueToY(candle.high, marginTop, plotHeight);
          const allHandled = bucket.spikes.every((s) => s.user_dismissed || s.user_tagged_cause);
          const badgeColor = allHandled ? "rgba(91,168,138,0.9)" : "rgba(99,77,65,0.9)";
          const iconColor = allHandled ? "rgba(91,168,138,0.9)" : "#E9A284";

          return (
            <div
              key={`spike_badge_${bucket.time}`}
              className="pointer-events-none absolute z-[15]"
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
      <div className="mt-1 flex items-end gap-px" style={{ height: INSULIN_STRIP_HEIGHT }}>
        {insulinBuckets.map((bucket) => {
          const heightPct = maxInsulinUnits > 0 ? (bucket.units / maxInsulinUnits) * 100 : 0;
          return (
            <div key={`insulin_${bucket.time}`} className="flex flex-1 items-end justify-center">
              <div
                className="w-1/2 rounded-t-sm"
                style={{
                  height: `${heightPct}%`,
                  minHeight: bucket.units > 0 ? "3px" : "0",
                  background: "rgba(53,168,121,0.35)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-0.5 text-center text-[9px] font-medium uppercase tracking-wider text-white/20">
        Support per hour
      </div>
    </div>
  );
}