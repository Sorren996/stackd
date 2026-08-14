import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceArea } from "recharts";
import { ArrowUp } from "lucide-react";

const CARD_SURFACE = {
  background: "linear-gradient(152deg, rgba(255,255,255,0.035), rgba(255,255,255,0.006))",
  borderColor: "rgba(255,255,255,0.08)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.10), inset 0 1px 1px rgba(255,255,255,0.08)",
  backdropFilter: "blur(4px)",
};

const LINE_COLOR = "#5ba3b8";

function formatHourLabel(label) {
  if (!label) return "";
  const period = label.slice(-1) === "a" ? "AM" : "PM";
  return `${label.slice(0, -1)} ${period}`;
}

function getRhythmInsight(hourlyAverages) {
  const valid = hourlyAverages.filter((d) => d.avg !== null && d.count > 0);
  if (!valid.length) return null;
  const peak = valid.reduce((a, b) => (b.avg > a.avg ? b : a));
  const low = valid.reduce((a, b) => (b.avg < a.avg ? b : a));
  return { peakHour: formatHourLabel(peak.hour), lowHour: formatHourLabel(low.hour) };
}

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data || data.avg === null) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{ background: "hsl(162,12%,9%)", borderColor: "rgba(255,255,255,0.15)" }}
    >
      <p className="text-xs font-semibold text-white">{formatHourLabel(data.hour)}</p>
      <p className="text-sm font-bold text-teal-300">{data.avg} mg/dL</p>
      {data.count > 0 && (
        <p className="text-[10px] text-white/40">{data.count} reading{data.count !== 1 ? "s" : ""}</p>
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
    <div className="relative overflow-hidden rounded-3xl border p-5" style={CARD_SURFACE}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-12 flex justify-center opacity-60"
      >
        <div
          className="h-32 w-48 rounded-full"
          style={{ background: "radial-gradient(circle, rgba(91,163,184,0.08), transparent 70%)", filter: "blur(6px)" }}
        />
      </div>

      <div className="relative z-10">
        <div className="flex flex-col">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white">Your Daily Rhythm</p>
          <p className="mt-0.5 text-[11px] text-white/30">Average glucose throughout the day</p>
        </div>

        <div className="mt-2 h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyAverages} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="glucoseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                horizontal
                vertical={false}
                stroke="rgba(255,255,255,0.05)"
                strokeDasharray="3 5"
              />
              <ReferenceArea y1={targetLow} y2={targetHigh} fill="rgba(91, 168, 139, 0.06)" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.28)" }}
                axisLine={false}
                tickLine={false}
                interval={2}
                dy={4}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.22)" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="avg"
                stroke={LINE_COLOR}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="url(#glucoseGradient)"
                connectNulls
                dot={false}
                activeDot={{ r: 3.5, fill: LINE_COLOR, stroke: "rgba(255,255,255,0.6)", strokeWidth: 1 }}
                style={{ filter: "drop-shadow(0 1px 4px rgba(91,163,184,0.35))" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {insight && (
          <div className="mt-2 flex items-center gap-2">
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${LINE_COLOR}1a`, color: LINE_COLOR }}
            >
              <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
            </span>
            <p className="text-[11px] text-white/45">
              <span className="font-semibold text-white/70">Highest average around {insight.peakHour}</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}