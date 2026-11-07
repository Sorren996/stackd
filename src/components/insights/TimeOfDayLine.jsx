import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";
import { hourPhrase, peakHour } from "@/lib/insightsPeriod";

const SAGE = "#5b6550";
const X_TICKS = [0, 6, 12, 18];
const X_LABELS = { 0: "Midnight", 6: "6 AM", 12: "Noon", 18: "6 PM" };

function Readout({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload.find((entry) => entry.value != null)?.payload;
  if (!point) return null;
  return (
    <div
      className="rounded-xl border px-2.5 py-1.5"
      style={{ background: "#fdf9f2", borderColor: "#e6dccd", boxShadow: "0 8px 28px rgba(63,56,48,0.12)" }}
    >
      <p className="text-[11px] font-semibold" style={{ color: "#3f3830" }}>
        {point.label}
      </p>
      <p className="text-[12px] tabular-nums" style={{ color: "#3f3830" }}>
        {formatGlucose(point.avg)} {glucoseUnitLabel()}
      </p>
      <p className="text-[10px]" style={{ color: "#746959" }}>
        {point.count} reading{point.count === 1 ? "" : "s"}
      </p>
    </div>
  );
}

/**
 * The period's average reading for each hour of the day (local time), as one
 * restrained line over the comfort-zone band. Hours with no readings stay
 * empty — the line breaks rather than smoothing across them.
 */
export default function TimeOfDayLine({ averages, targetLow, targetHigh, hasEnough = false }) {
  const populated = averages.filter((entry) => entry.avg != null);

  if (!populated.length) {
    return (
      <p className="py-4 text-[12px]" style={{ color: "#6b6153" }}>
        No readings in this period yet. Once you log a few, your time-of-day averages appear here.
      </p>
    );
  }

  const values = populated.map((entry) => entry.avg);
  const yMin = Math.max(40, Math.floor((Math.min(...values, targetLow) - 20) / 20) * 20);
  const yMax = Math.min(400, Math.ceil((Math.max(...values, targetHigh) + 20) / 20) * 20);
  const peak = hasEnough ? peakHour(averages) : null;

  return (
    <div>
      <div className="mb-1 flex justify-end">
        <span className="text-[10px]" style={{ color: "#746959" }}>
          {glucoseUnitLabel()}
        </span>
      </div>

      <div style={{ height: 150 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={averages} margin={{ top: 6, right: 8, left: -10, bottom: 0 }}>
            <CartesianGrid horizontal vertical={false} stroke="#efe5d8" strokeDasharray="3 5" />
            <ReferenceArea y1={targetLow} y2={targetHigh} fill="rgba(91, 101, 80, 0.10)" stroke="none" />
            <XAxis
              type="number"
              dataKey="hour"
              domain={[0, 23]}
              ticks={X_TICKS}
              interval={0}
              tickFormatter={(value) => X_LABELS[value] || ""}
              tick={{ fontSize: 9, fill: "#746959" }}
              axisLine={false}
              tickLine={false}
              dy={4}
            />
            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(value) => formatGlucose(value)}
              tick={{ fontSize: 9, fill: "#746959" }}
              axisLine={false}
              tickLine={false}
              width={38}
            />
            <Tooltip content={<Readout />} cursor={{ stroke: "#d8cec2", strokeWidth: 1 }} />
            <Line
              type="monotone"
              dataKey="avg"
              stroke={SAGE}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={{ r: 3.5, fill: SAGE, stroke: "#fdf9f2", strokeWidth: 1.5 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 space-y-1">
        {peak && (
          <p className="text-[11px]" style={{ color: "#3f3830" }}>
            Highest average around {hourPhrase(peak.hour)}
          </p>
        )}
        <p className="text-[10px] leading-relaxed" style={{ color: "#746959" }}>
          Averages can hide individual highs and lows.
        </p>
      </div>
    </div>
  );
}