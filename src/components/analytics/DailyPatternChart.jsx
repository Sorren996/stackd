import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceArea } from "recharts";
import { GLASS_SURFACE } from "@/lib/glassTheme";

function ChartTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const data = payload[0]?.payload;
  if (!data || data.avg === null) return null;
  return (
    <div
      className="rounded-xl border px-3 py-2"
      style={{ background: "hsl(162,12%,9%)", borderColor: "rgba(255,255,255,0.15)" }}
    >
      <p className="text-xs font-semibold text-white">{data.hour}</p>
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

  return (
    <div className="relative overflow-hidden rounded-3xl border p-5" style={GLASS_SURFACE}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 opacity-50"
        style={{ background: "radial-gradient(circle at 50% 0%, rgba(45,212,191,0.1), transparent 60%)" }}
      />
      <div className="relative z-10">
        <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white">Your Daily Rhythm</p>
        <p className="mb-4 text-xs text-white/30">Average glucose throughout the day</p>

        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyAverages} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="glucoseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5ba3b8" stopOpacity={0.30} />
                  <stop offset="100%" stopColor="#5ba3b8" stopOpacity={0} />
                </linearGradient>
              </defs>
              <ReferenceArea y1={targetLow} y2={targetHigh} fill="rgba(91,168,138,0.1)" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
                interval={2}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="avg"
                stroke="#5ba3b8"
                strokeWidth={2.5}
                fill="rgba(91, 168, 139, 0.74)"
                connectNulls
                dot={{ r: 2, fill: "#5ba3b8", opacity: 0.6 }}
                activeDot={{ r: 4, fill: "#5ba3b8" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="mt-3 flex items-center justify-center gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "rgba(91, 168, 139, 0.74)" }} />
            <span className="text-[10px] uppercase tracking-wider text-white/35">Comfort Zone</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#5ba3b8" }} />
            <span className="text-[10px] uppercase tracking-wider text-white/35">Your Average</span>
          </div>
        </div>
      </div>
    </div>
  );
}