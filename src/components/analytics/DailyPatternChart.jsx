import { Area, AreaChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis, Tooltip, ReferenceArea } from "recharts";
import { ArrowUp } from "lucide-react";
import NotEnoughData from "@/components/analytics/NotEnoughData";

const LINE_COLOR = "#3f3830";

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
    <div className="rounded-xl border px-3 py-2" style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 8px 28px rgba(63,56,48,0.12)" }}>
      <p className="text-xs font-semibold" style={{ color: "#3f3830" }}>{formatHourLabel(data.hour)}</p>
      <p className="text-sm font-bold" style={{ color: "#5b6550" }}>{data.avg} mg/dL</p>
      {data.count > 0 && (
        <p className="text-[10px]" style={{ color: "#a89e8d" }}>{data.count} reading{data.count !== 1 ? "s" : ""}</p>
      )}
    </div>
  );
}

export default function DailyPatternChart({ hourlyAverages, targetLow, targetHigh, hasEnough = true }) {
  if (!hasEnough) {
    return (
      <section className="px-1">
        <div className="section-label">Daily Rhythm</div>
        <div className="pt-3">
          <NotEnoughData />
        </div>
      </section>
    );
  }
  const dataWithValues = hourlyAverages.filter((d) => d.avg !== null);
  const values = dataWithValues.map((d) => d.avg);
  const minVal = values.length ? Math.min(...values, targetLow) : targetLow;
  const maxVal = values.length ? Math.max(...values, targetHigh) : targetHigh;
  const yMin = Math.max(40, Math.floor((minVal - 20) / 20) * 20);
  const yMax = Math.min(400, Math.ceil((maxVal + 20) / 20) * 20);

  const insight = getRhythmInsight(hourlyAverages);

  return (
    <section className="px-1">
      <div className="section-label">Daily Rhythm</div>
      <div className="pt-3">
        <p className="text-[11px] mb-2" style={{ color: "#a89e8d" }}>Average glucose throughout the day</p>

        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={hourlyAverages} margin={{ top: 6, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id="glucoseGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.12} />
                  <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                horizontal
                vertical={false}
                stroke="#eadccf"
                strokeDasharray="3 5"
              />
              <ReferenceArea y1={targetLow} y2={targetHigh} fill="rgba(91, 101, 80, 0.06)" />
              <XAxis
                dataKey="hour"
                tick={{ fontSize: 9, fill: "#a89e8d" }}
                axisLine={false}
                tickLine={false}
                interval={2}
                dy={4}
              />
              <YAxis
                domain={[yMin, yMax]}
                tick={{ fontSize: 9, fill: "#a89e8d" }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="avg"
                stroke={LINE_COLOR}
                strokeWidth={2.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="url(#glucoseGradient)"
                connectNulls
                dot={false}
                activeDot={{ r: 3.5, fill: LINE_COLOR, stroke: "#fdf9f2", strokeWidth: 1 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {insight && (
          <div className="mt-2 flex items-center gap-2">
            <ArrowUp className="h-3 w-3 shrink-0" strokeWidth={2} style={{ color: "#8a7f70" }} />
            <p className="text-[11px]" style={{ color: "#8a7f70" }}>
              <span className="font-semibold" style={{ color: "#3f3830" }}>Highest average around {insight.peakHour}</span>
            </p>
          </div>
        )}
      </div>
    </section>
  );
}