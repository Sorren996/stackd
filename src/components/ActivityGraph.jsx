import { useMemo, useRef, useEffect, useState } from "react";
import { AreaChart, Area, XAxis, Tooltip, ReferenceLine } from "recharts";
import { generateActivityCurve, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { format } from "date-fns";

const TIME_RANGES = [
  { label: "1h",  hours: 1,  pxPerMin: 18 },
  { label: "3h",  hours: 3,  pxPerMin: 8  },
  { label: "12h", hours: 12, pxPerMin: 2.5 },
  { label: "24h", hours: 24, pxPerMin: null },
];

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const entries = payload.filter((p) => p.value > 0);
  if (!entries.length) return null;
  return (
    <div className="rounded-xl px-3 py-2 shadow-xl" style={{ background: "rgba(20,30,25,0.92)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-[10px] text-white/40 mb-1">{format(new Date(label), "h:mm a")}</p>
      {entries.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-white/80">{p.name}</span>
          <span className="text-white/40 ml-auto pl-3">{(p.value * 100).toFixed(0)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function ActivityGraph({ doses }) {
  const [rangeIdx, setRangeIdx] = useState(1);
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
  const domainStart = now - 24 * 60 * 60 * 1000;
  const domainEnd = now + 2 * 60 * 60 * 1000;
  const viewStart = now - selectedRange.hours * 60 * 60 * 1000;
  const viewEnd = now + selectedRange.hours * 0.1 * 60 * 60 * 1000;

  const allCurvesMeta = useMemo(() =>
    doses.map((dose) => ({
      dose,
      curve: generateActivityCurve(dose, 3),
      profile: INSULIN_PROFILES[dose.insulin_type],
    })),
  [doses]);

  const chartData = useMemo(() => {
    if (!doses.length) return [];
    const step = 3 * 60000;
    const result = [];
    for (let t = domainStart; t <= domainEnd; t += step) {
      const point = { time: t };
      allCurvesMeta.forEach(({ dose, curve }) => {
        const key = `dose_${dose.id}`;
        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = 0;
        } else {
          let lo = 0;
          for (let j = 0; j < curve.length - 1; j++) {
            if (curve[j].time <= t && curve[j + 1].time >= t) { lo = j; break; }
          }
          const hi = Math.min(lo + 1, curve.length - 1);
          const ratio = hi === lo ? 0 : (t - curve[lo].time) / (curve[hi].time - curve[lo].time);
          point[key] = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
        }
      });
      result.push(point);
    }
    return result;
  }, [doses, domainStart, domainEnd, allCurvesMeta]);

  const doseKeys = useMemo(() =>
    doses.map((dose) => ({
      key: `dose_${dose.id}`,
      label: dose.insulin_type.split(" ")[0],
      fullLabel: dose.insulin_type,
      units: dose.units,
      color: INSULIN_PROFILES[dose.insulin_type]?.color || "#888",
    })),
  [doses]);

  const is24h = selectedRange.pxPerMin === null;
  const viewMinutes = selectedRange.hours * 60 * 1.1;
  const chartWidth = is24h ? containerWidth : Math.round(viewMinutes * selectedRange.pxPerMin);

  useEffect(() => {
    if (!scrollRef.current || is24h) return;
    const totalViewMs = viewEnd - viewStart;
    const nowOffset = ((now - viewStart) / totalViewMs) * chartWidth;
    const halfContainer = scrollRef.current.clientWidth / 2;
    scrollRef.current.scrollLeft = nowOffset - halfContainer;
  }, [rangeIdx, doses]);

  if (!doses.length) return null;

  const tickCount = Math.max(2, Math.floor(chartWidth / 90));

  return (
    <div ref={containerRef}>
      {/* Range selector + labels row — sticky header */}
      <div className="flex items-center justify-between mb-3">
        {/* Insulin type labels */}
        <div className="flex flex-wrap gap-3">
          {doseKeys.map((k) => (
            <div key={k.key} className="flex items-center gap-1.5 text-xs text-white/50">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: k.color }} />
              <span>{k.label}</span>
              <span className="text-white/30">{k.units}u</span>
            </div>
          ))}
        </div>
        {/* Range selector */}
        <div className="flex gap-0.5 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
          {TIME_RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                rangeIdx === i ? "text-white" : "text-white/30 hover:text-white/60"
              }`}
              style={rangeIdx === i ? { background: "rgba(255,255,255,0.12)" } : {}}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Floating chart — no borders, no background */}
      <div
        ref={scrollRef}
        className={is24h ? "" : "overflow-x-auto"}
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div style={{ width: chartWidth, height: 160 }}>
          <AreaChart
            width={chartWidth}
            height={160}
            data={chartData}
            margin={{ top: 12, right: 8, left: -20, bottom: 0 }}>
            <defs>
              {doseKeys.map((k) => (
                <linearGradient key={k.key} id={`grad_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={k.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={k.color} stopOpacity={0.0} />
                </linearGradient>
              ))}
            </defs>
            <XAxis false/>
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />
            <ReferenceLine
              x={now}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            {doseKeys.map((k) => (
              <Area
                key={k.key}
                type="monotoneX"
                dataKey={k.key}
                name={k.label}
                stroke={k.color}
                strokeWidth={2.5}
                fill={`url(#grad_${k.key})`}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </AreaChart>
        </div>
      </div>
    </div>
  );
}