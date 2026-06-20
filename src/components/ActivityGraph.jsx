import { useMemo, useRef, useEffect, useState } from "react";
import { Area, XAxis, YAxis, Tooltip, ReferenceLine, Line, ComposedChart } from "recharts";
import { generateActivityCurve, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { generateCarbCurve, PROFILE_COLORS } from "@/lib/carbAbsorption";
import { format } from "date-fns";
import { HelpCircle, SlidersHorizontal, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const TIME_RANGES = [
  { label: "1h", hours: 1, pxPerMin: 18 },
  { label: "3h", hours: 3, pxPerMin: 8 },
  { label: "12h", hours: 12, pxPerMin: 2.5 },
  { label: "24h", hours: 24, pxPerMin: null },
];

function getGlucoseColor(mgdl) {
  return "hsla(0, 0%, 93%, 1.00)";
}

const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 400;

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const insulinEntries = payload.filter((p) => p.dataKey?.startsWith("dose_") && !p.dataKey.includes("_actual") && !p.dataKey.includes("_total") && p.value != null && p.value > 0);
  const carbCurveEntries = payload.filter((p) => p.dataKey?.startsWith("carb_") && !p.dataKey.includes("_carbs") && !p.dataKey.includes("_food") && p.value != null && p.value > 0);
  const glucoseEntry = payload.find((p) => p.dataKey === "glucose");
  return (
    <div className="rounded-xl px-3 py-2 shadow-xl" style={{ background: "rgba(20,30,25,0.92)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <p className="text-[10px] text-white/40 mb-1">{format(new Date(label), "h:mm a")}</p>
      {glucoseEntry && glucoseEntry.value != null && (() => {
        const mgdl = Math.round(glucoseEntry.value);
        const color = getGlucoseColor(mgdl);
        return (
          <div className="flex items-center gap-2 text-sm mb-1">
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
          <div key={p.dataKey} className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-white/80">{p.name}</span>
            <span className="ml-auto pl-3">
              <span className="text-white font-medium">{actual != null ? actual.toFixed(1) : p.value.toFixed(1)}u</span>
              {total != null && <span className="text-white/30 text-[10px]"> / {total}u</span>}
            </span>
          </div>
        );
      })}
      {carbCurveEntries.map((p) => {
        const carbs = p.payload[`${p.dataKey}_carbs`];
        const food = p.payload[`${p.dataKey}_food`];
        return (
          <div key={p.dataKey} className="flex items-center gap-2 text-sm">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
            <span className="text-white/80">{food}</span>
            <span className="ml-auto pl-3">
              <span className="font-medium" style={{ color: p.color }}>{carbs}g carbs</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Filter dropdown — portal-rendered with smart viewport positioning
function FilterDropdown({ filters, onChange, anchorRect }) {
  const items = [
    { key: "glucose", label: "Glucose", color: "rgba(255,255,255,0.6)" },
    { key: "insulin", label: "Insulin", color: "#35a879" },
    { key: "carbs", label: "Carbs", color: "#f59e0b" },
  ];

  const MARGIN = 8;
  const DROPDOWN_W = 140;
  const DROPDOWN_H = 128; // approx height for 3 rows
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal: align left edge to button left, but clamp to screen
  let left = anchorRect.left;
  if (left + DROPDOWN_W > vw - MARGIN) left = vw - DROPDOWN_W - MARGIN;
  if (left < MARGIN) left = MARGIN;

  // Vertical: prefer below button, flip above if not enough space
  const spaceBelow = vh - anchorRect.bottom;
  const openBelow = spaceBelow >= DROPDOWN_H + MARGIN;
  const top = openBelow
    ? anchorRect.bottom + MARGIN
    : anchorRect.top - DROPDOWN_H - MARGIN;

  const initY = openBelow ? -8 : 8;

  return (
    <motion.div
      initial={{ opacity: 0, y: initY, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 380, damping: 28 } }}
      exit={{ opacity: 0, y: initY * 0.7, scale: 0.96, transition: { duration: 0.13 } }}
      className="fixed z-[200] rounded-2xl border border-white/10 shadow-2xl py-1.5"
      style={{ background: "hsl(162,10%,10%)", width: DROPDOWN_W, left, top }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/5 transition-colors text-left"
        >
          <div className="w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all"
            style={{
              borderColor: filters[item.key] ? item.color : "rgba(255,255,255,0.15)",
              backgroundColor: filters[item.key] ? item.color + "22" : "transparent",
            }}>
            {filters[item.key] && <Check className="w-2.5 h-2.5" style={{ color: item.color }} />}
          </div>
          <span className="text-sm font-medium" style={{ color: filters[item.key] ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)" }}>
            {item.label}
          </span>
        </button>
      ))}
    </motion.div>
  );
}

export default function ActivityGraph({ doses, glucoseReadings = [], carbEntries = [] }) {
  const [rangeIdx, setRangeIdx] = useState(1);
  const [showInfo, setShowInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterAnchorRect, setFilterAnchorRect] = useState(null);
  const [filters, setFilters] = useState({ glucose: true, insulin: true, carbs: true });
  const [isInteracting, setIsInteracting] = useState(false);
  const scrollRef = useRef(null);
  const containerRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([e]) => setContainerWidth(e.contentRect.width));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const toggleFilter = (key) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  const targetLow = parseInt(localStorage.getItem("target_range_low") || "70", 10);
  const targetHigh = parseInt(localStorage.getItem("target_range_high") || "180", 10);

  const rangeTotal = GLUCOSE_MAX - GLUCOSE_MIN;
  const highPct = ((GLUCOSE_MAX - targetHigh) / rangeTotal * 100).toFixed(1);
  const lowPct = ((GLUCOSE_MAX - targetLow) / rangeTotal * 100).toFixed(1);

  const selectedRange = TIME_RANGES[rangeIdx];
  const now = Date.now();
  const snappedNow = Math.round(now / 180000) * 180000;
  const domainStart = snappedNow - 24 * 60 * 60 * 1000;
  const domainEnd = snappedNow + 2 * 60 * 60 * 1000;
  const viewStart = snappedNow - selectedRange.hours * 60 * 60 * 1000;
  const viewEnd = snappedNow + selectedRange.hours * 0.1 * 60 * 60 * 1000;

  // Only include doses/carbs if their filter is on
  const filteredDoses = filters.insulin ? doses : [];
  const filteredCarbEntries = filters.carbs ? carbEntries : [];
  const filteredGlucoseReadings = filters.glucose ? glucoseReadings : [];

  const allCurvesMeta = useMemo(() =>
    filteredDoses.map((dose) => ({
      dose,
      curve: generateActivityCurve(dose, 3),
      profile: INSULIN_PROFILES[dose.insulin_type],
    })),
    [filteredDoses]
  );

  const allCarbCurvesMeta = useMemo(() =>
    filteredCarbEntries
      .filter((e) => !e.is_custom)
      .map((entry) => ({
        entry,
        curve: generateCarbCurve(entry),
        color: PROFILE_COLORS[entry.absorption_profile] || "#f59e0b",
      })),
    [filteredCarbEntries]
  );

  const customCarbEvents = useMemo(() =>
    filteredCarbEntries
      .filter((e) => e.is_custom)
      .map((e) => ({ time: new Date(e.consumed_at).getTime(), entry: e })),
    [filteredCarbEntries]
  );

  const glucoseMap = useMemo(() => {
    const map = {};
    filteredGlucoseReadings.forEach((g) => {
      const t = new Date(g.recorded_at).getTime();
      const bucket = Math.round(t / (3 * 60000)) * (3 * 60000);
      map[bucket] = g.value;
    });
    return map;
  }, [filteredGlucoseReadings]);

  const maxDoseUnits = useMemo(() => Math.max(...filteredDoses.map((d) => d.units), 1), [filteredDoses]);
  const maxCarbGrams = useMemo(() => Math.max(...filteredCarbEntries.filter(e => !e.is_custom).map((e) => e.carbs), 1), [filteredCarbEntries]);

  const chartData = useMemo(() => {
    if (!doses.length && !glucoseReadings.length && !carbEntries.length) return [];
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
allCarbCurvesMeta.forEach(({ entry, curve }) => {
  const key = `carb_${entry.id}`;

 if (!curve.length) {
  point[key] = null;
  return;
}

  const start = curve[0].time;
  const end = curve[curve.length - 1].time;

if (t < start || t > end) {
  point[key] = null;
  return;
}




  let lo = 0;

  for (let j = 0; j < curve.length - 1; j++) {
    if (curve[j].time <= t && curve[j + 1].time >= t) {
      lo = j;
      break;
    }
  }

  const hi = Math.min(lo + 1, curve.length - 1);

  const ratio =
    hi === lo ? 0 : (t - curve[lo].time) / (curve[hi].time - curve[lo].time);

  const activity =
    curve[lo].activity +
    ratio * (curve[hi].activity - curve[lo].activity);

point[key] = scaled < 0.005 ? null : scaled;
  // clamp tail so it visually ends
  point[key] = scaled < 0.01 ? 0 : scaled;

  point[`${key}_carbs`] = entry.carbs;
  point[`${key}_food`] = entry.food_name;

        
      });
      if (glucoseMap[t] !== undefined) point.glucose = glucoseMap[t];
      result.push(point);
    }
    return result;
  }, [doses, glucoseReadings, carbEntries, filters, domainStart, domainEnd, allCurvesMeta, allCarbCurvesMeta, glucoseMap, maxCarbGrams]);

  const doseKeys = useMemo(() =>
    filteredDoses.map((dose) => ({
      key: `dose_${dose.id}`,
      label: dose.insulin_type.split(" ")[0],
      units: dose.units,
      color: INSULIN_PROFILES[dose.insulin_type]?.color || "#888",
    })),
    [filteredDoses]
  );


  const carbKeys = useMemo(() =>
    filteredCarbEntries
      .filter((e) => !e.is_custom)
      .map((entry) => ({
        key: `carb_${entry.id}`,
        label: entry.food_name,
        carbs: entry.carbs,
        color: PROFILE_COLORS[entry.absorption_profile] || "#f59e0b",
      })),
    [filteredCarbEntries]
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

  if (!doses.length && !glucoseReadings.length && !carbEntries.length) return null;

  const tickCount = Math.max(2, Math.floor(chartWidth / 90));

  // How many filters are off (to show indicator dot)
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div ref={containerRef} className="-mx-4 overflow-hidden">
      {/* Controls row */}
      <div className="flex py-3 items-center mb-0 pl-4 justify-start gap-2">

        {/* Filter button */}
        <div className="relative">
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setFilterAnchorRect(rect);
              setShowFilter((v) => !v);
            }}
            className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all relative ${
              showFilter
                ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                : "border-white/5 bg-white/[0.03] text-white/40 hover:text-white/80 hover:bg-white/[0.08]"
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount < 3 && (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-400" />
            )}
          </button>
        </div>
        {/* Portal-style backdrop + dropdown rendered outside flow */}
        <AnimatePresence>
          {showFilter && filterAnchorRect && (
            <>
              <div className="fixed inset-0 z-[199]" onClick={() => setShowFilter(false)} />
              <FilterDropdown filters={filters} onChange={toggleFilter} anchorRect={filterAnchorRect} />
            </>
          )}
        </AnimatePresence>

    
  
      </div>

      <div
        ref={scrollRef}
        className={is24h ? "" : "overflow-x-auto"}
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div style={{ width: chartWidth, height: 240 }}>
          <ComposedChart
            width={chartWidth}
            height={240}
            data={chartData}
            margin={{ top: 12, right: 0, left: -20, bottom: 0 }}
            onMouseMove={(state) => setIsInteracting(!!(state && state.activePayload))}
            onMouseLeave={() => setIsInteracting(false)}
            onTouchStart={(state) => { if (state && state.activePayload) setIsInteracting(true); }}
            onTouchMove={(state) => { if (state && state.activePayload) setIsInteracting(true); }}
            onTouchEnd={() => setIsInteracting(false)}>
            <defs>
              {doseKeys.map((k) => (
                <linearGradient key={k.key} id={`grad_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={k.color} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={k.color} stopOpacity={0.0} />
                </linearGradient>
              ))}
              {carbKeys.map((k) => (
                <linearGradient key={k.key} id={`grad_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={k.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={k.color} stopOpacity={0.0} />
                </linearGradient>
              ))}
              <linearGradient id="glucose_range_grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#78350f" stopOpacity={0} />
                <stop offset={`${highPct}%`} stopColor="#78350f" stopOpacity={0} />
                <stop offset={`${highPct}%`} stopColor="#78350f" stopOpacity={0.4} />
                <stop offset={`${lowPct}%`} stopColor="#78350f" stopOpacity={0.4} />
                <stop offset={`${lowPct}%`} stopColor="#78350f" stopOpacity={0} />
                <stop offset="100%" stopColor="#78350f" stopOpacity={0} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="time"
              type="number"
              domain={is24h ? [domainStart, domainEnd] : [viewStart, viewEnd]}
              tickFormatter={(t) => format(new Date(t), "h:mma")}
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)", textAnchor: "middle" }}
              axisLine={false}
              tickLine={false}
              tickCount={tickCount}
            />

            <YAxis yAxisId="insulin" domain={[0, 75]} hide />
            <YAxis yAxisId="carbs" domain={[0, 55]} hide />
            <YAxis yAxisId="glucose" domain={[GLUCOSE_MIN, GLUCOSE_MAX]} hide />

            <Tooltip active={isInteracting} content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />

            <ReferenceLine
              yAxisId="insulin"
              x={snappedNow}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="3 3"
              strokeWidth={1}
            />

            {filters.glucose && filteredGlucoseReadings.length > 0 && (
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

            {carbKeys.map((k) => (
              <Area
                key={k.key}
                yAxisId="carbs"
                type="linear"
                dataKey={k.key}
                name={k.label}
                stroke={k.color}
                strokeWidth={2}
                strokeDasharray="5 3"
                fill={`url(#grad_${k.key})`}
                dot={false}
                isAnimationActive={false}
                opacity={0.85}
              />
            ))}

            {customCarbEvents.map(({ time, entry }) => (
              <ReferenceLine
                key={`custom_${entry.id}`}
                yAxisId="carbs"
                x={time}
                stroke="#6b7280"
                strokeDasharray="3 3"
                strokeWidth={1.5}
                label={{ value: `${entry.carbs}g`, position: "insideTopRight", fill: "#9ca3af", fontSize: 9 }}
              />
            ))}

            {filters.glucose && filteredGlucoseReadings.length > 0 && (
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