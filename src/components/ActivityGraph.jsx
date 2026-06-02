import { useMemo, useRef, useEffect, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import { generateActivityCurve, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { format } from "date-fns";

const TIME_RANGES = [
  { label: "1h",  hours: 1,  pxPerMin: 18 },
  { label: "3h",  hours: 3,  pxPerMin: 8  },
  { label: "12h", hours: 12, pxPerMin: 2.5 },
  { label: "24h", hours: 24, pxPerMin: null }, // fit container
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const entries = payload.filter((p) => p.value > 0);
  return (
    <div className="bg-card border border-border rounded-xl px-4 py-3 shadow-xl">
      <p className="text-xs text-muted-foreground mb-2">{format(new Date(label), "h:mm a")}</p>
      {entries.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-sm">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="font-medium text-white">{p.name}</span>
          <span className="text-muted-foreground ml-auto">{(p.value * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function ActivityGraph({ doses }) {
  const [rangeIdx, setRangeIdx] = useState(1); // default 3h
  const scrollRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setContainerWidth(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const selectedRange = TIME_RANGES[rangeIdx];
  const now = Date.now();
  const domainStart = now - 24 * 60 * 60 * 1000; // always compute from full 24h
  const domainEnd = now + 2 * 60 * 60 * 1000;

  // Visible window for the selected range
  const viewStart = now - selectedRange.hours * 60 * 60 * 1000;
  const viewEnd = now + selectedRange.hours * 0.1 * 60 * 60 * 1000;

  const chartData = useMemo(() => {
    if (!doses.length) return [];
    const allCurves = doses.map((dose) => ({
      dose,
      curve: generateActivityCurve(dose, 3),
      profile: INSULIN_PROFILES[dose.insulin_type],
    }));

    const step = 3 * 60000;
    const points = [];
    for (let t = domainStart; t <= domainEnd; t += step) {
      const point = { time: t };
      allCurves.forEach((c) => {
        const key = `dose_${c.dose.id}`;
        const curve = c.curve;
        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = 0;
        } else {
          let lo = 0, hi = curve.length - 1;
          for (let j = 0; j < curve.length - 1; j++) {
            if (curve[j].time <= t && curve[j + 1].time >= t) { lo = j; hi = j + 1; break; }
          }
          const ratio = hi === lo ? 0 : (t - curve[lo].time) / (curve[hi].time - curve[lo].time);
          point[key] = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
        }
      });
      return point;
    }
    return points;
  }, [doses, domainStart, domainEnd]);

  // Rebuild chartData properly (fix loop bug above)
  const builtChartData = useMemo(() => {
    if (!doses.length) return [];
    const allCurves = doses.map((dose) => ({
      dose,
      curve: generateActivityCurve(dose, 3),
      profile: INSULIN_PROFILES[dose.insulin_type],
    }));
    const step = 3 * 60000;
    const result = [];
    for (let t = domainStart; t <= domainEnd; t += step) {
      const point = { time: t };
      allCurves.forEach((c) => {
        const key = `dose_${c.dose.id}`;
        const curve = c.curve;
        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = 0;
        } else {
          let lo = 0, hi = curve.length - 1;
          for (let j = 0; j < curve.length - 1; j++) {
            if (curve[j].time <= t && curve[j + 1].time >= t) { lo = j; hi = j + 1; break; }
          }
          const ratio = hi === lo ? 0 : (t - curve[lo].time) / (curve[hi].time - curve[lo].time);
          point[key] = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
        }
      });
      result.push(point);
    }
    return result;
  }, [doses, domainStart, domainEnd]);

  const doseKeys = useMemo(() => {
    const keys = [];
    doses.forEach((dose) => {
      const profile = INSULIN_PROFILES[dose.insulin_type];
      const key = `dose_${dose.id}`;
      if (!keys.find((k) => k.key === key)) {
        keys.push({ key, label: dose.insulin_type, color: profile?.color || "#888" });
      }
    });
    return keys;
  }, [doses]);

  // Compute chart pixel width
  const is24h = selectedRange.pxPerMin === null;
  const viewMinutes = selectedRange.hours * 60 * 1.1; // +10% lookahead
  const chartWidth = is24h ? containerWidth : Math.round(viewMinutes * selectedRange.pxPerMin);

  // Scroll "now" into center when range changes
  useEffect(() => {
    if (!scrollRef.current || is24h) return;
    const totalViewMs = viewEnd - viewStart;
    const nowOffset = ((now - viewStart) / totalViewMs) * chartWidth;
    const halfContainer = scrollRef.current.clientWidth / 2;
    scrollRef.current.scrollLeft = nowOffset - halfContainer;
  }, [rangeIdx, doses]);

  if (!doses.length) return null;

  const uniqueTypes = [...new Map(doseKeys.map((k) => [k.label, k])).values()];
  const tickInterval = Math.max(1, Math.floor(builtChartData.length / (chartWidth / 80)));

  return (
    <div className="rounded-2xl border border-border p-4 sm:p-5 bg-[#1d2b3a]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex flex-wrap gap-3">
          {uniqueTypes.map((k) => (
            <div key={k.label} className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: k.color }} />
              {k.label}
            </div>
          ))}
        </div>

        {/* Range selector */}
        <div className="flex gap-1 bg-white/5 rounded-xl p-1">
          {TIME_RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                rangeIdx === i
                  ? "bg-blue-500 text-white shadow"
                  : "text-white/40 hover:text-white/70"
              }`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div ref={containerRef}>
        <div
          ref={scrollRef}
          className={is24h ? "" : "overflow-x-auto"}
          style={{ WebkitOverflowScrolling: "touch" }}>
          <div style={{ width: chartWidth, height: 220 }}>
            <AreaChart
              width={chartWidth}
              height={220}
              data={builtChartData}
              margin={{ top: 10, right: 16, left: -20, bottom: 0 }}>
              <defs>
                {doseKeys.map((k) => (
                  <linearGradient key={k.key} id={`grad_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={k.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={k.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={is24h ? [domainStart, domainEnd] : [viewStart, viewEnd]}
                tickFormatter={(t) => format(new Date(t), "h:mm a")}
                tick={{ fontSize: 10, fill: "hsl(215,15%,50%)" }}
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
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
                label={{ value: "Now", position: "top", fill: "hsl(213,94%,48%)", fontSize: 10, fontWeight: 600 }}
              />
              {doseKeys.map((k) => (
                <Area
                  key={k.key}
                  type="monotone"
                  dataKey={k.key}
                  name={k.label}
                  stroke={k.color}
                  strokeWidth={2}
                  fill={`url(#grad_${k.key})`}
                  dot={false}
                  animationDuration={400}
                  isAnimationActive={false}
                />
              ))}
            </AreaChart>
          </div>
        </div>
      </div>
    </div>
  );
}