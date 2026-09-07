import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceArea } from "recharts";
import { ArrowUp } from "lucide-react";

const LINE_COLOR = "#5ba3b8";

const SUBTLE_SURFACE = {
  background: "rgba(255,255,255,0.022)",
  border: "1px solid rgba(255,255,255,0.05)",
};

function formatHourLabel(label) {
  if (!label) return "";
  const period = label.slice(-1) === "a" ? "AM" : "PM";
  return `${label.slice(0, -1)} ${period}`;
}

function getRhythmInsight(hourlyAverages) {
  const valid = hourlyAverages.filter((d) => d.avg !== null && d.count > 0);
  if (!valid.length) return null;
  const peak = valid.reduce((a, b) => (b.avg > a.avg ? b : a));
  return { peakHour: formatHourLabel(peak.hour) };
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data || data.avg === null) return null;
  return (
    <div className="rounded-xl px-3 py-2" style={{ background: "hsl(162,12%,9%)", border: "1px solid rgba(255,255,255,0.12)" }}>
      <p className="text-xs font-semibold text-white">{formatHourLabel(data.hour)}</p>
      <p className="text-sm font-bold text-teal-300">{data.avg} mg/dL</p>
      {data.count > 0 && (
        <p className="text-[10px] text-white/35">{data.count} reading{data.count !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

export default function DailyPatternChart({ hourlyAverages, targetLow, targetHigh }) {
  const dataWithValues = hourlyAverages.filter((d) => d.avg !== null);
  const values = dataWithValues.map((d) => d.avg);
  const minVal = values.length ? Math.min(...values, targetLow) : targetLow;
  const maxVal = values.length ? Math.max(...values, targetHigh) : targetHigh;
  const yMin = Math.max(40, Math.floor((minVal - 20) / 20) * 20);
  const yMax = Math.min(400, Math.ceil((maxVal + 20) / 20) * 20);

  const insight = getRhythmInsight(hourlyAverages);

  return (
    <div className="rounded-2xl px-4 pb-4 pt-5" style={SUBTLE_SURFACE}>
      <div>
        <p className="text-[11px] uppercase tracking-[0.12em] text-white/30">Daily rhythm</p>
        <p className="mt-0.5 text-[10px] text-white/22">Average glucose throughout the day</p>
      </div>

      <div className="mt-3 h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={hourlyAverages} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id="glucoseGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.18} />
                <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              horizontal
              vertical={false}
              stroke="rgba(255,255,255,0.035)"
              strokeDasharray="3 5"
            />
            <ReferenceArea y1={targetLow} y2={targetHigh} fill="rgba(91, 168, 139, 0.035)" />
            <XAxis
              dataKey="hour"
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.22)" }}
              axisLine={false}
              tickLine={false}
              interval={2}
              dy={4}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fontSize: 9, fill: "rgba(255,255,255,0.18)" }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip content={<ChartTooltip />} />
            <Area
              type="monotone"
              dataKey="avg"
              stroke={LINE_COLOR}
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#glucoseGradient)"
              connectNulls
              dot={false}
              activeDot={{ r: 3.5, fill: LINE_COLOR, stroke: "rgba(255,255,255,0.5)", strokeWidth: 1 }}
              style={{ filter: "drop-shadow(0 1px 3px rgba(91,163,184,0.22))" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {insight && (
        <div className="mt-3 flex items-center gap-2">
          <ArrowUp className="h-3 w-3 shrink-0" strokeWidth={2.5} style={{ color: LINE_COLOR }} />
          <p className="text-[11px] text-white/40">
            <span className="font-semibold text-white/65">Highest average around {insight.peakHour}</span>
          </p>
        </div>
      )}
    </div>
  );
}