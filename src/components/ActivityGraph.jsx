import { useMemo, useRef, useEffect, useState } from "react";
import {
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  Line,
  ComposedChart,
} from "recharts";
import { generateActivityCurve, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { generateCarbCurve, PROFILE_COLORS } from "@/lib/carbAbsorption";
import { format } from "date-fns";
import { HelpCircle, SlidersHorizontal, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const VIEW_HOURS = 4;
const FUTURE_PADDING_HOURS = 2;
const CHART_HEIGHT = 240;
const CHART_MARGIN = { top: 12, right: 0, left: 0, bottom: 0 };

const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 400;

function getGlucoseColor(mgdl) {
  return "hsla(0, 0%, 93%, 1.00)";
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const insulinEntries = payload.filter(
    (p) =>
      p.dataKey?.startsWith("dose_") &&
      !p.dataKey.includes("_actual") &&
      !p.dataKey.includes("_total") &&
      p.value != null &&
      p.value > 0
  );

  const carbCurveEntries = payload.filter(
    (p) =>
      p.dataKey?.startsWith("carb_") &&
      !p.dataKey.includes("_carbs") &&
      !p.dataKey.includes("_food") &&
      p.value != null &&
      p.value > 0
  );

  const glucoseEntry = payload.find((p) => p.dataKey === "glucose");

  return (
    <div
      className="rounded-xl px-3 py-2 shadow-xl"
      style={{
        background: "rgba(20,30,25,0.92)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <p className="text-[10px] text-white/40 mb-1">
        {format(new Date(label), "h:mm a")}
      </p>

      {glucoseEntry &&
        glucoseEntry.value != null &&
        (() => {
          const mgdl = Math.round(glucoseEntry.value);
          const color = getGlucoseColor(mgdl);

          return (
            <div className="flex items-center gap-2 text-sm mb-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="text-white/80">Glucose</span>
              <span className="ml-auto pl-3 font-medium" style={{ color }}>
                {mgdl} mg/dL
              </span>
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
              <span className="text-white font-medium">
                {actual != null ? actual.toFixed(1) : p.value.toFixed(1)}u
              </span>
              {total != null && (
                <span className="text-white/30 text-[10px]"> / {total}u</span>
              )}
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
              <span className="font-medium" style={{ color: p.color }}>
                {carbs}g carbs
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

function FilterDropdown({ filters, onChange, anchorRect }) {
  const items = [
    { key: "glucose", label: "Glucose", color: "rgba(255,255,255,0.6)" },
    { key: "insulin", label: "Insulin", color: "#35a879" },
    { key: "carbs", label: "Carbs", color: "#f59e0b" },
  ];

  const MARGIN = 8;
  const DROPDOWN_W = 140;
  const DROPDOWN_H = 128;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = anchorRect.left;
  if (left + DROPDOWN_W > vw - MARGIN) left = vw - DROPDOWN_W - MARGIN;
  if (left < MARGIN) left = MARGIN;

  const spaceBelow = vh - anchorRect.bottom;
  const openBelow = spaceBelow >= DROPDOWN_H + MARGIN;
  const top = openBelow
    ? anchorRect.bottom + MARGIN
    : anchorRect.top - DROPDOWN_H - MARGIN;

  const initY = openBelow ? -8 : 8;

  return (
    <motion.div
      initial={{ opacity: 0, y: initY, scale: 0.95 }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        transition: { type: "spring", stiffness: 380, damping: 28 },
      }}
      exit={{
        opacity: 0,
        y: initY * 0.7,
        scale: 0.96,
        transition: { duration: 0.13 },
      }}
      className="fixed z-[200] rounded-2xl border border-white/10 shadow-2xl py-1.5"
      style={{
        background: "hsl(162,10%,10%)",
        width: DROPDOWN_W,
        left,
        top,
      }}
    >
      {items.map((item) => (
        <button
          key={item.key}
          onClick={() => onChange(item.key)}
          className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/5 transition-colors text-left"
        >
          <div
            className="w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all"
            style={{
              borderColor: filters[item.key] ? item.color : "rgba(255,255,255,0.15)",
              backgroundColor: filters[item.key] ? item.color + "22" : "transparent",
            }}
          >
            {filters[item.key] && (
              <Check className="w-2.5 h-2.5" style={{ color: item.color }} />
            )}
          </div>

          <span
            className="text-sm font-medium"
            style={{
              color: filters[item.key]
                ? "rgba(255,255,255,0.85)"
                : "rgba(255,255,255,0.35)",
            }}
          >
            {item.label}
          </span>
        </button>
      ))}
    </motion.div>
  );
}

export default function ActivityGraph({
  doses,
  glucoseReadings = [],
  carbEntries = [],
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [showFilter, setShowFilter] = useState(false);
  const [filterAnchorRect, setFilterAnchorRect] = useState(null);
  const [filters, setFilters] = useState({
    glucose: true,
    insulin: true,
    carbs: true,
  });
  const [isInteracting, setIsInteracting] = useState(false);
  const [centerTime, setCenterTime] = useState(Date.now());
  const [containerWidth, setContainerWidth] = useState(600);

  const scrollRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const toggleFilter = (key) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }));
  };

  const targetLow = parseInt(localStorage.getItem("target_range_low") || "70", 10);
  const targetHigh = parseInt(localStorage.getItem("target_range_high") || "180", 10);

  const rangeTotal = GLUCOSE_MAX - GLUCOSE_MIN;
  const highPct = (((GLUCOSE_MAX - targetHigh) / rangeTotal) * 100).toFixed(1);
  const lowPct = (((GLUCOSE_MAX - targetLow) / rangeTotal) * 100).toFixed(1);

  const now = Date.now();
  const snappedNow = Math.round(now / 180000) * 180000;

  const filteredDoses = filters.insulin ? doses : [];
  const filteredCarbEntries = filters.carbs ? carbEntries : [];
  const filteredGlucoseReadings = filters.glucose ? glucoseReadings : [];

  const allCurvesMeta = useMemo(
    () =>
      filteredDoses.map((dose) => ({
        dose,
        curve: generateActivityCurve(dose, 3),
        profile: INSULIN_PROFILES[dose.insulin_type],
      })),
    [filteredDoses]
  );

  const allCarbCurvesMeta = useMemo(
    () =>
      filteredCarbEntries
        .filter((entry) => !entry.is_custom)
        .map((entry) => ({
          entry,
          curve: generateCarbCurve(entry),
          color: PROFILE_COLORS[entry.absorption_profile] || "#f59e0b",
        })),
    [filteredCarbEntries]
  );

  const customCarbEvents = useMemo(
    () =>
      filteredCarbEntries
        .filter((entry) => entry.is_custom)
        .map((entry) => ({
          time: new Date(entry.consumed_at).getTime(),
          entry,
        })),
    [filteredCarbEntries]
  );

  const timelineStart = useMemo(() => {
    const times = [];

    glucoseReadings.forEach((g) => {
      const time = new Date(g.recorded_at).getTime();
      if (Number.isFinite(time)) times.push(time);
    });

    allCurvesMeta.forEach(({ curve }) => {
      if (curve?.length) times.push(curve[0].time);
    });

    allCarbCurvesMeta.forEach(({ curve }) => {
      if (curve?.length) times.push(curve[0].time);
    });

    customCarbEvents.forEach(({ time }) => {
      if (Number.isFinite(time)) times.push(time);
    });

    if (!times.length) {
      return snappedNow - VIEW_HOURS * 60 * 60 * 1000;
    }

    return Math.min(...times, snappedNow - VIEW_HOURS * 60 * 60 * 1000);
  }, [glucoseReadings, allCurvesMeta, allCarbCurvesMeta, customCarbEvents, snappedNow]);

  const timelineEnd = snappedNow + FUTURE_PADDING_HOURS * 60 * 60 * 1000;
  const timelineDuration = Math.max(timelineEnd - timelineStart, VIEW_HOURS * 60 * 60 * 1000);
  const chartWidth = Math.max(
    containerWidth,
    Math.round((timelineDuration / (VIEW_HOURS * 60 * 60 * 1000)) * containerWidth)
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

  const maxDoseUnits = useMemo(
    () => Math.max(...filteredDoses.map((d) => d.units), 1),
    [filteredDoses]
  );

  const maxCarbGrams = useMemo(
    () =>
      Math.max(
        ...filteredCarbEntries.filter((entry) => !entry.is_custom).map((entry) => entry.carbs),
        1
      ),
    [filteredCarbEntries]
  );

  const chartData = useMemo(() => {
    if (!doses.length && !glucoseReadings.length && !carbEntries.length) {
      return [];
    }

    const step = 3 * 60000;
    const result = [];

    for (let t = timelineStart; t <= timelineEnd; t += step) {
      const point = { time: t, bg: GLUCOSE_MAX };

      allCurvesMeta.forEach(({ dose, curve }) => {
        const key = `dose_${dose.id}`;

        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = null;
          point[`${key}_actual`] = null;
        } else {
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
            curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);

point[key] = GLUCOSE_MIN + activity * (dose.units / maxDoseUnits) * 70;          point[`${key}_actual`] = activity * dose.units;
          point[`${key}_total`] = dose.units;
        }
      });

      allCarbCurvesMeta.forEach(({ entry, curve }) => {
        const key = `carb_${entry.id}`;

        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = null;
        } else {
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
            curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);

point[key] = GLUCOSE_MIN + activity * (entry.carbs / maxCarbGrams) * 50;
          point[`${key}_carbs`] = entry.carbs;
          point[`${key}_food`] = entry.food_name;
        }
      });

      if (glucoseMap[t] !== undefined) {
        point.glucose = glucoseMap[t];
      }

      result.push(point);
    }

    return result;
  }, [
    doses,
    glucoseReadings,
    carbEntries,
    timelineStart,
    timelineEnd,
    allCurvesMeta,
    allCarbCurvesMeta,
    glucoseMap,
    maxDoseUnits,
    maxCarbGrams,
  ]);

  const doseKeys = useMemo(
    () =>
      filteredDoses.map((dose) => ({
        key: `dose_${dose.id}`,
        label: dose.insulin_type.split(" ")[0],
        units: dose.units,
        color: INSULIN_PROFILES[dose.insulin_type]?.color || "#888",
      })),
    [filteredDoses]
  );

  const carbKeys = useMemo(
    () =>
      filteredCarbEntries
        .filter((entry) => !entry.is_custom)
        .map((entry) => ({
          key: `carb_${entry.id}`,
          label: entry.food_name,
          carbs: entry.carbs,
          color: PROFILE_COLORS[entry.absorption_profile] || "#f59e0b",
        })),
    [filteredCarbEntries]
  );

  const activeGlucosePoint = useMemo(() => {
    const points = chartData
      .filter((point) => point.glucose != null)
      .sort((a, b) => a.time - b.time);

    if (!points.length) return null;

    let before = null;
    let after = null;

    for (const point of points) {
      if (point.time <= centerTime) before = point;

      if (point.time >= centerTime) {
        after = point;
        break;
      }
    }

    if (!before && !after) return null;
    if (!before) return after;
    if (!after) return before;
    if (before.time === after.time) return before;

    const ratio = (centerTime - before.time) / (after.time - before.time);
    const glucose = before.glucose + ratio * (after.glucose - before.glucose);

    return {
      time: centerTime,
      glucose,
    };
  }, [chartData, centerTime]);

  const updateCenterTime = () => {
    if (!scrollRef.current) return;

    const el = scrollRef.current;
    const centerX = el.scrollLeft + el.clientWidth / 2;
    const progress = Math.min(1, Math.max(0, centerX / chartWidth));
    const nextCenterTime = timelineStart + progress * (timelineEnd - timelineStart);

    setCenterTime(nextCenterTime);
  };

  useEffect(() => {
    if (!scrollRef.current) return;

    const nowOffset =
      ((snappedNow - timelineStart) / (timelineEnd - timelineStart)) * chartWidth;

    scrollRef.current.scrollLeft = nowOffset - scrollRef.current.clientWidth / 2;

    requestAnimationFrame(() => {
      updateCenterTime();
    });
  }, [chartWidth, snappedNow, timelineStart, timelineEnd]);

  if (!doses.length && !glucoseReadings.length && !carbEntries.length) {
    return null;
  }

  const tickCount = Math.max(2, Math.floor(chartWidth / 90));
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div ref={containerRef} className="-mx-4 overflow-hidden">
      <div className="flex py-3 items-center mb-4 justify-center gap-2">
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

        <AnimatePresence>
          {showFilter && filterAnchorRect && (
            <>
              <div
                className="fixed inset-0 z-[199]"
                onClick={() => setShowFilter(false)}
              />
              <FilterDropdown
                filters={filters}
                onChange={toggleFilter}
                anchorRect={filterAnchorRect}
              />
            </>
          )}
        </AnimatePresence>

        <div className="relative">
          <button
            onClick={() => setShowInfo(!showInfo)}
            className={`w-8 h-8 flex items-center justify-center rounded-xl border transition-all ${
              showInfo
                ? "bg-teal-500/10 border-teal-500/30 text-teal-400"
                : "border-white/5 bg-white/[0.03] text-white/40 hover:text-white/80 hover:bg-white/[0.08]"
            }`}
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
                <motion.div
                  initial={{ opacity: 0, y: -100, scale: 0.9 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: { type: "spring", stiffness: 280, damping: 22 },
                  }}
                  exit={{
                    opacity: 0,
                    y: 60,
                    scale: 0.9,
                    transition: { duration: 0.15 },
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="relative max-w-4xl w-full rounded-2xl overflow-hidden bg-black border border-teal-500/20 p-0.5"
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

      {activeGlucosePoint && (
        <div className="text-center mb-2">
          <p className="text-2xl font-bold text-white">
            {Math.round(activeGlucosePoint.glucose)} mg/dL
          </p>
          <p className="text-xs text-white/35">
            {format(new Date(activeGlucosePoint.time), "h:mm a")}
          </p>
        </div>
      )}

      <div className="relative">
        <div
          className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 border-l border-white/30 border-dashed"
          style={{ height: CHART_HEIGHT }}
        />

        <div
          ref={scrollRef}
          onScroll={updateCenterTime}
          className="overflow-x-auto"
          style={{
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
          }}
        >
          <div style={{ width: chartWidth, height: CHART_HEIGHT }}>

<svg
  className="pointer-events-none absolute inset-0 z-10"
  width={chartWidth}
  height={CHART_HEIGHT}
  viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}
>
  {doseKeys.map((k) => {
    const points = chartData
      .filter((point) => point[k.key] != null)
      .map((point) => {
        const x =
          ((point.time - timelineStart) / (timelineEnd - timelineStart)) *
          chartWidth;

        const displayValue = GLUCOSE_MIN + point[k.key];
        const y =
          CHART_HEIGHT -
          ((displayValue - GLUCOSE_MIN) / (GLUCOSE_MAX - GLUCOSE_MIN)) *
            CHART_HEIGHT;

        return { x, y };
      });

    if (points.length < 2) return null;

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

    const areaPath = `
      ${linePath}
      L ${points[points.length - 1].x} ${CHART_HEIGHT}
      L ${points[0].x} ${CHART_HEIGHT}
      Z
    `;

    return (
      <g key={k.key}>
        <path d={areaPath} fill={k.color} opacity="0.12" />
        <path
          d={linePath}
          fill="none"
          stroke={k.color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      </g>
    );
  })}

  {carbKeys.map((k) => {
    const points = chartData
      .filter((point) => point[k.key] != null)
      .map((point) => {
        const x =
          ((point.time - timelineStart) / (timelineEnd - timelineStart)) *
          chartWidth;

        const displayValue = GLUCOSE_MIN + point[k.key];
        const y =
          CHART_HEIGHT -
          ((displayValue - GLUCOSE_MIN) / (GLUCOSE_MAX - GLUCOSE_MIN)) *
            CHART_HEIGHT;

        return { x, y };
      });

    if (points.length < 2) return null;

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
      .join(" ");

    const areaPath = `
      ${linePath}
      L ${points[points.length - 1].x} ${CHART_HEIGHT}
      L ${points[0].x} ${CHART_HEIGHT}
      Z
    `;

    return (
      <g key={k.key}>
        <path d={areaPath} fill={k.color} opacity="0.1" />
        <path
          d={linePath}
          fill="none"
          stroke={k.color}
          strokeWidth="2"
          strokeDasharray="5 3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.9"
        />
      </g>
    );
  })}
</svg>

            <ComposedChart
              width={chartWidth}
              height={CHART_HEIGHT}
              data={chartData}
              margin={CHART_MARGIN}
              onMouseMove={(state) => setIsInteracting(!!(state && state.activePayload))}
              onMouseLeave={() => setIsInteracting(false)}
              onTouchStart={(state) => {
                if (state && state.activePayload) setIsInteracting(true);
              }}
              onTouchMove={(state) => {
                if (state && state.activePayload) setIsInteracting(true);
              }}
              onTouchEnd={() => setIsInteracting(false)}
            >
              <defs>
                {doseKeys.map((k) => (
                  <linearGradient
                    key={k.key}
                    id={`grad_${k.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={k.color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={k.color} stopOpacity={0} />
                  </linearGradient>
                ))}

                {carbKeys.map((k) => (
                  <linearGradient
                    key={k.key}
                    id={`grad_${k.key}`}
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor={k.color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={k.color} stopOpacity={0} />
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
                domain={[timelineStart, timelineEnd]}
                tickFormatter={(t) => format(new Date(t), "h:mma")}
                tick={{
                  fontSize: 10,
                  fill: "rgba(255,255,255,0.25)",
                  textAnchor: "middle",
                }}
                axisLine={false}
                tickLine={false}
                tickCount={tickCount}
              />

<YAxis yAxisId="main" domain={[GLUCOSE_MIN, GLUCOSE_MAX]} hide width={0} />

              <Tooltip
                active={isInteracting}
                content={<CustomTooltip />}
                cursor={{
                  stroke: "rgba(255,255,255,0.1)",
                  strokeWidth: 1,
                }}
              />

            

             

              

              {customCarbEvents.map(({ time, entry }) => (
                <ReferenceLine
                  key={`custom_${entry.id}`}
                  yAxisId="main"
                  x={time}
                  stroke="#6b7280"
                  strokeDasharray="3 3"
                  strokeWidth={1.5}
                  label={{
                    value: `${entry.carbs}g`,
                    position: "insideTopRight",
                    fill: "#9ca3af",
                    fontSize: 9,
                  }}
                />
              ))}

{filters.glucose && filteredGlucoseReadings.length > 0 && (
  <Line
    yAxisId="glucose"
    type="monotoneX"
    dataKey="glucose"
    name="Glucose"
    stroke="rgba(255,255,255,0.95)"
    strokeWidth={2.5}
    dot={(props) => {
      const { cx, cy, payload } = props;

      if (payload.glucose == null) {
        return <g key={`dot-${payload.time}`} />;
      }

      const color = getGlucoseColor(payload.glucose);

      return (
        <circle
          key={`dot-${payload.time}`}
          cx={cx}
          cy={cy}
          r={3.5}
          fill={color}
          stroke="rgba(0,0,0,0.4)"
          strokeWidth={1}
          style={{
            filter: `drop-shadow(0 0 3px ${color}99)`,
          }}
        />
      );
    }}
    activeDot={{
      r: 5,
      stroke: "rgba(0,0,0,0.4)",
      strokeWidth: 1,
    }}
    connectNulls={true}
    isAnimationActive={false}
  />
)}

{filters.glucose && filteredGlucoseReadings.length > 0 && (
  <Line
    yAxisId="glucose"
    type="monotoneX"
    dataKey="glucose"
    name="Glucose"
    stroke="rgba(255,255,255,0.95)"
    strokeWidth={2.5}
    dot={false}
    connectNulls={true}
    isAnimationActive={false}
  />
)}

{activeGlucosePoint && (
  <ReferenceDot
    yAxisId="glucose"
    x={activeGlucosePoint.time}
    y={activeGlucosePoint.glucose}
    r={6}
    fill="white"
    stroke="rgba(0,0,0,0.45)"
    strokeWidth={2}
    isFront
  />
)}


              
            </ComposedChart>
          </div>
        </div>
      </div>
    </div>
  );
}