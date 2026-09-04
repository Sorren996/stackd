import { useMemo } from "react";
import {
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ReferenceDot,
  YAxis,
  XAxis,
  ResponsiveContainer,
} from "recharts";
import { GLUCOSE_STATUS_COLORS } from "@/lib/glucoseStatus";
import { getInsulinProfile } from "@/lib/insulinPharmacology";
import { minutesOfDay, getGlucoseAt } from "@/lib/dayRecapMetrics";

const HOUR = 60;
const DAY_MIN = 24 * 60;

function Legend({ color, label, ring }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="inline-block h-2.5 w-2.5 rounded-full"
        style={ring ? { background: "transparent", border: `1.5px solid ${color}` } : { background: color }}
      />
      <span className="text-[10px] font-medium text-white/45">{label}</span>
    </span>
  );
}

export default function DayRecapGraph({ glucose, carbs, insulin, targetLow, targetHigh }) {
  const readings = useMemo(
    () =>
      (glucose || [])
        .map((g) => ({
          time: new Date(g.recorded_at).getTime(),
          value: Number(g.value),
          source: g.source,
        }))
        .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
        .sort((a, b) => a.time - b.time),
    [glucose]
  );

  if (readings.length < 2) {
    return (
      <div
        className="flex h-[180px] items-center justify-center rounded-2xl border"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))",
          borderColor: "rgba(255,255,255,0.10)",
        }}
      >
        <p className="text-xs text-white/40">Not enough glucose data to chart this day</p>
      </div>
    );
  }

  const data = readings.map((r) => ({ x: minutesOfDay(r.time), value: r.value }));
  const values = readings.map((r) => r.value);
  const yMin = Math.max(40, Math.min(...values) - 20);
  const yMax = Math.min(400, Math.max(...values, targetHigh) + 20);
  const ticks = [0, 6 * HOUR, 12 * HOUR, 18 * HOUR, DAY_MIN];

  const insulinDots = (insulin || [])
    .map((d) => {
      const t = new Date(d.administered_at).getTime();
      const x = minutesOfDay(t);
      if (x == null) return null;
      const y = getGlucoseAt(readings, t);
      if (y == null) return null;
      return { x, y, color: getInsulinProfile(d.insulin_type)?.color || "#5ba3b8" };
    })
    .filter(Boolean);

  const carbDots = (carbs || [])
    .map((c) => {
      const t = new Date(c.consumed_at).getTime();
      const x = minutesOfDay(t);
      if (x == null) return null;
      const y = getGlucoseAt(readings, t);
      if (y == null) return null;
      return { x, y };
    })
    .filter(Boolean);

  const manualDots = readings
    .filter((r) => r.source !== "dexcom" && r.source !== "dexcom_share" && r.source !== "system")
    .map((r) => ({ x: minutesOfDay(r.time), y: r.value }));

  return (
    <div
      className="rounded-2xl border p-3"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))",
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 10, right: 8, left: 8, bottom: 4 }}>
          <defs>
            <linearGradient id="dayGlucoseGrad" x1="0" y1={0} x2="0" y2={1}>
              <stop offset="0%" stopColor={GLUCOSE_STATUS_COLORS.high} stopOpacity={0.85} />
              <stop offset="50%" stopColor="#ffffff" stopOpacity={0.85} />
              <stop offset="100%" stopColor={GLUCOSE_STATUS_COLORS.low} stopOpacity={0.85} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="x"
            type="number"
            domain={[0, DAY_MIN]}
            ticks={ticks}
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
            tickFormatter={(v) => {
              const h = Math.floor(v / 60);
              const ampm = h >= 12 ? "p" : "a";
              const hr = h % 12 === 0 ? 12 : h % 12;
              return `${hr}${ampm}`;
            }}
            axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
            tickLine={false}
          />
          <YAxis domain={[yMin, yMax]} hide />
          <ReferenceArea y1={targetLow} y2={targetHigh} fill="#5ba88a" fillOpacity={0.06} />
          <ReferenceLine y={targetHigh} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 4" />
          <ReferenceLine y={targetLow} stroke="rgba(255,255,255,0.18)" strokeDasharray="3 4" />
          <Line
            type="monotone"
            dataKey="value"
            stroke="url(#dayGlucoseGrad)"
            strokeWidth={2.2}
            dot={false}
            isAnimationActive={false}
            connectNulls
          />
          {carbDots.map((d, i) => (
            <ReferenceDot
              key={`carb_${i}`}
              x={d.x}
              y={d.y}
              r={4}
              fill="#f59e0b"
              stroke="rgba(15,20,18,0.9)"
              strokeWidth={1}
            />
          ))}
          {insulinDots.map((d, i) => (
            <ReferenceDot
              key={`ins_${i}`}
              x={d.x}
              y={d.y}
              r={4}
              fill={d.color}
              stroke="rgba(15,20,18,0.9)"
              strokeWidth={1}
            />
          ))}
          {manualDots.map((d, i) => (
            <ReferenceDot
              key={`man_${i}`}
              x={d.x}
              y={d.y}
              r={3.5}
              fill={GLUCOSE_STATUS_COLORS.inRange}
              stroke="#ffffff"
              strokeWidth={1.2}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
        <Legend color="#f59e0b" label="Nourishment" />
        <Legend color="#5ba3b8" label="Support" />
        <Legend color={GLUCOSE_STATUS_COLORS.inRange} label="Manual reading" ring />
      </div>
    </div>
  );
}