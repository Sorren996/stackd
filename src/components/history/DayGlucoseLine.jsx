import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { buildGlucoseSegments } from "@/lib/glucoseSeries";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";
import { GLUCOSE_STATUS_COLORS } from "@/lib/glucoseStatus";

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

const SAGE = "#5b6550";
const TICK_FILL = "#8a7f70";
const HAIRLINE = "#d8cec2";
const RUST = "#9c5228";

function Readout({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload.find((entry) => entry.value != null);
  if (!point) return null;
  return (
    <div
      className="rounded-lg px-2 py-1 text-[11px] shadow-sm"
      style={{ background: "#fdf9f2", border: "1px solid #eadccf", color: "#3f3830" }}
    >
      <span className="font-semibold tabular-nums">{formatGlucose(point.value)}</span>{" "}
      <span style={{ color: "#746959" }}>{glucoseUnitLabel()}</span>
      <span className="pl-1.5 tabular-nums" style={{ color: "#746959" }}>
        {format(new Date(point.payload.x), "h:mm a")}
      </span>
    </div>
  );
}

/**
 * One readable glucose line: the actual received readings, joined smoothly at
 * their own timestamps, broken only where a sample is genuinely missing
 * (the app's canonical gap threshold). The user's comfort zone is shaded.
 *
 * No insulin axis, no event dots — this is the single line a day or a meal
 * window is read from. `mode="meal"` adds the meal marker and before/after
 * relative time labels.
 */
export default function DayGlucoseLine({
  points,
  startMs,
  endMs,
  targetLow,
  targetHigh,
  mode = "day",
  mealMs = null,
  height = 172,
  emptyMessage = "Not enough readings to draw this yet.",
}) {
  const series = useMemo(() => {
    const inWindow = (Array.isArray(points) ? points : [])
      .map((point) => ({ time: Number(point.time), value: Number(point.value) }))
      .filter(
        (point) =>
          Number.isFinite(point.time) &&
          Number.isFinite(point.value) &&
          point.time >= startMs &&
          point.time <= endMs
      );

    const segments = buildGlucoseSegments(inWindow);

    // One dataKey per continuous run, so a run never connects across a hole.
    const rows = [];
    const lines = [];
    const singles = [];
    segments.forEach((segment, index) => {
      const key = `s${index}`;
      if (segment.length === 1) {
        singles.push(segment[0]);
        return;
      }
      lines.push(key);
      segment.forEach((point) => rows.push({ x: point.time, [key]: point.value }));
    });
    rows.sort((a, b) => a.x - b.x);

    const values = inWindow.map((point) => point.value);
    return { inWindow, rows, lines, singles, values };
  }, [points, startMs, endMs]);

  const { rows, lines, singles, values, inWindow } = series;

  if (inWindow.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-xl px-4 text-center"
        style={{ height, background: "rgba(234,220,207,0.28)" }}
      >
        <p className="text-xs leading-relaxed" style={{ color: "#746959" }}>{emptyMessage}</p>
      </div>
    );
  }

  const yMin = Math.max(40, Math.min(...values, targetLow) - 20);
  const yMax = Math.min(400, Math.max(...values, targetHigh) + 20);
  const yTicks = [
    ...new Set([yMin, Math.round(targetLow), Math.round(targetHigh), yMax].filter((v) => v >= yMin && v <= yMax)),
  ].sort((a, b) => a - b);

  const ticks = mode === "meal" && Number.isFinite(mealMs)
    ? [mealMs - 30 * MIN_MS, mealMs, mealMs + HOUR_MS, mealMs + 2 * HOUR_MS, mealMs + 3 * HOUR_MS]
    : [startMs, startMs + 6 * HOUR_MS, startMs + 12 * HOUR_MS, startMs + 18 * HOUR_MS, startMs + 24 * HOUR_MS];

  const tickLabels = mode === "meal" && Number.isFinite(mealMs)
    ? {
        [String(mealMs - 30 * MIN_MS)]: "Before",
        [String(mealMs)]: "Meal",
        [String(mealMs + HOUR_MS)]: "+1 hr",
        [String(mealMs + 2 * HOUR_MS)]: "+2 hr",
        [String(mealMs + 3 * HOUR_MS)]: "+3 hr",
      }
    : null;

  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-0 top-0 z-10 text-[9px]"
        style={{ color: TICK_FILL }}
      >
        {glucoseUnitLabel()}
      </span>
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
          <XAxis
            dataKey="x"
            type="number"
            domain={[startMs, endMs]}
            ticks={ticks}
            tickFormatter={(value) => (tickLabels ? tickLabels[String(value)] ?? "" : format(new Date(value), "h a"))}
            tick={{ fontSize: 9, fill: TICK_FILL }}
            axisLine={{ stroke: HAIRLINE }}
            tickLine={false}
            interval={0}
            dy={4}
          />
          <YAxis
            domain={[yMin, yMax]}
            ticks={yTicks}
            tick={{ fontSize: 9, fill: TICK_FILL }}
            tickFormatter={(value) => formatGlucose(value)}
            axisLine={false}
            tickLine={false}
            width={32}
            allowDecimals={false}
          />
          <ReferenceArea
            y1={targetLow}
            y2={targetHigh}
            fill={SAGE}
            fillOpacity={0.1}
            stroke="none"
          />
          <Tooltip
            content={<Readout />}
            cursor={{ stroke: HAIRLINE, strokeWidth: 1 }}
            isAnimationActive={false}
          />
          {Number.isFinite(mealMs) && (
            <ReferenceLine
              x={mealMs}
              stroke={RUST}
              strokeDasharray="2 3"
              strokeWidth={1}
              strokeOpacity={0.55}
            />
          )}
          {lines.map((key) => (
            <Line
              key={key}
              type="monotoneX"
              dataKey={key}
              stroke={SAGE}
              strokeWidth={2}
              strokeLinecap="round"
              dot={false}
              activeDot={{ r: 3, fill: SAGE, stroke: "#fdf9f2", strokeWidth: 1.5 }}
              isAnimationActive={false}
              connectNulls={false}
            />
          ))}
          {singles.map((point, index) => (
            <ReferenceDot
              key={`single_${index}`}
              x={point.time}
              y={point.value}
              r={2.5}
              fill={SAGE}
              stroke="#fdf9f2"
              strokeWidth={1}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      {values.some((value) => value < targetLow) && (
        <p className="sr-only">Some readings on this chart were below the comfort zone.</p>
      )}
    </div>
  );
}