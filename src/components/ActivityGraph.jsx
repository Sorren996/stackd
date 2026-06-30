import { useMemo, useRef, useEffect, useState } from "react";
import { Area, XAxis, YAxis, ReferenceLine, Line, ComposedChart } from "recharts";
import { generateActivityCurve, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { generateCarbCurve, PROFILE_COLORS } from "@/lib/carbAbsorption";
import { format } from "date-fns";
import { CornerUpRight, SlidersHorizontal, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const STEP_MS = 3 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
const HISTORY_DAYS = 14;
const FUTURE_HOURS = 3;
const VISIBLE_HOURS = 6;
const CHART_HEIGHT = 260;
const CHART_MARGIN_TOP = 70;
const CHART_MARGIN_BOTTOM = 0;
const X_AXIS_HEIGHT = 30;
const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 250;
const CARB_VISUAL_MAX_GRAMS = 120;
const CARB_VISUAL_MAX_HEIGHT = 44;
const CARB_PROFILE_COLORS = {
  fast: "#fb923c",
  medium: "#f59e0b",
  slow: "#22c55e",
  delayed: "#a78bfa",
};

const CARB_PROFILE_LABELS = {
  fast: "Fast",
  medium: "Mixed",
  slow: "Slow",
  delayed: "Delayed",
};

function normalizeAbsorptionProfile(value) {
  const profile = String(value || "").toLowerCase();
  if (["fast", "rapid", "juice", "sugar", "high_gi"].includes(profile)) return "fast";
  if (["slow", "low_gi", "protein", "fiber"].includes(profile)) return "slow";
  if (["delayed", "fatty", "high_fat", "burger", "pizza"].includes(profile)) return "delayed";
  return "medium";
}

function getReadingTime(reading) {
  return new Date(reading.recorded_at || reading.created_at || reading.created_date).getTime();
}

function getReadingValue(reading) {
  return reading.value ?? reading.glucose ?? reading.mgdl ?? reading.mg_dL;
}

function formatGlucoseDisplay(value) {
  return Math.round(value);
}

function TimeAxisTick({ x, y, payload }) {
  const date = new Date(payload.value);
  const minute = date.getMinutes();

  if (minute === 30) {
    return <circle cx={x} cy={y + 8} r={2} fill="rgba(255,255,255,0.28)" />;
  }

  if (minute === 0) {
    return (
      <text
        x={x}
        y={y + 13}
        textAnchor="middle"
        fill="rgba(255,255,255,0.28)"
        fontSize={10}
        fontWeight={600}>
        {format(date, "h a")}
      </text>
    );
  }

  return null;
}

function getCarbGrams(entry) {
  const value =
    entry.carbs ??
    entry.carbs_grams ??
    entry.carb_grams ??
    entry.carbohydrate_grams ??
    entry.total_carbs ??
    entry.total_carbs_grams ??
    entry.totalCarbs ??
    entry.totalCarbsGrams ??
    entry.carbohydrates ??
    entry.nutrition?.carbs ??
    entry.nutrition?.carbs_grams ??
    entry.nutrition?.carbohydrates ??
    entry.amount ??
    entry.grams ??
    0;

  const carbs = typeof value === "string" ? Number(value.match(/[\d.]+/)?.[0]) : Number(value);
  return Number.isFinite(carbs) && carbs > 0 ? carbs : 0;
}

function normalizeCarbEntry(entry) {
  const carbs = getCarbGrams(entry);
  const absorptionProfile = normalizeAbsorptionProfile(entry.absorption_profile ?? entry.glycemic_pace ?? entry.pace);

  return {
    ...entry,
    id: entry.id || entry._id || `${entry.consumed_at || entry.created_date || entry.created_at}-${carbs}`,
    food_name: entry.food_name || entry.name || "Food",
    carbs,
    consumed_at: entry.consumed_at || entry.recorded_at || entry.created_date || entry.created_at,
    absorption_profile: absorptionProfile,
    is_custom: entry.is_custom === true,
  };
}

function buildCarbCurve(entry) {
  const generated = generateCarbCurve(entry);
  if (Array.isArray(generated) && generated.length > 0) return generated;

  const start = new Date(entry.consumed_at).getTime();
  if (!Number.isFinite(start)) return [];

  const profile = normalizeAbsorptionProfile(entry.absorption_profile);
  const settings = {
    fast: { delayMin: 0, durationMin: 110, peak: 0.2, skew: 1.45 },
    medium: { delayMin: 10, durationMin: 210, peak: 0.35, skew: 1 },
    slow: { delayMin: 20, durationMin: 300, peak: 0.48, skew: 0.72 },
    delayed: { delayMin: 35, durationMin: 420, peak: 0.58, skew: 0.58 },
  }[profile];

  const curveStart = start + settings.delayMin * 60 * 1000;
  const durationMs = settings.durationMin * 60 * 1000;
  const stepMs = 3 * 60 * 1000;
  const points = [];

  for (let offset = 0; offset <= durationMs; offset += stepMs) {
    const progress = offset / durationMs;
    let activity;

    if (profile === "slow") {
      activity = progress < 0.25 ? progress / 0.25 : progress < 0.72 ? 1 : (1 - progress) / 0.28;
    } else if (profile === "delayed") {
      activity = progress < settings.peak
        ? Math.pow(progress / settings.peak, 1.8)
        : Math.pow((1 - progress) / (1 - settings.peak), 0.65);
    } else {
      const rise = Math.pow(Math.min(progress / settings.peak, 1), profile === "fast" ? 0.65 : 1.15);
      const fall = Math.pow(Math.max((1 - progress) / (1 - settings.peak), 0), settings.skew);
      activity = progress <= settings.peak ? rise : fall;
    }

    points.push({
      time: curveStart + offset,
      activity: Math.max(0, Math.min(1, activity)),
    });
  }

  return points;
}

// Filter dropdown — portal-rendered with smart viewport positioning
function FilterDropdown({ filters, onChange, anchorRect }) {
  const items = [
  { key: "glucose", label: "Glucose", color: "rgba(255,255,255,0.6)" },
  { key: "insulin", label: "Insulin", color: "#35a879" },
  { key: "carbs", label: "Carbs", color: "#f59e0b" }];


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
  const top = openBelow ?
  anchorRect.bottom + MARGIN :
  anchorRect.top - DROPDOWN_H - MARGIN;

  const initY = openBelow ? -8 : 8;

  return (
    <motion.div
      initial={{ opacity: 0, y: initY, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 380, damping: 28 } }}
      exit={{ opacity: 0, y: initY * 0.7, scale: 0.96, transition: { duration: 0.13 } }}
      className="fixed z-[200] rounded-2xl border border-white/10 shadow-2xl py-1.5"
      style={{ background: "hsl(162,10%,10%)", width: DROPDOWN_W, left, top }}>
      
      {items.map((item) =>
      <button
        key={item.key}
        onClick={() => onChange(item.key)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 hover:bg-white/5 transition-colors text-left">
        
          <div className="w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all"
        style={{
          borderColor: filters[item.key] ? item.color : "rgba(255,255,255,0.15)",
          backgroundColor: filters[item.key] ? item.color + "22" : "transparent"
        }}>
            {filters[item.key] && <Check className="w-2.5 h-2.5" style={{ color: item.color }} />}
          </div>
          <span className="text-sm font-medium" style={{ color: filters[item.key] ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)" }}>
            {item.label}
          </span>
        </button>
      )}
    </motion.div>);

}

export default function ActivityGraph({ doses, glucoseReadings = [], carbEntries = [] }) {
  const [showFilter, setShowFilter] = useState(false);
  const [filterAnchorRect, setFilterAnchorRect] = useState(null);
  const [filters, setFilters] = useState({ glucose: true, insulin: true, carbs: true });
  const scrollRef = useRef(null);
  const centerMarkerRef = useRef(null);
  const tooltipValueRef = useRef(null);
  const tooltipTimeRef = useRef(null);
  const tooltipDateRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const pendingScrollLeftRef = useRef(0);
  const containerRef = useRef(null);
  const graphViewportRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(600);

  useEffect(() => {
    const target = graphViewportRef.current || containerRef.current;
    if (!target) return;
    const updateWidth = ([e]) => {
      const visualViewportWidth = window.visualViewport?.width;
      setContainerWidth(visualViewportWidth || e.contentRect.width);
    };
    const updateViewportWidth = () => {
      if (window.visualViewport?.width) setContainerWidth(window.visualViewport.width);
    };
    const ro = new ResizeObserver(updateWidth);
    ro.observe(target);
    window.visualViewport?.addEventListener("resize", updateViewportWidth);
    return () => {
      ro.disconnect();
      window.visualViewport?.removeEventListener("resize", updateViewportWidth);
    };
  }, []);

  const toggleFilter = (key) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  const targetLow = parseInt(localStorage.getItem("target_range_low") || "70", 10);
  const targetHigh = parseInt(localStorage.getItem("target_range_high") || "180", 10);

  const rangeTotal = GLUCOSE_MAX - GLUCOSE_MIN;
  const highPct = ((GLUCOSE_MAX - targetHigh) / rangeTotal * 100).toFixed(1);
  const lowPct = ((GLUCOSE_MAX - targetLow) / rangeTotal * 100).toFixed(1);

  // Only include doses/carbs if their filter is on
  const filteredDoses = filters.insulin ? doses : [];
  const filteredCarbEntries = filters.carbs ? carbEntries.map(normalizeCarbEntry).filter((entry) => entry.carbs > 0 && entry.consumed_at) : [];

  const sortedGlucoseReadings = useMemo(() =>
  glucoseReadings.
  map((reading) => ({
    ...reading,
    time: getReadingTime(reading),
    value: Number(getReadingValue(reading))
  })).
  filter((reading) => Number.isFinite(reading.time) && Number.isFinite(reading.value)).
  sort((a, b) => a.time - b.time),
  [glucoseReadings]
  );

  const latestGlucoseReading = sortedGlucoseReadings[sortedGlucoseReadings.length - 1];
  const latestGlucoseTime = latestGlucoseReading?.time ?? Math.round(Date.now() / STEP_MS) * STEP_MS;
  const latestGlucoseBucket = Math.round(latestGlucoseTime / STEP_MS) * STEP_MS;
  const domainStart = latestGlucoseBucket - HISTORY_DAYS * 24 * 60 * 60 * 1000;
  const domainEnd = latestGlucoseBucket + FUTURE_HOURS * 60 * 60 * 1000;
  const filteredGlucoseReadings = useMemo(() =>
  filters.glucose ?
  sortedGlucoseReadings.filter((reading) => reading.time >= domainStart && reading.time <= domainEnd) :
  [],
  [filters.glucose, sortedGlucoseReadings, domainStart, domainEnd]
  );

  const allCurvesMeta = useMemo(() =>
  filteredDoses.map((dose) => ({
    dose,
    curve: generateActivityCurve(dose, 3),
    profile: INSULIN_PROFILES[dose.insulin_type]
  })),
  [filteredDoses]
  );

  const allCarbCurvesMeta = useMemo(() =>
  filteredCarbEntries.
  filter((e) => !e.is_custom).
  map((entry) => ({
    entry,
    curve: buildCarbCurve(entry),
    color: CARB_PROFILE_COLORS[entry.absorption_profile] || PROFILE_COLORS[entry.absorption_profile] || "#f59e0b"
  })),
  [filteredCarbEntries]
  );

  const customCarbEvents = useMemo(() =>
  filteredCarbEntries.
  filter((e) => e.is_custom).
  map((e) => ({ time: new Date(e.consumed_at).getTime(), entry: e })),
  [filteredCarbEntries]
  );

  const glucoseMap = useMemo(() => {
    const map = {};
    filteredGlucoseReadings.forEach((g) => {
      const t = getReadingTime(g);
      const value = Number(getReadingValue(g));
      if (!Number.isFinite(t) || !Number.isFinite(value)) return;
      const bucket = Math.round(t / STEP_MS) * STEP_MS;
      map[bucket] = value;
    });
    return map;
  }, [filteredGlucoseReadings]);

  const glucoseLinePoints = useMemo(() =>
  Object.entries(glucoseMap).
  map(([time, value]) => ({ time: Number(time), value })).
  filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value)).
  sort((a, b) => a.time - b.time),
  [glucoseMap]
  );

  const maxDoseUnits = useMemo(() => Math.max(...filteredDoses.map((d) => d.units), 1), [filteredDoses]);
  const chartData = useMemo(() => {
    if (!doses.length && !glucoseReadings.length && !carbEntries.length) return [];
    const result = [];
    for (let t = domainStart; t <= domainEnd; t += STEP_MS) {
      const point = { time: t, bg: GLUCOSE_MAX };
      allCurvesMeta.forEach(({ dose, curve }) => {
        const key = `dose_${dose.id}`;
        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = null;
          point[`${key}_actual`] = null;
        } else {
          let lo = 0;
          for (let j = 0; j < curve.length - 1; j++) {
            if (curve[j].time <= t && curve[j + 1].time >= t) {lo = j;break;}
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
        if (!curve.length || t < curve[0].time || t > curve[curve.length - 1].time) {
          point[key] = null;
        } else {
          let lo = 0;
          for (let j = 0; j < curve.length - 1; j++) {
            if (curve[j].time <= t && curve[j + 1].time >= t) {lo = j;break;}
          }
          const hi = Math.min(lo + 1, curve.length - 1);
          const ratio = hi === lo ? 0 : (t - curve[lo].time) / (curve[hi].time - curve[lo].time);
          const activity = curve[lo].activity + ratio * (curve[hi].activity - curve[lo].activity);
          const carbVisualRatio = Math.min(entry.carbs, CARB_VISUAL_MAX_GRAMS) / CARB_VISUAL_MAX_GRAMS;
          point[key] = activity * carbVisualRatio * CARB_VISUAL_MAX_HEIGHT;
          point[`${key}_carbs`] = entry.carbs;
          point[`${key}_food`] = entry.food_name;
          point[`${key}_pace`] = CARB_PROFILE_LABELS[entry.absorption_profile] || "Mixed";
        }
      });
      if (glucoseMap[t] !== undefined) {
        point.glucose = Math.min(glucoseMap[t], GLUCOSE_MAX);
      }
      result.push(point);
    }
    return result;
  }, [doses, glucoseReadings, carbEntries, filters, domainStart, domainEnd, allCurvesMeta, allCarbCurvesMeta, glucoseMap]);

  const doseKeys = useMemo(() =>
  filteredDoses.map((dose) => ({
    key: `dose_${dose.id}`,
    label: dose.insulin_type.split(" ")[0],
    units: dose.units,
    color: INSULIN_PROFILES[dose.insulin_type]?.color || "#888"
  })),
  [filteredDoses]
  );

  const carbKeys = useMemo(() =>
  filteredCarbEntries.
  filter((e) => !e.is_custom).
  map((entry) => ({
    key: `carb_${entry.id}`,
    label: entry.food_name,
    carbs: entry.carbs,
    color: CARB_PROFILE_COLORS[entry.absorption_profile] || PROFILE_COLORS[entry.absorption_profile] || "#f59e0b"
  })),
  [filteredCarbEntries]
  );

  const totalMs = domainEnd - domainStart;
  const visibleMs = VISIBLE_HOURS * 60 * 60 * 1000;
  const pxPerMin = containerWidth / (visibleMs / 60000);
  const chartWidth = Math.max(containerWidth, Math.round(totalMs / 60000 * pxPerMin));
  const latestGlucoseX = (latestGlucoseBucket - domainStart) / totalMs * chartWidth;
  const maxScrollLeft = Math.max(0, Math.min(chartWidth - containerWidth, latestGlucoseX - containerWidth / 2));
  const plotHeight = CHART_HEIGHT - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM - X_AXIS_HEIGHT;

  const getGlucoseY = (value) => {
    const clamped = Math.min(Math.max(value, GLUCOSE_MIN), GLUCOSE_MAX);
    return CHART_MARGIN_TOP + (GLUCOSE_MAX - clamped) / (GLUCOSE_MAX - GLUCOSE_MIN) * plotHeight;
  };

  const getHighRangeOpacity = (value) => {
    const pctFromTop = (GLUCOSE_MAX - Math.min(value, GLUCOSE_MAX)) / (GLUCOSE_MAX - GLUCOSE_MIN);
    if (pctFromTop <= 0) return 0;
    if (pctFromTop < 0.1) return pctFromTop / 0.1 * 0.18;
    if (pctFromTop < 0.24) return 0.18 + (pctFromTop - 0.1) / 0.14 * 0.82;
    return 1;
  };

  const getCenterTimeForScroll = (scrollLeft) =>
  domainStart + (scrollLeft + containerWidth / 2) / chartWidth * totalMs;

  const getGlucoseAt = (time) => {
    if (!glucoseLinePoints.length) return null;

    if (time <= glucoseLinePoints[0].time) {
      return {
        value: glucoseLinePoints[0].value,
        plotValue: Math.min(glucoseLinePoints[0].value, GLUCOSE_MAX),
        time,
        sourceTime: glucoseLinePoints[0].time
      };
    }

    const lastReading = glucoseLinePoints[glucoseLinePoints.length - 1];
    if (time >= lastReading.time) {
      return {
        value: lastReading.value,
        plotValue: Math.min(lastReading.value, GLUCOSE_MAX),
        time,
        sourceTime: lastReading.time
      };
    }

    for (let i = 1; i < glucoseLinePoints.length; i++) {
      const previous = glucoseLinePoints[i - 1];
      const next = glucoseLinePoints[i];
      if (time > next.time) continue;

      const span = next.time - previous.time;
      const ratio = span > 0 ? (time - previous.time) / span : 0;
      const value = previous.value + (next.value - previous.value) * ratio;
      const previousPlotValue = Math.min(previous.value, GLUCOSE_MAX);
      const nextPlotValue = Math.min(next.value, GLUCOSE_MAX);
      const plotValue = previousPlotValue + (nextPlotValue - previousPlotValue) * ratio;
      const sourceTime = Math.abs(time - previous.time) <= Math.abs(next.time - time) ? previous.time : next.time;

      return { value, plotValue, time, sourceTime };
    }

    return {
      value: lastReading.value,
      plotValue: Math.min(lastReading.value, GLUCOSE_MAX),
      time,
      sourceTime: lastReading.time
    };
  };

  const drawCenterGlucose = (scrollLeft) => {
    const marker = centerMarkerRef.current;
    const valueEl = tooltipValueRef.current;
    const timeEl = tooltipTimeRef.current;
    const dateEl = tooltipDateRef.current;

    if (!filters.glucose || !glucoseLinePoints.length) {
      if (marker) marker.style.opacity = "0";
      return;
    }

    const centerTime = getCenterTimeForScroll(scrollLeft);
    const glucose = getGlucoseAt(centerTime);
    if (!glucose) {
      if (marker) marker.style.opacity = "0";
      return;
    }

    if (marker) {
      marker.style.transform = `translate3d(-50%, ${getGlucoseY(glucose.plotValue)}px, 0) translateY(-50%)`;
      marker.style.opacity = String(getHighRangeOpacity(glucose.plotValue));
    }

    if (valueEl) valueEl.textContent = formatGlucoseDisplay(glucose.value);
    if (timeEl) timeEl.textContent = format(new Date(glucose.time), "h:mm a");
    if (dateEl) dateEl.textContent = format(new Date(glucose.time), "EEEE, MMM d");
  };

  const scheduleCenterGlucoseUpdate = (scrollLeft) => {
    pendingScrollLeftRef.current = scrollLeft;
    if (scrollFrameRef.current) return;

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      drawCenterGlucose(pendingScrollLeftRef.current);
    });
  };

  const scrollToLatestGlucose = () => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollTo({ left: maxScrollLeft, behavior: "smooth" });
    scheduleCenterGlucoseUpdate(maxScrollLeft);
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollLeft = maxScrollLeft;
    drawCenterGlucose(maxScrollLeft);

    return () => {
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, [maxScrollLeft, latestGlucoseBucket, filters.glucose, glucoseLinePoints.length]);

  if (!doses.length && !glucoseReadings.length && !carbEntries.length) return null;

  const timeTicks = [];
  const firstTick = Math.ceil(domainStart / HALF_HOUR_MS) * HALF_HOUR_MS;
  for (let tick = firstTick; tick <= domainEnd; tick += HALF_HOUR_MS) {
    timeTicks.push(tick);
  }

  // How many filters are off (to show indicator dot)
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div ref={containerRef} className="relative overflow-visible">
      {/* Controls row */}
      <div className="flex py-3 items-center mb-4 justify-start pl-4 gap-2">

        {/* Filter button */}
        <div className="relative justify-start">
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setFilterAnchorRect(rect);
              setShowFilter((v) => !v);
            }}
            className={`w-8 h-8 flex items-center rounded-xl border transition-all relative hidden justify-center ${
            showFilter ?
            "bg-teal-500/10 border-teal-500/30 text-teal-400" :
            "border-white/5 bg-white/[0.03] text-white/40 hover:text-white/80 hover:bg-white/[0.08]"}`
            }>
            
            <SlidersHorizontal className="w-4 h-4" />
            {activeFilterCount < 3 &&
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-teal-400" />
            }
          </button>
        </div>
        {/* Portal-style backdrop + dropdown rendered outside flow */}
        <AnimatePresence>
          {showFilter && filterAnchorRect &&
          <>
              <div className="fixed inset-0 z-[199]" onClick={() => setShowFilter(false)} />
              <FilterDropdown filters={filters} onChange={toggleFilter} anchorRect={filterAnchorRect} />
            </>
          }
        </AnimatePresence>
      </div>
      <div className="relative">
      <button
        type="button"
        onClick={scrollToLatestGlucose}
        className="absolute right-0 top-0 z-30 flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/55 shadow-lg transition-colors hover:bg-white/[0.1] hover:text-white/85"
        aria-label="Scroll to latest glucose">
          <CornerUpRight className="h-4 w-4" />
        </button>
      <div
        ref={graphViewportRef}
        className="relative overflow-hidden"
        style={{
          left: "50%",
          right: "50%",
          width: "100dvw",
          maxWidth: "100dvw",
          marginLeft: "-50dvw",
          marginRight: "-50dvw"
        }}>
      {filters.glucose && glucoseLinePoints.length > 0 &&
      <div className="pointer-events-none absolute left-1/2 top-0 z-20 -translate-x-1/2 px-3 py-1 text-center">
          <div className="text-2xl font-black leading-none text-white">
            <span ref={tooltipValueRef}>{formatGlucoseDisplay(glucoseLinePoints[glucoseLinePoints.length - 1].value)}</span> <span className="text-xs font-medium text-white/35">mg/dL</span>
          </div>
          <div ref={tooltipTimeRef} className="mt-1 text-xs font-medium text-white/35">{format(new Date(glucoseLinePoints[glucoseLinePoints.length - 1].time), "h:mm a")}</div>
          <div ref={tooltipDateRef} className="mt-0.5 text-[10px] font-medium text-white/30">{format(new Date(glucoseLinePoints[glucoseLinePoints.length - 1].time), "EEEE, MMM d")}</div>
        </div>
      }
      {filters.glucose && glucoseLinePoints.length > 0 &&
      <div
        ref={centerMarkerRef}
        className="pointer-events-none absolute left-1/2 top-0 z-10 h-4 w-4 rounded-full bg-white opacity-0"
        style={{
          transform: "translate3d(-50%, 0, 0) translateY(-50%)",
          boxShadow: "0 0 0 4px rgba(255,255,255,0.22), 0 0 10px rgba(255,255,255,0.38)",
          willChange: "transform, opacity"
        }} />
      }
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        onScroll={(event) => {
          const el = event.currentTarget;
          if (el.scrollLeft > maxScrollLeft) {
            el.scrollLeft = maxScrollLeft;
            scheduleCenterGlucoseUpdate(maxScrollLeft);
            return;
          }
          scheduleCenterGlucoseUpdate(el.scrollLeft);
        }}
        style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}>
        <div style={{ width: chartWidth, height: CHART_HEIGHT }}>
          <ComposedChart
            width={chartWidth}
            height={CHART_HEIGHT}
            data={chartData}
            margin={{ top: CHART_MARGIN_TOP, right: 0, left: -20, bottom: CHART_MARGIN_BOTTOM }}>
            <defs>
              {carbKeys.map((k) =>
              <linearGradient key={k.key} id={`grad_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={k.color} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={k.color} stopOpacity={0.0} />
                </linearGradient>
              )}
              <linearGradient id="glucose_range_grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#78350f" stopOpacity={0} />
                <stop offset={`${highPct}%`} stopColor="#78350f" stopOpacity={0} />
                <stop offset={`${highPct}%`} stopColor="#78350f" stopOpacity={0.4} />
                <stop offset={`${lowPct}%`} stopColor="#78350f" stopOpacity={0.4} />
                <stop offset={`${lowPct}%`} stopColor="#78350f" stopOpacity={0} />
                <stop offset="100%" stopColor="#78350f" stopOpacity={0} />
              </linearGradient>
              <linearGradient
                id="glucose_line_grad"
                gradientUnits="userSpaceOnUse"
                x1="0"
                y1={CHART_MARGIN_TOP}
                x2="0"
                y2={CHART_HEIGHT - CHART_MARGIN_BOTTOM - X_AXIS_HEIGHT}>
                <stop offset="0%" stopColor="rgba(255,255,255,0.72)" stopOpacity={0} />
                <stop offset="10%" stopColor="rgba(255,255,255,0.72)" stopOpacity={0.18} />
                <stop offset="24%" stopColor="rgba(255,255,255,0.72)" stopOpacity={0.72} />
                <stop offset="100%" stopColor="rgba(255,255,255,0.72)" stopOpacity={0.72} />
              </linearGradient>
            </defs>

            <XAxis
              dataKey="time"
              type="number"
              domain={[domainStart, domainEnd]}
              ticks={timeTicks}
              tick={<TimeAxisTick />}
              axisLine={false}
              tickLine={false}
              height={X_AXIS_HEIGHT}
              interval={0} />
            

            <YAxis yAxisId="insulin" domain={[0, 75]} hide />
            <YAxis yAxisId="carbs" domain={[0, CARB_VISUAL_MAX_HEIGHT]} hide />
            <YAxis yAxisId="glucose" domain={[GLUCOSE_MIN, GLUCOSE_MAX]} allowDataOverflow hide />

            {filters.glucose && filteredGlucoseReadings.length > 0 &&
            <Area
              yAxisId="glucose"
              type="monotoneX"
              dataKey="bg"
              stroke="none"
              fill="url(#glucose_range_grad)"
              isAnimationActive={false}
              dot={false}
              activeDot={false}
              legendType="none" />

            }

            {doseKeys.map((k) =>
            <Area
              key={k.key}
              yAxisId="insulin"
              type="basis"
              dataKey={k.key}
              name={k.label}
              stroke="none"
              fill={k.color}
              fillOpacity={1}
              dot={false}
              activeDot={false}
              isAnimationActive={false} />

            )}

            {carbKeys.map((k) =>
            <Area
              key={k.key}
              yAxisId="carbs"
              type="monotoneX"
              dataKey={k.key}
              name={k.label}
              stroke={k.color}
              strokeWidth={2}
              strokeDasharray="5 3"
              fill={`url(#grad_${k.key})`}
              dot={false}
              isAnimationActive={false}
              opacity={0.72} />

            )}

            {customCarbEvents.map(({ time, entry }) =>
            <ReferenceLine
              key={`custom_${entry.id}`}
              yAxisId="carbs"
              x={time}
              stroke="#6b7280"
              strokeDasharray="3 3"
              strokeWidth={1.5}
              label={{ value: `${entry.carbs}g`, position: "insideTopRight", fill: "#9ca3af", fontSize: 9 }} />

            )}

            {filters.glucose && filteredGlucoseReadings.length > 0 &&
            <Line
              yAxisId="glucose"
              type="linear"
              dataKey="glucose"
              name="Glucose"
              stroke="url(#glucose_line_grad)"
              strokeWidth={2.2}
              dot={false}
              activeDot={false}
              connectNulls={true}
              isAnimationActive={false} />

            }

          </ComposedChart>
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 z-20 w-16"
        style={{
          background: "linear-gradient(to right, hsl(162,10%,10%) 0%, rgba(20,28,25,0.78) 42%, rgba(20,28,25,0) 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)"
        }} />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 z-20 w-16"
        style={{
          background: "linear-gradient(to left, hsl(162,10%,10%) 0%, rgba(20,28,25,0.78) 42%, rgba(20,28,25,0) 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 12%, black 88%, transparent 100%)"
        }} />
      </div>
      </div>
    </div>);

}
