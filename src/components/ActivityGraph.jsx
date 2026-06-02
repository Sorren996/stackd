import { useMemo, useRef, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { generateActivityCurve, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { format } from "date-fns";

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const doseEntries = payload.filter((p) => p.dataKey !== "__total" && p.value > 0);
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-2">
        {format(new Date(label), "h:mm a")}
      </p>
      {doseEntries.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-sm">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="font-medium text-white">{p.name}</span>
          <span className="text-muted-foreground ml-auto">{(p.value * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}

const PX_PER_MINUTE = 3; // resolution: 3px per minute → 24h = 4320px

export default function ActivityGraph({ doses }) {
  const scrollRef = useRef(null);

  const { chartData, doseKeys, domainStart, domainEnd } = useMemo(() => {
    const now = Date.now();
    const domainStart = now - 24 * 60 * 60 * 1000;
    const domainEnd = now + 2 * 60 * 60 * 1000; // +2h lookahead

    if (!doses.length) return { chartData: [], doseKeys: [], domainStart, domainEnd };

    const allCurves = doses.map((dose) => ({
      dose,
      curve: generateActivityCurve(dose, 3),
      profile: INSULIN_PROFILES[dose.insulin_type],
    }));

    const step = 5 * 60000; // 5 min
    const timePoints = [];
    for (let t = domainStart; t <= domainEnd; t += step) {
      timePoints.push(t);
    }

    const keys = [];
    const data = timePoints.map((t) => {
      const point = { time: t };
      allCurves.forEach((c) => {
        const key = `dose_${c.dose.id}`;
        if (!keys.find((k) => k.key === key)) {
          keys.push({ key, label: c.dose.insulin_type, color: c.profile?.color || "#888" });
        }
        const curve = c.curve;
        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = 0;
        } else {
          let lo = 0, hi = curve.length - 1;
          for (let j = 0; j < curve.length - 1; j++) {
            if (curve[j].time <= t && curve[j + 1].time >= t) {
              lo = j; hi = j + 1; break;
            }
          }
          const ratio = hi === lo ? 0 : (t - curve[lo].time) / (curve[hi].time - curve[lo].time);
          point[key] = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
        }
      });
      return point;
    });

    return { chartData: data, doseKeys: keys, domainStart, domainEnd };
  }, [doses]);

  // Scroll so "now" is centered on mount / dose change
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = Date.now();
    const totalMs = domainEnd - domainStart;
    const totalPx = (totalMs / 60000) * PX_PER_MINUTE;
    const nowPx = ((now - domainStart) / totalMs) * totalPx;
    const containerW = scrollRef.current.clientWidth;
    scrollRef.current.scrollLeft = nowPx - containerW / 2;
  }, [doses, domainStart, domainEnd]);

  if (!doses.length) return null;

  const totalMinutes = (domainEnd - domainStart) / 60000;
  const chartWidth = Math.round(totalMinutes * PX_PER_MINUTE);
  const now = Date.now();

  const uniqueTypes = [...new Map(doseKeys.map((k) => [k.label, k])).values()];

  return (
    <div className="rounded-2xl border border-border p-4 sm:p-5 bg-[#1d2b3a]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-white">Activity Timeline</h2>
        <div className="flex flex-wrap gap-3">
          {uniqueTypes.map((k) => (
            <div key={k.label} className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: k.color }} />
              {k.label}
            </div>
          ))}
        </div>
      </div>

      {/* Scrollable chart */}
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        style={{ WebkitOverflowScrolling: "touch" }}>
        <div style={{ width: chartWidth, height: 240 }}>
          <AreaChart
            width={chartWidth}
            height={240}
            data={chartData}
            margin={{ top: 10, right: 20, left: -20, bottom: 0 }}>
            <defs>
              {doseKeys.map((k) => (
                <linearGradient key={k.key} id={`grad_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={k.color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={k.color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(214,20%,90%)" vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              domain={[domainStart, domainEnd]}
              tickFormatter={(t) => format(new Date(t), "h:mm a")}
              tick={{ fontSize: 10, fill: "hsl(215,15%,50%)" }}
              axisLine={false}
              tickLine={false}
              interval={Math.floor(chartData.length / 12)}
            />
            <YAxis
              tickFormatter={(v) => `${Math.round(v * 100)}%`}
              tick={{ fontSize: 10, fill: "hsl(215,15%,50%)" }}
              axisLine={false}
              tickLine={false}
              domain={[0, "auto"]}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              x={now}
              stroke="hsl(213,94%,48%)"
              strokeDasharray="4 4"
              strokeWidth={2}
              label={{ value: "Now", position: "top", fill: "hsl(213,94%,48%)", fontSize: 11, fontWeight: 600 }}
            />
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
                animationDuration={600}
              />
            ))}
          </AreaChart>
        </div>
      </div>
    </div>
  );
}