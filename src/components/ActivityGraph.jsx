import { useMemo, useRef, useEffect, useState } from "react";
import { Area, XAxis, YAxis, Tooltip, ReferenceLine, Line, ComposedChart } from "recharts";
import { generateActivityCurve, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { format } from "date-fns";

const TIME_RANGES = [
  { label: "1h", hours: 1, pxPerMin: 18 },
  { label: "3h", hours: 3, pxPerMin: 8 },
  { label: "12h", hours: 12, pxPerMin: 2.5 },
  { label: "24h", hours: 24, pxPerMin: null },
];

function getGlucoseColor(mgdl) {
  if (mgdl < 70) return "hsla(0, 0%, 93%, 1.00)";
  if (mgdl > 180) return "hsla(0, 0%, 93%, 1.00)";
  return "hsla(0, 0%, 93%, 1.00)";
}

const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 400;

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const insulinEntries = payload.filter((p) => p.dataKey?.startsWith("dose_") && !p.dataKey.includes("_actual") && !p.dataKey.includes("_total") && p.value != null && p.value > 0);
  const glucoseEntry = payload.find((p) => p.dataKey === "glucose");
  return (
    <div className="rounded-xl px-3 py-2 shadow-xl" style={{ background: "rgba(20,30,25,0.92)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-[10px] text-white/40 mb-1">{format(new Date(label), "h:mm a")}</p>
      {glucoseEntry && glucoseEntry.value != null && (() => {
        const mgdl = Math.round(glucoseEntry.value);
        const color = getGlucoseColor(mgdl);
        return (
          <div className="flex items-center gap-2 text-xs mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-white/80">Glucose</span>
            <span className="ml-auto pl-3 font-medium" style={{ color }}>{mgdl} mg/dL</span>
          </div>
        );
      })()}
      {insulinEntries.map((p) => {
        const actual = p.payload[`${p.dataKey}_actual`];
        const total = p.payload[`${p.dataKey}_total`];
        return (
          <div key={p.dataKey} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-white/80">{p.name}</span>
            <span className="ml-auto pl-3">
              <span className="text-white font-medium">{actual != null ? actual.toFixed(1) : p.value.toFixed(1)}u</span>
              {total != null && <span className="text-white/30 text-[10px]"> / {total}u</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ActivityGraph({ doses, glucoseReadings = [] }) {
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
  const snappedNow = Math.round(now / 180000) * 180000;
  const domainStart = snappedNow - 24 * 60 * 60 * 1000;
  const domainEnd = snappedNow + 2 * 60 * 60 * 1000;
  const viewStart = snappedNow - selectedRange.hours * 60 * 60 * 1000;
  const viewEnd = snappedNow + selectedRange.hours * 0.1 * 60 * 60 * 1000;

  const allCurvesMeta = useMemo(() =>
    doses.map((dose) => ({
      dose,
      curve: generateActivityCurve(dose, 3),
      profile: INSULIN_PROFILES[dose.insulin_type],
    })),
    [doses]
  );

  // Build glucose map: bucket → raw mg/dL value (no normalization)
  const glucoseMap = useMemo(() => {
    const map = {};
    glucoseReadings.forEach((g) => {
      const t = new Date(g.recorded_at).getTime();
      const bucket = Math.round(t / (3 * 60000)) * (3 * 60000);
      map[bucket] = g.value;
    });
    return map;
  }, [glucoseReadings]);

  const maxDoseUnits = useMemo(() => Math.max(...doses.map((d) => d.units), 1), [doses]);

  const chartData = useMemo(() => {
    if (!doses.length && !glucoseReadings.length) return [];
    const step = 3 * 60000;
    const result = [];
    for (let t = domainStart; t <= domainEnd; t += step) {
      const point = { time: t };
      allCurvesMeta.forEach(({ dose, curve }) => {
        const key = `dose_${dose.id}`;
        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = null;
          point[`${key}_actual`] = null;
        } else {
          let lo = 0;
          for (let j = 0; j < curve.length - 1; j++) {
            if (curve[j].time <= t && curve[j + 1].time >= t) { lo = j; break; }
          }
          const hi = Math.min(lo + 1, curve.length - 1);
          const ratio = hi === lo ? 0 : (t - curve[lo].time) / (curve[hi].time - curve[lo].time);
          const activity = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
          // Visual height scaled proportionally to largest dose
          point[key] = activity * (dose.units / maxDoseUnits) * 70;
          // Actual active insulin units for tooltip accuracy
          point[`${key}_actual`] = activity * dose.units;
          point[`${key}_total`] = dose.units;
        }
      });
      if (glucoseMap[t] !== undefined) point.glucose = glucoseMap[t];
      result.push(point);
    }
    return result;
  }, [doses, glucoseReadings, domainStart, domainEnd, allCurvesMeta, glucoseMap]);

  const doseKeys = useMemo(() =>
    doses.map((dose) => ({
      key: `dose_${dose.id}`,
      label: dose.insulin_type.split(" ")[0],
      fullLabel: dose.insulin_type,
      units: dose.units,
      color: INSULIN_PROFILES[dose.insulin_type]?.color || "#888",
    })),
    [doses]
  );

  const is24h = selectedRange.pxPerMin === null;
  const viewMinutes = selectedRange.hours * 60 * 1.1;
  const chartWidth = is24h ? containerWidth : Math.round(viewMinutes * selectedRange.pxPerMin);

  useEffect(() => {
    if (!scrollRef.current || is24h) return;
    const totalViewMs = viewEnd - viewStart;
    const nowOffset = (snappedNow - viewStart) / totalViewMs * chartWidth;
    const halfContainer = scrollRef.current.clientWidth / 2;
    scrollRef.current.scrollLeft = nowOffset - halfContainer;
  }, [rangeIdx, doses]);

  if (!doses.length && !glucoseReadings.length) return null;

  const tickCount = Math.max(2, Math.floor(chartWidth / 90));

  return (
    <div ref={containerRef} className="-mx-4 overflow-hidden">
      {/* Range selector */}
      <div className="flex py-3 items-center mb-4 justify-center">
        <div className="flex gap-0.5 rounded-xl p-1 justify-center" style={{ background: "rgba(255,255,255,0.05)" }}>
          {TIME_RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${rangeIdx === i ? "text-white" : "text-white/30 hover:text-white/60"}`}
              style={rangeIdx === i ? { background: "rgba(255,255,255,0.12)" } : {}}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={scrollRef}
        className={is24h ? "" : "overflow-x-auto"}
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div style={{ width: chartWidth, height: 180 }}>
          <ComposedChart
            width={chartWidth}
            height={180}
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

            <XAxis
              dataKey="time"
              type="number"
              domain={is24h ? [domainStart, domainEnd] : [viewStart, viewEnd]}
              tickFormatter={(t) => format(new Date(t), "h:mma")}
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }}
              axisLine={false}
              tickLine={false}
              tickCount={tickCount}
            />

            {/* Insulin Y axis: 0–100 units */}
            <YAxis yAxisId="insulin" domain={[0, 75]} hide />

            {/* Glucose Y axis: raw mg/dL range */}
            <YAxis yAxisId="glucose" domain={[GLUCOSE_MIN, GLUCOSE_MAX]} hide />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />

            <ReferenceLine
              yAxisId="insulin"
              x={snappedNow}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />

            {doseKeys.map((k) => (
              <Area
                key={k.key}
                yAxisId="insulin"
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

            {glucoseReadings.length > 0 && (
              <Line
                yAxisId="glucose"
                type="monotoneX"
                dataKey="glucose"
                name="Glucose"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={1.5}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.glucose == null) return <g key={`dot-${payload.time}`} />;
                  const color = getGlucoseColor(payload.glucose);
                  return (
                    <circle
                      key={`dot-${payload.time}`}
                      cx={cx} cy={cy} r={3.5}
                      fill={color}
                      stroke="rgba(0,0,0,0.4)"
                      strokeWidth={1}
                      style={{ filter: `drop-shadow(0 0 3px ${color}99)` }}
                    />
                  );
                }}
                activeDot={{ r: 5, stroke: "rgba(0,0,0,0.4)", strokeWidth: 1 }}
                connectNulls={true}
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </div>
      </div>
    </div>
  );
}