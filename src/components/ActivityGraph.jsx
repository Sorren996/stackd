import { useMemo, useRef, useEffect, useState } from "react";
import { Area, XAxis, YAxis, Line, ComposedChart, ReferenceLine } from "recharts";
import { generateActivityCurve, getDoseIOB, getInsulinProfile, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { PROFILE_COLORS } from "@/lib/carbAbsorption";
import { format } from "date-fns";
import { AlertTriangle, CornerUpRight, SlidersHorizontal, Check, Wheat, Pencil, Trash2, Info } from "lucide-react";
import { HIGH_PROTEIN_FAT_MONITORING_HOURS, mergeMonitoringIntervals } from "@/lib/mealMonitoring";
import { GLUCOSE_STATUS_COLORS, readHighReference, FIXED_LOW_REFERENCE } from "@/lib/glucoseStatus";
import { motion, AnimatePresence } from "framer-motion";
import InfoPopover from "@/components/graph/InfoPopover";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { useGlucoseStaleness } from "@/hooks/useGlucoseStaleness";
import { getLatestDexcomReading, formatReadingAge } from "@/lib/glucoseStaleness";
import GlucoseTicker from "@/components/graph/GlucoseTicker";
import TimeViewToggle from "@/components/graph/TimeViewToggle";
import CandlestickView from "@/components/graph/CandlestickView";
import ReferenceLabels from "@/components/graph/ReferenceLabels";
import GraphLowerSection from "@/components/graph/GraphLowerSection";

const STEP_MS = 3 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
const HISTORY_DAYS = 7;
const FUTURE_HOURS = 3;
const VISIBLE_HOURS = 6;
const HOUR_MS = 60 * 60 * 1000;
const CANDLESTICK_HISTORY_HOURS = 72;
const CANDLESTICK_FUTURE_HOURS = 12;
const CHART_HEIGHT = 305;
const CANDLESTICK_TOTAL_HEIGHT = 425;
const CHART_MARGIN_TOP = 70;
const CHART_MARGIN_BOTTOM = 0;
const X_AXIS_HEIGHT = 30;
const GLUCOSE_CHART_HEIGHT = 224;
const GLUCOSE_MARGIN_TOP = 62;
const GLUCOSE_PLOT_HEIGHT = GLUCOSE_CHART_HEIGHT - GLUCOSE_MARGIN_TOP;
const CARB_LANE_HEIGHT = 34;
const INSULIN_CHART_HEIGHT = 112;
const INSULIN_MARGIN_TOP = 24;
const INSULIN_PLOT_HEIGHT = INSULIN_CHART_HEIGHT - INSULIN_MARGIN_TOP - X_AXIS_HEIGHT;
const TWO_PLANE_HEIGHT = GLUCOSE_CHART_HEIGHT + CARB_LANE_HEIGHT + INSULIN_CHART_HEIGHT;
const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 250;
const CARB_PROFILE_COLORS = {
  fast: "#fb923c",
  medium: "#f59e0b",
  slow: "#22c55e",
  delayed: "#a78bfa"
};

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };

  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);

  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180
  };
}

// User's preferred normal upper Y-axis display limit (display only — never
// clamps raw glucose). Defaults to 400 so existing users keep generous headroom.
function readGraphHeight() {
  if (typeof window === "undefined") return 400;
  const v = Number(window.localStorage.getItem("graph_height"));
  return v === 300 || v === 400 ? v : 400;
}

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

function getDoseUnits(dose) {
  const direct = Number(dose?.units);
  if (Number.isFinite(direct) && direct > 0) return direct;

  const meal = Number(dose?.meal_units);
  const correction = Number(dose?.correction_units);
  const mealUnits = Number.isFinite(meal) && meal > 0 ? meal : 0;
  const correctionUnits = Number.isFinite(correction) && correction > 0 ? correction : 0;
  return mealUnits + correctionUnits;
}

