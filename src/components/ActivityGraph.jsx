import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { generateActivityCurve, INSULIN_PROFILES, formatMinutes } from "@/lib/insulinPharmacology";
import { format } from "date-fns";

function CustomTooltip({ active, payload, label, showTotal }) {
  if (!active || !payload?.length) return null;
  const totalEntry = payload.find((p) => p.dataKey === "__total");
  const doseEntries = payload.filter((p) => p.dataKey !== "__total" && p.value > 0);
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-2">
        {format(new Date(label), "h:mm a")}
      </p>
      {doseEntries.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-sm">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="font-medium">{p.name}</span>
          <span className="text-muted-foreground ml-auto">{(p.value * 100).toFixed(0)}%</span>
        </div>
      ))}
      {showTotal && totalEntry && totalEntry.value > 0 && (
        <div className="flex items-center gap-2 text-sm mt-2 pt-2 border-t border-border">
          <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
          <span className="font-semibold">Combined Total</span>
          <span className="text-orange-500 font-bold ml-auto">{(totalEntry.value * 100).toFixed(0)}%</span>
        </div>
      )}
    </div>
  );
}

export default function ActivityGraph({ doses }) {
  const { chartData, doseKeys } = useMemo(() => {
    if (!doses.length) return { chartData: [], doseKeys: [] };

    // Generate curves for all doses
    const allCurves = doses.map((dose) => ({
      dose,
      curve: generateActivityCurve(dose, 3),
      profile: INSULIN_PROFILES[dose.insulin_type],
    }));

    // Find the time range
    const allTimes = allCurves.flatMap((c) => c.curve.map((p) => p.time));
    const minTime = Math.min(...allTimes, Date.now() - 30 * 60000);
    const maxTime = Math.max(...allTimes, Date.now() + 60 * 60000);

    // Create unified time grid
    const step = 3 * 60000; // 3 min
    const timePoints = [];
    for (let t = minTime; t <= maxTime; t += step) {
      timePoints.push(t);
    }

    // Build chart data
    const keys = [];
    const data = timePoints.map((t) => {
      const point = { time: t };
      allCurves.forEach((c, i) => {
        const key = `dose_${c.dose.id}`;
        if (!keys.find((k) => k.key === key)) {
          keys.push({
            key,
            label: `${c.dose.insulin_type} (${c.dose.units}u)`,
            color: c.profile?.color || "#888",
          });
        }
        // Interpolate activity at this time
        const curve = c.curve;
        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = 0;
        } else {
          // Find surrounding points
          let lo = 0, hi = curve.length - 1;
          for (let j = 0; j < curve.length - 1; j++) {
            if (curve[j].time <= t && curve[j + 1].time >= t) {
              lo = j;
              hi = j + 1;
              break;
            }
          }
          const ratio = hi === lo ? 0 : (t - curve[lo].time) / (curve[hi].time - curve[lo].time);
          point[key] = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
        }
      });
      return point;
    });

    return { chartData: data, doseKeys: keys };
  }, [doses]);

  if (!doses.length) return null;

  const now = Date.now();

  return (
    <div className="bg-card rounded-2xl border border-border p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Activity Timeline</h2>
        <div className="flex flex-wrap gap-3">
          {doseKeys.map((k) => (
            <div key={k.key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: k.color }} />
              {k.label}
            </div>
          ))}
          {doseKeys.length > 1 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-orange-500">
              <div className="w-2.5 h-2.5 rounded-full bg-orange-500" />
              Combined Total
            </div>
          )}
        </div>
      </div>

      <div className="h-72 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              {doseKeys.map((k) => (
                <linearGradient key={k.key} id={`grad_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={k.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={k.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214, 20%, 90%)" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={["dataMin", "dataMax"]}
              tickFormatter={(t) => format(new Date(t), "h:mm a")}
              tick={{ fontSize: 11, fill: "hsl(215, 15%, 50%)" }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 11, fill: "hsl(215, 15%, 50%)" }}
              axisLine={false}
              tickLine={false}
              domain={[0, "auto"]}
            />
            <Tooltip content={<CustomTooltip showTotal={doseKeys.length > 1} />} />
            <ReferenceLine
              x={now}
              stroke="hsl(213, 94%, 48%)"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{
                value: "Now",
                position: "top",
                fill: "hsl(213, 94%, 48%)",
                fontSize: 11,
                fontWeight: 600,
              }}
            />
            {doseKeys.length > 1 && (
              <Area
                type="monotone"
                dataKey="__total"
                name="Combined Total"
                stroke="#F97316"
                strokeWidth={2.5}
                strokeDasharray="6 3"
                fill="none"
                dot={false}
                animationDuration={800}
              />
            )}
            {doseKeys.map((k) => (
              <Area
                key={k.key}
                type="monotone"
                dataKey={k.key}
                name={k.label}
                stroke={k.color}
                strokeWidth={2.5}
                fill={`url(#grad_${k.key})`}
                dot={false}
                animationDuration={800}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}