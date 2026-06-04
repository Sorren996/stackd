import { useMemo, useRef, useEffect, useState } from "react";
import { Area, XAxis, YAxis, Tooltip, ReferenceLine, Line, ComposedChart } from "recharts";
import { generateActivityCurve, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { format } from "date-fns";
import { HelpCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion"; 

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
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setContainerWidth(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const targetLow = parseInt(localStorage.getItem("target_range_low") || "70", 10);
  const targetHigh = parseInt(localStorage.getItem("target_range_high") || "180", 10);

  // Map glucose values to gradient % positions (top=0%, bottom=100%)
  const rangeTotal = GLUCOSE_MAX - GLUCOSE_MIN;
  const highPct = ((GLUCOSE_MAX - targetHigh) / rangeTotal * 100).toFixed(1);
  const midPct = ((GLUCOSE_MAX - (targetLow + targetHigh) / 2) / rangeTotal * 100).toFixed(1);
  const lowPct = ((GLUCOSE_MAX - targetLow) / rangeTotal * 100).toFixed(1);

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
      const point = { time: t, bg: GLUCOSE_MAX };
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
          point[key] = activity * (dose.units / maxDoseUnits) * 70;
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
          {/* Range selector & Info Tooltip */}
      <div className="flex py-3 items-center mb-4 justify-center gap-3">
        <div className="flex gap-0.5 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.05)" }}>
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


         {/* Informational Help Icon with Spring Dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all ${
              showInfo 
                ? "bg-teal-500/10 border-teal-500/30 text-teal-400" 
                : "border-white/5 bg-white/[0.03] text-white/40 hover:text-white/80 hover:bg-white/[0.08]"
            }`}
            style={{ boxShadow: "0 0 10px rgba(255,255,255,0.02)" }}
          >
            <HelpCircle className="w-4 h-4" />
          </button>

              <AnimatePresence>
            {showInfo && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setShowInfo(false)}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 cursor-pointer"
              >
                {/* Centered card that drops down with a spring transition */}
                <motion.div
                  initial={{ opacity: 0, y: -100, scale: 0.9 }}
                  animate={{ 
                    opacity: 1, 
                    y: 0, 
                    scale: 1,
                    transition: { type: "spring", stiffness: 280, damping: 22 }
                  }}
                  exit={{ 
                    opacity: 0, 
                    y: 60, 
                    scale: 0.9,
                    transition: { duration: 0.15 } 
                  }}
                  onClick={(e) => e.stopPropagation()} // Prevents closing when clicking the image itself
                  className="relative max-w-4xl w-full rounded-2xl overflow-hidden bg-black border border-teal-500/20 p-0.5"
                  style={{
                    boxShadow: "0 20px 50px rgba(20, 184, 166, 0.25)"
                  }}
                >
                  <img
                    src="https://media.base44.com/images/public/6a1b93f234a8611ee1595134/1005e28fb_graphinfotooltip.png"
                    alt="Graph Information Details"
                    className="w-full h-auto rounded-xl object-contain block max-h-[85vh] mx-auto"
                  />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
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
             <linearGradient id="glucose_range_grad" x1="0" y1="0" x2="0" y2="1">
  {/* Transparent above high threshold */}
  <stop offset="0%" stopColor="#78350f" stopOpacity={0} />
  <stop offset={`${highPct}%`} stopColor="#78350f" stopOpacity={0} />
  
  {/* Solid 15% Amber starting exactly at the high threshold */}
  <stop offset={`${highPct}%`} stopColor="#78350f" stopOpacity={0.15} />
  <stop offset={`${lowPct}%`} stopColor="#78350f" stopOpacity={0.15} />
  
  {/* Transparent again below the low threshold */}
  <stop offset={`${lowPct}%`} stopColor="#78350f" stopOpacity={0} />
  <stop offset="100%" stopColor="#78350f" stopOpacity={0} />
</linearGradient>
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

            <YAxis yAxisId="insulin" domain={[0, 75]} hide />
            <YAxis yAxisId="glucose" domain={[GLUCOSE_MIN, GLUCOSE_MAX]} hide />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />

            <ReferenceLine
              yAxisId="insulin"
              x={snappedNow}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />

            {/* Target range background gradient */}
            {glucoseReadings.length > 0 && (
              <Area
                yAxisId="glucose"
                type="monotoneX"
                dataKey="bg"
                stroke="none"
                fill="url(#glucose_range_grad)"
                isAnimationActive={false}
                dot={false}
                activeDot={false}
                legendType="none"
              />
            )}

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