function getDoseKey(dose, index = 0) {
  const time = dose?.administered_at || dose?.administeredAt || dose?.created_at || dose?.created_date || index;
  const rawKey = dose?.id || dose?._id || `${dose?.insulin_type || "insulin"}_${time}`;
  return `dose_${String(rawKey).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function formatGlucoseDisplay(value) {
  return Math.round(value);
}

function formatReadingTime(time) {
  if (!Number.isFinite(time)) return "—";
  return format(new Date(time), "h:mm a");
}

function buildMonotoneSegments(points, getValue) {
  if (!Array.isArray(points) || points.length < 2) return [];

  const sorted = points.
  map((point) => ({ x: Number(point.time), y: Number(getValue(point)) })).
  filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).
  sort((a, b) => a.x - b.x);

  if (sorted.length < 2) return [];

  const h = [];
  const delta = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const width = sorted[index + 1].x - sorted[index].x;
    h[index] = width;
    delta[index] = width > 0 ? (sorted[index + 1].y - sorted[index].y) / width : 0;
  }

  const slopes = Array(sorted.length).fill(0);
  slopes[0] = delta[0];
  slopes[sorted.length - 1] = delta[delta.length - 1];

  for (let index = 1; index < sorted.length - 1; index += 1) {
    if (delta[index - 1] * delta[index] <= 0) {
      slopes[index] = 0;
      continue;
    }

    const w1 = 2 * h[index] + h[index - 1];
    const w2 = h[index] + 2 * h[index - 1];
    slopes[index] = (w1 + w2) / (w1 / delta[index - 1] + w2 / delta[index]);
  }

  return sorted.slice(0, -1).map((point, index) => ({
    x0: point.x,
    x1: sorted[index + 1].x,
    y0: point.y,
    y1: sorted[index + 1].y,
    m0: slopes[index],
    m1: slopes[index + 1]
  }));
}

function interpolateMonotoneSegment(segment, x) {
  if (!segment || segment.x1 === segment.x0) return segment?.y0 ?? null;

  const width = segment.x1 - segment.x0;
  const t = Math.max(0, Math.min(1, (x - segment.x0) / width));
  const t2 = t * t;
  const t3 = t2 * t;

  return (
    (2 * t3 - 3 * t2 + 1) * segment.y0 +
    (t3 - 2 * t2 + t) * width * segment.m0 +
    (-2 * t3 + 3 * t2) * segment.y1 +
    (t3 - t2) * width * segment.m1);

}

function TimeAxisTick({ x, y, payload }) {
  const date = new Date(payload.value);
  const minute = date.getMinutes();

  if (minute === 30) {
    return <circle cx={x} cy={y + 6} r={1} fill="rgba(255,255,255,0.12)" />;
  }

  if (minute === 0) {
    return (
      <text
        x={x}
        y={y + 11}
        textAnchor="middle"
        fill="rgba(255,255,255,0.22)"
        fontSize={9}
        fontWeight={500}>
        {format(date, "h a")}
      </text>);

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
    is_custom: entry.is_custom === true
  };
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

export default function ActivityGraph({ doses, glucoseReadings = [], carbEntries = [], onSelectLog = null, onDeleteLog = null, glucoseReadOnly = false }) {
  const [showFilter, setShowFilter] = useState(false);
  const [filterAnchorRect, setFilterAnchorRect] = useState(null);
  const [filters, setFilters] = useState({ glucose: true, insulin: true, carbs: true });
  const [viewWindow, setViewWindow] = useState(6);
  const isCandlestick = viewWindow === 24;
  const [activeMarker, setActiveMarker] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedDoseKey, setSelectedDoseKey] = useState(null);
  const { connected: dexcomConnected } = useDexcomConnection();

  const openMarker = (type, item, rect) => {
    setConfirmDelete(false);
    setActiveMarker({ type, item, rect });
  };
  const closeMarker = () => {
    setConfirmDelete(false);
    setActiveMarker(null);
    setSelectedDoseKey(null);
  };
  const handleDoseTap = (dose, key, rect) => {
    setSelectedDoseKey(key);
    openMarker("insulin", dose, rect);
  };
  const handleEdit = () => {
    if (!activeMarker || !onSelectLog) return;
    onSelectLog({ type: activeMarker.type, item: activeMarker.item });
    closeMarker();
  };
  const handleDelete = () => {
    if (!activeMarker || !onDeleteLog) return;
    onDeleteLog({ type: activeMarker.type, item: activeMarker.item });
    setConfirmDelete(false);
    closeMarker();
  };

  const handleIndicatorClick = (e) => {
    if (!filteredGlucoseReadings.length) return;
    const scrollLeft = scrollRef.current?.scrollLeft ?? maxScrollLeft;
    const centerTime = getCenterTimeForScroll(scrollLeft);
    let nearest = null;
    for (const reading of filteredGlucoseReadings) {
      const dist = Math.abs(reading.time - centerTime);
      if (!nearest || dist < nearest.dist) nearest = { reading, dist };
    }
    if (nearest?.reading) {
      openMarker("glucose", nearest.reading, e.currentTarget.getBoundingClientRect());
    }
  };
  const scrollRef = useRef(null);
  const centerMarkerRef = useRef(null);
  const tickerRef = useRef(null);
  const tooltipTimeRef = useRef(null);
  const tooltipDateRef = useRef(null);
  const scrollFrameRef = useRef(null);
  const prevLatestValueRef = useRef(null);
  const prevGlowStatusRef = useRef(null);
  const prevOverReferenceRef = useRef(false);
  const pendingScrollLeftRef = useRef(0);
  const containerRef = useRef(null);
  const graphViewportRef = useRef(null);
  const monitoringGradientRef = useRef(null);
  const monitoringLabelRef = useRef(null);
  const monitoringA11yRef = useRef(null);
  const prevMonitoringActiveRef = useRef(false);
  const monitoringBandRefs = useRef([]);
  const [containerWidth, setContainerWidth] = useState(600);
  const [targetRange, setTargetRange] = useState(readTargetRange);
  const [graphHeight, setGraphHeight] = useState(readGraphHeight);
  const [highReference, setHighReference] = useState(readHighReference);

  useEffect(() => {
    const target = graphViewportRef.current || containerRef.current;
    if (!target) return;
    const ro = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width);
    });
    ro.observe(target);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const updateSettings = () => {
      setTargetRange(readTargetRange());
      setGraphHeight(readGraphHeight());
      setHighReference(readHighReference());
    };

    window.addEventListener("target-range-updated", updateSettings);
    window.addEventListener("insulin-settings-updated", updateSettings);
    window.addEventListener("storage", updateSettings);

    return () => {
      window.removeEventListener("target-range-updated", updateSettings);
      window.removeEventListener("insulin-settings-updated", updateSettings);
      window.removeEventListener("storage", updateSettings);
    };
  }, []);

  const toggleFilter = (key) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  const targetLow = targetRange.low;
  const targetHigh = targetRange.high;

  // Effective Y-axis bounds: the user's preferred graph height is the normal
  // ceiling (lower boundary 40). When visible data exceeds those bounds, the
  // scale temporarily expands with padding so the real reading is always shown.
  // This is a display scale only — raw glucose values are never clamped.
  const { effectiveMax, effectiveMin } = useMemo(() => {
    let visibleMax = -Infinity;
    let visibleMin = Infinity;
    for (const r of (glucoseReadings || [])) {
      const v = Number(getReadingValue(r));
      if (!Number.isFinite(v)) continue;
      if (v > visibleMax) visibleMax = v;
      if (v < visibleMin) visibleMin = v;
    }
    const maxBase = Math.max(graphHeight, Number.isFinite(visibleMax) ? visibleMax : graphHeight);
    const max = visibleMax > graphHeight ? Math.ceil(maxBase / 50) * 50 : graphHeight;
    const min = Number.isFinite(visibleMin) && visibleMin < 40 ? Math.floor(visibleMin / 10) * 10 : 40;
    return { effectiveMax: max, effectiveMin: min };
  }, [glucoseReadings, graphHeight]);

  const rangeTotal = effectiveMax - effectiveMin;
  const highPct = ((effectiveMax - targetHigh) / rangeTotal * 100).toFixed(1);
  const lowPct = ((effectiveMax - targetLow) / rangeTotal * 100).toFixed(1);

  // Glucose line gradient stops, fully derived from the user's target range so
  // the red / white / amber transitions track custom ranges (not just the 70–180 preset).
  // Stops are clamped to monotonically increasing offsets to avoid invalid gradients
  // when the target band is narrow or sits near the chart edges.
  const lineGradStops = useMemo(() => {
    const hi = Number(highPct);
    const lo = Number(lowPct);
    const highRefPct = Number(((effectiveMax - highReference) / rangeTotal * 100).toFixed(1));
    const lowRefPct = Number(((effectiveMax - FIXED_LOW_REFERENCE) / rangeTotal * 100).toFixed(1));
    const fadeIn = Math.min(Math.max(4, hi * 0.4), Math.max(4, hi - 3));
    const raw = [
    { offset: 0, color: GLUCOSE_STATUS_COLORS.high, opacity: 0 },
    { offset: fadeIn, color: GLUCOSE_STATUS_COLORS.high, opacity: 0.18 },
    { offset: highRefPct, color: GLUCOSE_STATUS_COLORS.high, opacity: 0.9 },
    { offset: Math.max(0, hi - 3), color: GLUCOSE_STATUS_COLORS.high, opacity: 0.6 },
    { offset: Math.min(100, hi + 3), color: "#ffffff", opacity: 0.6 },
    { offset: Math.max(0, lo - 3), color: "#ffffff", opacity: 0.6 },
    { offset: Math.min(100, lo + 3), color: GLUCOSE_STATUS_COLORS.low, opacity: 0.6 },
    { offset: lowRefPct, color: GLUCOSE_STATUS_COLORS.low, opacity: 0.9 },
    { offset: 100, color: GLUCOSE_STATUS_COLORS.low, opacity: 0.9 }];

    let prev = 0;
    return raw.map((stop) => {
      const offset = Math.max(prev, Math.min(100, stop.offset));
      prev = offset;
      return { ...stop, offset };
    });
  }, [highPct, lowPct, effectiveMax, rangeTotal, highReference]);

  // Only include doses/carbs if their filter is on
  const filteredDoses = filters.insulin ? doses : [];
  const filteredCarbEntries = filters.carbs ? carbEntries.map(normalizeCarbEntry).filter((entry) => entry.carbs > 0 && entry.consumed_at) : [];

  const sortedGlucoseReadings = useMemo(() =>
  glucoseReadings.
  filter((reading) => {
    if (reading.source === "system") return false;
    // When connected to Dexcom, use CGM data exclusively for a smooth,
    // continuous line — just like Oura's reporting style.
    if (dexcomConnected && reading.source !== "dexcom" && reading.source !== "dexcom_share") return false;
    return true;
  }).
  map((reading) => ({
    ...reading,
    time: getReadingTime(reading),
    value: Number(getReadingValue(reading))
  })).
  filter((reading) => Number.isFinite(reading.time) && Number.isFinite(reading.value)).
  sort((a, b) => a.time - b.time),
  [glucoseReadings, dexcomConnected]
  );

  const latestGlucoseReading = sortedGlucoseReadings[sortedGlucoseReadings.length - 1];
  const latestDexcomReading = useMemo(
    () => getLatestDexcomReading(sortedGlucoseReadings),
    [sortedGlucoseReadings]
  );
  const isGlucoseStale = useGlucoseStaleness(latestDexcomReading, dexcomConnected);
  const latestGlucoseTime = latestGlucoseReading?.time ?? Math.round(Date.now() / STEP_MS) * STEP_MS;
  const latestGlucoseBucket = isCandlestick ?
  Math.floor(latestGlucoseTime / HOUR_MS) * HOUR_MS :
  Math.round(latestGlucoseTime / STEP_MS) * STEP_MS;
  const futureHours = Math.max(FUTURE_HOURS, Math.ceil(viewWindow / 2));
  const domainStart = isCandlestick ?
  latestGlucoseBucket - CANDLESTICK_HISTORY_HOURS * HOUR_MS :
  latestGlucoseBucket - HISTORY_DAYS * 24 * HOUR_MS;
  const domainEnd = isCandlestick ?
  latestGlucoseBucket + CANDLESTICK_FUTURE_HOURS * HOUR_MS :
  latestGlucoseBucket + futureHours * HOUR_MS;
  const filteredGlucoseReadings = useMemo(() =>
  filters.glucose ?
  sortedGlucoseReadings.filter((reading) => reading.time >= domainStart && reading.time <= domainEnd) :
  [],
  [filters.glucose, sortedGlucoseReadings, domainStart, domainEnd]
  );

  const allCurvesMeta = useMemo(() =>
  filteredDoses.map((dose, index) => ({
    dose,
    key: getDoseKey(dose, index),
    curve: generateActivityCurve(dose, 3)
  })),
  [filteredDoses]
  );

  const carbEventMarkers = useMemo(() =>
  filteredCarbEntries.
  map((entry) => ({
    time: new Date(entry.consumed_at).getTime(),
    entry,
    color: CARB_PROFILE_COLORS[entry.absorption_profile] || PROFILE_COLORS[entry.absorption_profile] || "#f59e0b"
  })).
  filter((marker) => Number.isFinite(marker.time) && marker.time >= domainStart && marker.time <= domainEnd),
  [filteredCarbEntries, domainStart, domainEnd]
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

  const glucoseCurveSegments = useMemo(() => ({
    value: buildMonotoneSegments(glucoseLinePoints, (point) => point.value),
    plotValue: buildMonotoneSegments(glucoseLinePoints, (point) => Math.min(point.value, effectiveMax))
  }), [glucoseLinePoints, effectiveMax]);

  const maxBolusUnits = useMemo(
    () => Math.max(...filteredDoses.filter((d) => !isBasalInsulinType(d.insulin_type)).map(getDoseUnits), 1),
    [filteredDoses]
  );
  const maxBasalUnits = useMemo(
    () => Math.max(...filteredDoses.filter((d) => isBasalInsulinType(d.insulin_type)).map(getDoseUnits), 1),
    [filteredDoses]
  );
  const chartData = useMemo(() => {
    if (!doses.length && !glucoseReadings.length && !carbEntries.length) return [];
    const result = [];
    for (let t = domainStart; t <= domainEnd; t += STEP_MS) {
      const point = { time: t, bg: effectiveMax };
      allCurvesMeta.forEach(({ dose, key, curve }) => {
        const doseUnits = getDoseUnits(dose);
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
          const activeUnits = curve[lo].activeUnits + ratio * (curve[hi].activeUnits - curve[lo].activeUnits);
          const isBasal = isBasalInsulinType(dose.insulin_type);
          const visualMax = isBasal ? 30 : 70;
          const refMax = isBasal ? maxBasalUnits : maxBolusUnits;
          point[key] = activity * (doseUnits / refMax) * visualMax;
          point[`${key}_actual`] = activeUnits;
          point[`${key}_activity`] = activity;
          point[`${key}_total`] = doseUnits;
        }
      });
      if (glucoseMap[t] !== undefined) {
        point.glucose = Math.min(glucoseMap[t], effectiveMax);
      }
      result.push(point);
    }
    return result;
  }, [doses, glucoseReadings, carbEntries, filters, domainStart, domainEnd, allCurvesMeta, glucoseMap, maxBolusUnits, maxBasalUnits, effectiveMax]);

  const doseKeys = useMemo(() =>
  filteredDoses.map((dose, index) => ({
    key: getDoseKey(dose, index),
    label: String(dose.insulin_type || "Insulin").split(" ")[0],
    units: getDoseUnits(dose),
    color: getInsulinProfile(dose.insulin_type)?.color || "#888",
    isBasal: isBasalInsulinType(dose.insulin_type)
  })),
  [filteredDoses]
  );

  // Only insulin types whose curves have activity overlapping the visible
  // graph window — drives the legend so it reflects what's actually shown.
  const activeDoseKeys = useMemo(() => {
    const active = new Map();
    allCurvesMeta.forEach(({ dose, curve }) => {
      if (!curve.length) return;
      const curveStart = curve[0].time;
      const curveEnd = curve[curve.length - 1].time;
      if (curveStart > domainEnd || curveEnd < domainStart) return;
      const label = String(dose.insulin_type || "Insulin").split(" ")[0];
      if (active.has(label)) return;
      active.set(label, {
        label,
        color: getInsulinProfile(dose.insulin_type)?.color || "#888",
      });
    });
    return Array.from(active.values());
  }, [allCurvesMeta, domainStart, domainEnd]);

  const totalMs = domainEnd - domainStart;
  const visibleMs = viewWindow * 60 * 60 * 1000;
  const pxPerMin = containerWidth / (visibleMs / 60000);
  const chartWidth = Math.max(containerWidth, Math.round(totalMs / 60000 * pxPerMin));
  const latestGlucoseX = (latestGlucoseBucket - domainStart) / totalMs * chartWidth;
  const maxScrollLeft = Math.max(0, Math.min(chartWidth - containerWidth, latestGlucoseX - containerWidth / 2));
  const plotHeight = GLUCOSE_PLOT_HEIGHT;

  const mergedMonitoringIntervals = useMemo(() => {
    const MS = HIGH_PROTEIN_FAT_MONITORING_HOURS * 60 * 60 * 1000;
    const intervals = (Array.isArray(carbEntries) ? carbEntries : []).
    filter((e) => e.is_high_protein_fat_meal === true && e.consumed_at).
    map((e) => {const s = new Date(e.consumed_at).getTime();return Number.isFinite(s) ? { start: s, end: s + MS } : null;}).
    filter(Boolean);
    return mergeMonitoringIntervals(intervals);
  }, [carbEntries]);

  const monitoringBandTop = GLUCOSE_MARGIN_TOP;
  const monitoringBandHeight = plotHeight;

  const positionedMonitoringIntervals = useMemo(() => {
    return mergedMonitoringIntervals.
    map((iv) => {
      const startX = (iv.start - domainStart) / totalMs * chartWidth;
      const endX = (iv.end - domainStart) / totalMs * chartWidth;
      return { start: iv.start, end: iv.end, x: startX, width: Math.max(2, endX - startX) };
    }).
    filter((iv) => iv.width > 0 && iv.x + iv.width > 0 && iv.x < chartWidth);
  }, [mergedMonitoringIntervals, domainStart, totalMs, chartWidth]);

  const positionedCarbMarkers = useMemo(() => {
    const laneLastX = [];
    const laneCount = 2;
    const minMarkerGap = 72;

    return carbEventMarkers.
    slice().
    sort((a, b) => a.time - b.time).
    map((marker) => {
      const x = (marker.time - domainStart) / totalMs * chartWidth;
      let lane = laneLastX.findIndex((lastX) => x - lastX >= minMarkerGap);

      if (lane === -1) {
        lane = laneLastX.length < laneCount ? laneLastX.length : 0;
        if (laneLastX.length >= laneCount) {
          lane = laneLastX.indexOf(Math.min(...laneLastX));
        }
      }

      laneLastX[lane] = x;
      return { ...marker, x, lane };
    });
  }, [carbEventMarkers, domainStart, totalMs, chartWidth]);

  const positionedDoseMarkers = useMemo(() => {
    const placed = [];
    const pillHeight = 16;
    const pillGap = 3;
    const stackGap = 2;
    const minHorizontalGap = 44;

    // Map each dose key to the peak activity time of its PK curve so the pill
    // sits above the most recognizable point of its corresponding curve.
    const peakInfoByKey = {};
    allCurvesMeta.forEach(({ dose, key, curve }) => {
      if (!curve.length) return;
      let peak = curve[0];
      for (const p of curve) {
        if (p.activity > peak.activity) peak = p;
      }
      const doseUnits = getDoseUnits(dose);
      const isBasal = isBasalInsulinType(dose.insulin_type);
      const refMax = isBasal ? maxBasalUnits : maxBolusUnits;
      const visualMax = isBasal ? 30 : 70;
      const peakValue = peak.activity * (doseUnits / refMax) * visualMax;
      const peakY = INSULIN_MARGIN_TOP + (75 - peakValue) / 75 * INSULIN_PLOT_HEIGHT;
      peakInfoByKey[key] = { peakTime: peak.time, peakY };
    });

    return filteredDoses.
    slice().
    sort((a, b) => {
      const aTime = new Date(a.administered_at || a.created_at || a.created_date).getTime();
      const bTime = new Date(b.administered_at || b.created_at || b.created_date).getTime();
      return aTime - bTime;
    }).
    map((dose, index) => {
      const key = getDoseKey(dose, index);
      const { peakTime, peakY } = peakInfoByKey[key] || {};
      if (!Number.isFinite(peakTime) || peakTime < domainStart || peakTime > domainEnd) return null;
      const units = getDoseUnits(dose);
      if (!Number.isFinite(units) || units <= 0) return null;
      const x = (peakTime - domainStart) / totalMs * chartWidth;
      const color = getInsulinProfile(dose.insulin_type)?.color || "#888";

      // Default: pill sits just above the curve peak.
      let pillTop = peakY - pillHeight - pillGap;

      // Nudge upward only when colliding with an already-placed pill.
      for (let iter = 0; iter < 6; iter++) {
        let collision = false;
        for (const p of placed) {
          if (Math.abs(x - p.x) >= minHorizontalGap) continue;
          const pTop = p.pillTop;
          const pBottom = p.pillTop + pillHeight;
          if (pillTop < pBottom + stackGap && pillTop + pillHeight > pTop - stackGap) {
            pillTop = pTop - pillHeight - stackGap;
            collision = true;
          }
        }
        if (!collision) break;
      }

      pillTop = Math.max(pillTop, 0);

      placed.push({ x, pillTop });
      return { dose, x, units, key, color, pillTop, peakY };
    }).
    filter(Boolean);
  }, [filteredDoses, allCurvesMeta, maxBolusUnits, maxBasalUnits, domainStart, domainEnd, totalMs, chartWidth]);

  const getGlucoseY = (value) => {
    const clamped = Math.min(Math.max(value, effectiveMin), effectiveMax);
    return GLUCOSE_MARGIN_TOP + (effectiveMax - clamped) / (effectiveMax - effectiveMin) * plotHeight;
  };

  const getHighRangeOpacity = (value) => {
    const pctFromTop = (effectiveMax - Math.min(value, effectiveMax)) / (effectiveMax - effectiveMin);
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
        plotValue: Math.min(glucoseLinePoints[0].value, effectiveMax),
        time,
        sourceTime: glucoseLinePoints[0].time
      };
    }

    const lastReading = glucoseLinePoints[glucoseLinePoints.length - 1];
    if (time >= lastReading.time) {
      return {
        value: lastReading.value,
        plotValue: Math.min(lastReading.value, effectiveMax),
        time,
        sourceTime: lastReading.time
      };
    }

    for (let i = 1; i < glucoseLinePoints.length; i++) {
      const previous = glucoseLinePoints[i - 1];
      const next = glucoseLinePoints[i];
      if (time > next.time) continue;

      const segmentIndex = i - 1;
      const value = interpolateMonotoneSegment(glucoseCurveSegments.value[segmentIndex], time) ?? previous.value;
      const plotValue = interpolateMonotoneSegment(glucoseCurveSegments.plotValue[segmentIndex], time) ?? Math.min(previous.value, effectiveMax);
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

  const drawCenterGlucose = (scrollLeft, animate = false) => {
    const marker = centerMarkerRef.current;
    const timeEl = tooltipTimeRef.current;
    const dateEl = tooltipDateRef.current;

    if (!filters.glucose || !glucoseLinePoints.length) {
      if (marker) marker.style.opacity = "0";
      return;
    }

    const centerTime = getCenterTimeForScroll(scrollLeft);
    const glucose = getGlucoseAt(centerTime);
    if (!glucose || !Number.isFinite(glucose.time)) {
      if (marker) marker.style.opacity = "0";
      return;
    }

    // Stale-reading contingency: when the CGM stream has gone quiet and the
    // viewport is centered in the gap past the last real reading, hide the
    // marker, show "--" in the ticker, and surface the last reading's age.
    const lastReadingTime = glucoseLinePoints.length ? glucoseLinePoints[glucoseLinePoints.length - 1].time : null;
    if (isGlucoseStale && lastReadingTime != null && centerTime >= lastReadingTime) {
      if (marker) marker.style.opacity = "0";
      if (tickerRef.current) tickerRef.current.setValue("--", false);
      if (timeEl) timeEl.textContent = formatReadingAge(latestDexcomReading?.recorded_at) || "";
      if (dateEl) dateEl.textContent = "";
      return;
    }

    // Compute the marker Y directly from the glucose value using the same
    // coordinate mapping as the chart's YAxis. This is more reliable than
    // sampling the SVG path, which can drift due to recharts' internal
    // transforms and margin offsets.
    const markerY = getGlucoseY(glucose.plotValue);

    if (marker) {
      if (Number.isFinite(markerY)) {
        marker.style.transform = `translate3d(-50%, ${markerY}px, 0) translateY(-50%)`;
        marker.style.opacity = String(getHighRangeOpacity(glucose.plotValue));
      } else {
        marker.style.opacity = "0";
      }
    }

    // Notify the card glow of the center marker's glucose status. Only
    // dispatches when the status (high / low / in-range) changes, so this
    // does NOT fire on every scroll frame — just on transitions.
    const glowStatus =
      glucose.value > targetHigh ? "high"
      : glucose.value < targetLow ? "low"
      : "in_range";
    const overReference = glucose.value > highReference || glucose.value < FIXED_LOW_REFERENCE;
    if (glowStatus !== prevGlowStatusRef.current || overReference !== prevOverReferenceRef.current) {
      prevGlowStatusRef.current = glowStatus;
      prevOverReferenceRef.current = overReference;
      window.dispatchEvent(new CustomEvent("stackd-center-glucose-status", { detail: { status: glowStatus, overReference } }));
    }

    if (tickerRef.current) tickerRef.current.setValue(formatGlucoseDisplay(glucose.value), animate);
    if (timeEl) timeEl.textContent = formatReadingTime(glucose.time);
    if (dateEl) dateEl.textContent = Number.isFinite(glucose.time) ? format(new Date(glucose.time), "EEEE, MMM d") : "";
  };

  const updateMonitoringOverlay = (scrollLeft) => {
    const centerTime = getCenterTimeForScroll(scrollLeft);
    const viewportCenterX = scrollLeft + containerWidth / 2;
    const viewportLeft = scrollLeft;
    const viewportRight = scrollLeft + containerWidth;
    const anyActive = mergedMonitoringIntervals.some((i) => centerTime >= i.start && centerTime < i.end);

    monitoringBandRefs.current.forEach((el, idx) => {
      if (!el) return;
      const iv = positionedMonitoringIntervals[idx];
      if (!iv) {el.style.opacity = "0";return;}
      const bandCenterX = iv.x + iv.width / 2;
      const inView = iv.x + iv.width > viewportLeft && iv.x < viewportRight;
      if (!inView) {el.style.opacity = "0";return;}
      const distance = Math.abs(bandCenterX - viewportCenterX);
      const halfSpan = containerWidth / 2 + iv.width / 2;
      const proximity = Math.max(0, 1 - distance / halfSpan);
      const isActive = centerTime >= iv.start && centerTime < iv.end;

      // Interpolate from soft dormant purple to vibrant organic purple
      const t = isActive ? 1 : proximity * 0.7;
      const r = Math.round(148 + (178 - 148) * t);
      const g = Math.round(130 + (108 - 130) * t);
      const b = Math.round(196 + (230 - 196) * t);
      const alpha = (0.10 + t * 0.18).toFixed(3);
      const glowAlpha = (0.05 + t * 0.22).toFixed(3);
      const glowSize = Math.round(10 + t * 26);
      const intensity = isActive ? 1 : 0.4 + proximity * 0.5;

      el.style.opacity = String(intensity);
      el.style.background = `rgba(${r},${g},${b},${alpha})`;
      el.style.boxShadow = `inset 0 0 ${glowSize}px rgba(${r},${g},${b},${glowAlpha})`;
      // Fade the top and both side edges to 0% so the band has no hard edges
      const topFade = "linear-gradient(to top, black 0%, black 15%, transparent 100%)";
      const sideFade = "linear-gradient(to right, transparent 0%, black 6%, black 94%, transparent 100%)";
      el.style.maskImage = `${topFade}, ${sideFade}`;
      el.style.WebkitMaskImage = `${topFade}, ${sideFade}`;
      el.style.maskComposite = "intersect";
      el.style.WebkitMaskComposite = "source-in";
    });

    const lEl = monitoringLabelRef.current;
    if (lEl) {
      lEl.style.opacity = anyActive ? "1" : "0";
      lEl.style.transform = anyActive ? "translateY(0)" : "translateY(4px)";
    }
    if (anyActive !== prevMonitoringActiveRef.current) {
      prevMonitoringActiveRef.current = anyActive;
      const a = monitoringA11yRef.current;
      if (a) a.textContent = anyActive ? "Extended meal response window active." : "Extended meal response window ended for the selected graph time.";
    }
  };

  const scheduleCenterGlucoseUpdate = (scrollLeft) => {
    pendingScrollLeftRef.current = scrollLeft;
    if (scrollFrameRef.current) return;

    scrollFrameRef.current = requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      drawCenterGlucose(pendingScrollLeftRef.current);
      updateMonitoringOverlay(pendingScrollLeftRef.current);
    });
  };

  // Reset the card glow when the graph unmounts so it falls back to the
  // latest reading instead of staying stuck on a stale scroll position.
  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent("stackd-center-glucose-status", { detail: { status: null, overReference: false } }));
    };
  }, []);

  // Refresh relative time labels ("just now", "Xm ago") every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const scrollLeft = scrollRef.current?.scrollLeft ?? maxScrollLeft;
      const centerTime = getCenterTimeForScroll(scrollLeft);
      const lastReadingTime = glucoseLinePoints.length ? glucoseLinePoints[glucoseLinePoints.length - 1].time : null;
      if (isGlucoseStale && lastReadingTime != null && centerTime >= lastReadingTime) {
        if (tooltipTimeRef.current) tooltipTimeRef.current.textContent = formatReadingAge(latestDexcomReading?.recorded_at) || "";
        return;
      }
      const glucose = getGlucoseAt(centerTime);
      if (glucose && tooltipTimeRef.current) {
        tooltipTimeRef.current.textContent = formatReadingTime(glucose.time);
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [maxScrollLeft, glucoseLinePoints, isGlucoseStale, latestDexcomReading]);

  const scrollToLatestGlucose = () => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollTo({ left: maxScrollLeft, behavior: "smooth" });
    scheduleCenterGlucoseUpdate(maxScrollLeft);
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollLeft = maxScrollLeft;
    const latestValue = glucoseLinePoints.length > 0 ? glucoseLinePoints[glucoseLinePoints.length - 1].value : null;
    const shouldAnimate = prevLatestValueRef.current !== null && latestValue !== null && latestValue !== prevLatestValueRef.current;
    prevLatestValueRef.current = latestValue;
    drawCenterGlucose(maxScrollLeft, shouldAnimate);
    updateMonitoringOverlay(maxScrollLeft);

    return () => {
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, [maxScrollLeft, latestGlucoseBucket, filters.glucose, glucoseLinePoints.length, positionedMonitoringIntervals, isGlucoseStale]);

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
      <div ref={monitoringA11yRef} className="sr-only" aria-live="polite" role="status" />
      {/* Controls row */}
      <div className="flex py-2 items-center mb-2 justify-between px-3 gap-2">

        {/* Left: YOUR FLOW label + filter button */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">Your Flow</span>
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
        </div>

        {/* Right: Time view toggle */}
        <TimeViewToggle value={viewWindow} onChange={setViewWindow} />

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
          className="absolute right-2 top-0 z-30 flex backdrop-blur-sm h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/55 shadow-lg transition-colors hover:bg-white/[0.1] hover:text-white/85"
          aria-label="Scroll to latest glucose">
          <CornerUpRight className="h-4 w-4" />
        </button>
      <div
          ref={graphViewportRef}
          className="relative overflow-hidden"
          style={{ width: "100%" }}>
      {!isCandlestick && filters.glucose && glucoseLinePoints.length > 0 &&
          <div
            onClick={onSelectLog || onDeleteLog ? handleIndicatorClick : undefined}
            className={`absolute left-1/2 top-0 z-20 -translate-x-1/2 px-3 py-1 text-center ${onSelectLog || onDeleteLog ? "cursor-pointer" : "pointer-events-none"}`}>
            
          <div className="flex items-center justify-center gap-1.5 text-2xl font-black leading-none text-white">
            {(onSelectLog || onDeleteLog) && !dexcomConnected &&
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.08] text-white/45">
                <Info className="h-2.5 w-2.5" />
              </span>
              }
            <GlucoseTicker ref={tickerRef} initialValue={formatGlucoseDisplay(glucoseLinePoints[glucoseLinePoints.length - 1].value)} /> <span className="text-xs font-medium text-white/35">mg/dL</span>
          </div>
          <div ref={tooltipTimeRef} className="mt-1 text-xs font-medium text-white/35">{format(new Date(glucoseLinePoints[glucoseLinePoints.length - 1].time), "h:mm a")}</div>
          <div ref={tooltipDateRef} className="mt-0.5 text-[10px] font-medium text-white/30">{format(new Date(glucoseLinePoints[glucoseLinePoints.length - 1].time), "EEEE, MMM d")}</div>
        </div>
          }
      {!isCandlestick && filters.glucose && glucoseLinePoints.length > 0 &&
          <div
            ref={centerMarkerRef}
            className="pointer-events-none absolute left-1/2 top-0 z-10 opacity-0"
            style={{
              width: "9px",
              height: "9px",
              willChange: "transform, opacity"
            }}>
        <div className="absolute inset-0 rounded-full bg-white" style={{ boxShadow: "0 0 6px rgba(255,255,255,0.4), 0 0 14px rgba(255,255,255,0.15)" }} />
        <div className="absolute -inset-[3px] rounded-full border border-white/20" />
      </div>
          }
      {filters.glucose && filteredGlucoseReadings.length > 0 &&
          (() => {
            const candlePlotH = CHART_HEIGHT - CHART_MARGIN_TOP - X_AXIS_HEIGHT;
            const refToY = isCandlestick
              ? (v) => {
                  const c = Math.min(Math.max(v, effectiveMin), effectiveMax);
                  return CHART_MARGIN_TOP + (effectiveMax - c) / (effectiveMax - effectiveMin) * candlePlotH;
                }
              : getGlucoseY;
            const refLabels = [
              { id: "highRef", value: highReference, side: "right", color: GLUCOSE_STATUS_COLORS.high, anchor: "above", secondary: true, text: `High ${highReference}` },
              { id: "lowRef", value: FIXED_LOW_REFERENCE, side: "right", color: GLUCOSE_STATUS_COLORS.low, anchor: "below", secondary: true, text: `${FIXED_LOW_REFERENCE}` },
              { id: "tgtHigh", value: targetHigh, side: "right", color: "#ffffff", anchor: "above", secondary: false, text: `${Math.round(targetHigh)}` },
              { id: "tgtLow", value: targetLow, side: "right", color: "#ffffff", anchor: "below", secondary: false, text: `${Math.round(targetLow)}` },
            ];
            return (
              <ReferenceLabels
                labels={refLabels}
                toY={refToY}
                chartHeight={isCandlestick ? CHART_HEIGHT : GLUCOSE_CHART_HEIGHT}
              />
            );
          })()}
      {/* monitoring gradient bands live inside the scrollable chart below */}
      <div
            ref={scrollRef}
            className="overflow-x-auto"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none", overflowY: "hidden" }}
            onScroll={(event) => {
              const el = event.currentTarget;
              if (el.scrollLeft > maxScrollLeft) {
                el.scrollLeft = maxScrollLeft;
                scheduleCenterGlucoseUpdate(maxScrollLeft);
                return;
              }
              scheduleCenterGlucoseUpdate(el.scrollLeft);
            }}>
        <div className="relative" style={{ width: chartWidth, height: isCandlestick ? CANDLESTICK_TOTAL_HEIGHT : TWO_PLANE_HEIGHT }}>
          {isCandlestick ?
              <CandlestickView
                glucoseReadings={filteredGlucoseReadings}
                doses={filteredDoses}
                carbEntries={filteredCarbEntries}
                targetRange={targetRange}
                chartWidth={chartWidth}
                chartHeight={CHART_HEIGHT}
                marginTop={CHART_MARGIN_TOP}
                xAxisHeight={X_AXIS_HEIGHT}
                domainStart={domainStart}
                domainEnd={domainEnd}
                glucoseMin={effectiveMin}
                glucoseMax={effectiveMax}
                highReference={highReference} /> :


              <>
          {positionedMonitoringIntervals.map((iv, idx) =>
                <div
                  key={`monitoring_band_${idx}`}
                  ref={(el) => monitoringBandRefs.current[idx] = el}
                  className="pointer-events-none absolute z-[2]"
                  style={{
                    left: iv.x,
                    top: monitoringBandTop,
                    width: iv.width,
                    height: monitoringBandHeight,
                    opacity: 0,
                    transition: "opacity 1000ms ease-in-out",
                    borderRadius: 4,
                    willChange: "opacity"
                  }}
                  aria-hidden="true" />

                )}
          <div style={{ position: "absolute", top: 0, left: 0 }}>
            <ComposedChart
                    width={chartWidth}
                    height={GLUCOSE_CHART_HEIGHT}
                    data={chartData}
                    margin={{ top: GLUCOSE_MARGIN_TOP, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="glucose_range_grad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#5ba88a" stopOpacity={0} />
                  <stop offset={`${highPct}%`} stopColor="#5ba88a" stopOpacity={0} />
                  <stop offset={`${highPct}%`} stopColor="#5ba88a" stopOpacity={0.07} />
                  <stop offset={`${lowPct}%`} stopColor="#5ba88a" stopOpacity={0.07} />
                  <stop offset={`${lowPct}%`} stopColor="#5ba88a" stopOpacity={0} />
                  <stop offset="100%" stopColor="#5ba88a" stopOpacity={0} />
                </linearGradient>
                <linearGradient
                        id="glucose_line_grad"
                        gradientUnits="userSpaceOnUse"
                        x1="0"
                        y1={GLUCOSE_MARGIN_TOP}
                        x2="0"
                        y2={GLUCOSE_CHART_HEIGHT}>
                  {lineGradStops.map((stop, index) =>
                        <stop
                          key={`glucose_line_stop_${index}`}
                          offset={`${stop.offset}%`}
                          stopColor={stop.color}
                          stopOpacity={stop.opacity} />
                    )}
                </linearGradient>
              </defs>

              <XAxis
                      dataKey="time"
                      type="number"
                      domain={[domainStart, domainEnd]}
                      ticks={timeTicks}
                      tick={false}
                      axisLine={false}
                      tickLine={false}
                      height={0}
                      interval={0} />

              <YAxis yAxisId="glucose" domain={[effectiveMin, effectiveMax]} allowDataOverflow hide />

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

              {filters.glucose && filteredGlucoseReadings.length > 0 &&
                    <>
                  <ReferenceLine yAxisId="glucose" y={targetHigh} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 4" />
                  <ReferenceLine yAxisId="glucose" y={targetLow} stroke="rgba(255,255,255,0.18)" strokeWidth={1} strokeDasharray="3 4" />
                  <ReferenceLine
                    yAxisId="glucose"
                    y={highReference}
                    stroke={GLUCOSE_STATUS_COLORS.high}
                    strokeOpacity={0.45}
                    strokeWidth={1}
                    strokeDasharray="6 5"
                  />
                  <ReferenceLine
                    yAxisId="glucose"
                    y={FIXED_LOW_REFERENCE}
                    stroke={GLUCOSE_STATUS_COLORS.low}
                    strokeOpacity={0.4}
                    strokeWidth={1}
                    strokeDasharray="6 5"
                  />
                </>
                    }

              {filters.glucose && filteredGlucoseReadings.length > 0 &&
                    <Line
                      yAxisId="glucose"
                      type="monotoneX"
                      dataKey="glucose"
                      name="Glucose"
                      className="stackd-glucose-trend"
                      stroke="url(#glucose_line_grad)"
                      strokeWidth={2.3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={false}
                      connectNulls={true}
                      isAnimationActive={false} />
                }
            </ComposedChart>
          </div>

          <GraphLowerSection
            chartData={chartData}
            doseKeys={doseKeys}
            positionedCarbMarkers={positionedCarbMarkers}
            positionedDoseMarkers={positionedDoseMarkers}
            domainStart={domainStart}
            domainEnd={domainEnd}
            chartWidth={chartWidth}
            timeTicks={timeTicks}
            glucoseChartHeight={GLUCOSE_CHART_HEIGHT}
            carbLaneHeight={CARB_LANE_HEIGHT}
            insulinChartHeight={INSULIN_CHART_HEIGHT}
            insulinMarginTop={INSULIN_MARGIN_TOP}
            xAxisHeight={X_AXIS_HEIGHT}
            selectedDoseKey={selectedDoseKey}
            onDoseTap={handleDoseTap}
            onCarbTap={(entry, rect) => openMarker("carbs", entry, rect)}
            showInsulin={filters.insulin}
            showCarbs={filters.carbs}
          />
          </>
              }
        </div>
      </div>
      </div>
      {filters.insulin && activeDoseKeys.length > 0 && (
        <div className="flex items-center gap-3 px-3 mt-1.5 overflow-x-auto no-scrollbar">
          {activeDoseKeys.map((k) => (
            <div key={k.label} className="flex items-center gap-1 shrink-0">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: k.color }} />
              <span className="text-[9px] text-white/35">{k.label}</span>
            </div>
          ))}
        </div>
      )}
      <div
          ref={monitoringLabelRef}
          className="pointer-events-none mt-1 flex items-center justify-center gap-1.5"
          style={{ opacity: 0, transform: "translateY(4px)", transition: "opacity 350ms ease-in-out, transform 350ms ease-in-out", minHeight: 16, display: isCandlestick ? "none" : undefined }}
          aria-hidden="true">
          
        <AlertTriangle className="h-3 w-3" style={{ color: "rgba(217,169,56,0.7)" }} />
        <span className="text-[9px] font-medium" style={{ color: "rgba(217,169,56,0.8)" }}>Delayed glucose response possible. Monitor for extended high's and low's.</span>
      </div>
      </div>

      {activeMarker &&
      <InfoPopover anchorRect={activeMarker.rect} onClose={closeMarker}>
          {activeMarker.type === "carbs" &&
        <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Nourishment</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white">{Math.round(activeMarker.item.carbs)}</span>
                <span className="text-xs text-white/40">g carbs</span>
              </div>
              <p className="text-xs text-white/70">{activeMarker.item.food_name || activeMarker.item.name || "Food"}</p>
              <p className="text-[11px] text-white/40">{format(new Date(activeMarker.item.consumed_at), "h:mm a · MMM d")}</p>

            </div>
        }
          {activeMarker.type === "insulin" &&
        <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Insulin</span>
              <p className="text-sm font-bold text-white">{activeMarker.item.insulin_type}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white">{activeMarker.item.units % 1 === 0 ? activeMarker.item.units : activeMarker.item.units.toFixed(1)}</span>
                <span className="text-xs text-white/40">units</span>
              </div>
              {(() => {
            const iob = getDoseIOB(activeMarker.item, Date.now());
            return iob > 0.01 ?
            <p className="text-[11px] text-teal-300/80">{Math.round(iob)}u estimated active</p> :
            <p className="text-[11px] text-white/40">Support complete</p>;
          })()}
              <p className="text-[11px] text-white/40">{format(new Date(activeMarker.item.administered_at), "h:mm a · MMM d")}</p>

            </div>
        }
          {activeMarker.type === "glucose" &&
        <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Glucose</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white">{activeMarker.item.value}</span>
                <span className="text-xs text-white/40">mg/dL</span>
              </div>
              <p className="text-[11px] text-white/40">{activeMarker.item.source === "dexcom" ? "CGM" : activeMarker.item.source === "system" ? "System" : "Manual"} · {format(new Date(activeMarker.item.recorded_at), "h:mm a · MMM d")}</p>

            </div>
        }

          {(onSelectLog || onDeleteLog) && !(activeMarker.type === "glucose" && (activeMarker.item.source === "dexcom" || glucoseReadOnly)) &&
        <div className="mt-2 flex gap-2">
              {onSelectLog && !confirmDelete &&
          <button type="button" onClick={handleEdit} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/12 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/5" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <Pencil className="h-3 w-3" /> Edit
                </button>
          }
              {onDeleteLog && !confirmDelete &&
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-400/20 py-2 text-xs font-semibold text-rose-300/80 transition hover:bg-rose-500/10" style={{ background: "rgba(244,63,94,0.04)" }}>
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
          }
              {confirmDelete &&
          <>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl border border-white/12 py-2 text-xs font-semibold text-white/70 transition hover:bg-white/5" style={{ background: "rgba(255,255,255,0.04)" }}>Keep it</button>
                  <button type="button" onClick={handleDelete} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-rose-400/30 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20" style={{ background: "rgba(244,63,94,0.12)" }}>
                    <Trash2 className="h-3 w-3" /> Confirm remove
                  </button>
                </>
          }
            </div>
        }
        </InfoPopover>
      }

    </div>);

}