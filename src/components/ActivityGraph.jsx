import { useMemo, useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Area, XAxis, YAxis, Line, ComposedChart, ReferenceLine, ReferenceArea } from "recharts";
import { generateActivityCurve, getDoseIOB, getDoseRelativeActivity, getInsulinProfile, isBasalInsulinType } from "@/lib/insulinPharmacology";
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
import { useIsLightTheme } from "@/lib/theme";
import { getGraphTheme } from "@/lib/graphTheme";
import { useGlucoseStaleness } from "@/hooks/useGlucoseStaleness";
import { getLatestDexcomReading, formatReadingAge } from "@/lib/glucoseStaleness";
import GlucoseTicker from "@/components/graph/GlucoseTicker";
import TimeViewToggle from "@/components/graph/TimeViewToggle";
import CandlestickView from "@/components/graph/CandlestickView";
import ReferenceLabels from "@/components/graph/ReferenceLabels";
import MealEditOverlay from "@/components/insulin/MealEditOverlay";

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
const GLUCOSE_CHART_HEIGHT = 234;
const GLUCOSE_MARGIN_TOP = 72;
const GLUCOSE_PLOT_HEIGHT = GLUCOSE_CHART_HEIGHT - GLUCOSE_MARGIN_TOP;
const CARB_LANE_HEIGHT = 34;
const INSULIN_PLOT_HEIGHT = 46;
const INSULIN_YMAX = 1 / 0.35; // peak-normalized activity (0–1) → peak fills 35% of the insulin row
const MAIN_CHART_HEIGHT = GLUCOSE_CHART_HEIGHT + X_AXIS_HEIGHT;
const ROW_GAP = 4;
const INSULIN_ROW_TOP = GLUCOSE_CHART_HEIGHT + ROW_GAP;
const GRAPH_BOTTOM_INSET = 14;
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

// Walk the actual rendered glucose <path> and return the point whose SVG x
// matches targetX. The glucose line is monotone in x (time only moves
// forward), so a binary search over path length converges reliably. Falls
// back to the path endpoints when targetX lies outside the drawn range.
function sampleGlucosePathAtX(pathEl, targetX) {
  const totalLength = pathEl.getTotalLength();
  if (!totalLength || !Number.isFinite(totalLength)) return null;

  const first = pathEl.getPointAtLength(0);
  const last = pathEl.getPointAtLength(totalLength);

  if (targetX <= first.x) return { x: first.x, y: first.y };
  if (targetX >= last.x) return { x: last.x, y: last.y };

  let lo = 0;
  let hi = totalLength;
  for (let i = 0; i < 26; i += 1) {
    const mid = (lo + hi) / 2;
    const point = pathEl.getPointAtLength(mid);
    if (point.x < targetX) lo = mid;else
    hi = mid;
  }
  const point = pathEl.getPointAtLength((lo + hi) / 2);
  return { x: point.x, y: point.y };
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
    return <circle cx={x} cy={y + 6} r={1} fill="rgba(168,158,141,0.25)" />;
  }

  if (minute === 0) {
    return (
      <text
        x={x}
        y={y + 11}
        textAnchor="middle"
        fill="#746959"
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
  { key: "glucose", label: "Glucose", color: "#3f3830" },
  { key: "insulin", label: "Insulin", color: "#5b6550" },
  { key: "carbs", label: "Carbs", color: "#8a5a12" }];


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
      className="stackd-filter-dropdown fixed z-[200] rounded-2xl border shadow-2xl py-1.5"
      style={{ background: "#fdf9f2", borderColor: "#eadccf", width: DROPDOWN_W, left, top }}>
      
      {items.map((item) =>
      <button
        key={item.key}
        onClick={() => onChange(item.key)}
        className="w-full flex items-center gap-2.5 px-3.5 py-2 transition hover:opacity-70 text-left">
        
          <div className="w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all"
        style={{
          borderColor: filters[item.key] ? item.color : "#eadccf",
          backgroundColor: filters[item.key] ? item.color + "22" : "transparent"
        }}>
            {filters[item.key] && <Check className="w-2.5 h-2.5" style={{ color: item.color }} />}
          </div>
          <span className="text-sm font-medium" style={{ color: filters[item.key] ? "#3f3830" : "#a89e8d" }}>
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
  const [controlsPortalEl, setControlsPortalEl] = useState(null);

  useEffect(() => {
    const el = document.getElementById("daily-flow-controls");
    if (el) setControlsPortalEl(el);
  }, []);
  const isCandlestick = viewWindow === 24;
  const [activeMarker, setActiveMarker] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [selectedDoseKey, setSelectedDoseKey] = useState(null);
  const [editingMeal, setEditingMeal] = useState(null);
  const [highlightedDoseKey, setHighlightedDoseKey] = useState(null);
  const { connected: dexcomConnected } = useDexcomConnection();
  const gTheme = getGraphTheme(useIsLightTheme());

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
  const lastSelectedKeyRef = useRef(null);
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
      const w = entry.contentRect.width;
      // Ignore zero-width readings (the dashboard is hidden via `hidden` while
      // the user is on another tab). Collapsing to 0 would blank the chart and
      // force a full recompute when they return — keep the last valid width so
      // the graph stays warm and reappears instantly.
      if (w > 0) setContainerWidth(w);
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
    for (const r of glucoseReadings || []) {
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
  map((entry) => {
    const isRescue = entry.is_rescue_carb === true || entry.classification === "rescue_carbs";
    return {
      time: new Date(entry.consumed_at).getTime(),
      entry,
      color: isRescue ? "#a78bfa" : CARB_PROFILE_COLORS[entry.absorption_profile] || PROFILE_COLORS[entry.absorption_profile] || "#f59e0b"
    };
  }).
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

  const maxBolusUnits = useMemo(
    () => Math.max(...filteredDoses.filter((d) => !isBasalInsulinType(d.insulin_type)).map(getDoseUnits), 1),
    [filteredDoses]
  );
  const maxBasalUnits = useMemo(
    () => Math.max(...filteredDoses.filter((d) => isBasalInsulinType(d.insulin_type)).map(getDoseUnits), 1),
    [filteredDoses]
  );

  // Insulin row uses peak-normalized activity (0–1) per curve so every dose
  // renders the published gentle rise → peak → long-tail shape at the same
  // display amplitude, regardless of dose size. Each curve is still computed
  // independently from the dose's own units/timestamp via the exponential
  // (oref1) model; the total IOB line (IOB screen) is the point-wise sum of
  // the real per-dose curves.

  // Dynamic gap between glucose and insulin rows, based on the tallest
  // visible insulin curve. Shrinks when curves are short or absent, grows
  // when bolus peaks need room for their unit labels and leaders.
  const dynamicInsulinMarginTop = useMemo(() => {
    const minGap = 8;
    const clearance = 8;
    const curveHeight = 0.35 * INSULIN_PLOT_HEIGHT;
    const pillHeight = 16;
    const pillGap = 3;

    let minOffset = Infinity;
    allCurvesMeta.forEach(({ dose, key, curve }) => {
      if (!curve.length) return;
      const isBasal = isBasalInsulinType(dose.insulin_type);
      let peakTime;
      let offset;
      if (isBasal) {
        const doseStart = new Date(dose.administered_at || dose.created_at || dose.created_date).getTime();
        const targetTime = doseStart + 60 * 60 * 1000;
        let closest = curve[0];
        for (const p of curve) {
          if (Math.abs(p.time - targetTime) < Math.abs(closest.time - targetTime)) closest = p;
        }
        // Basal coverage band: pill sits at the top of the plateau (relative
        // activity at 1h × 35% display amplitude).
        const na = closest.activity || 0;
        offset = (1 - na * 0.35) * INSULIN_PLOT_HEIGHT - pillHeight - pillGap;
        peakTime = closest.time;
      } else {
        let peak = curve[0];
        for (const p of curve) {
          if (p.activity > peak.activity) peak = p;
        }
        // Peak-normalized: every bolus curve peaks at 35% of the row, so the
        // pill clears the same fixed offset regardless of dose size.
        offset = 0.65 * INSULIN_PLOT_HEIGHT - pillHeight - pillGap;
        peakTime = peak.time;
      }
      if (peakTime < domainStart || peakTime > domainEnd) return;
      minOffset = Math.min(minOffset, offset);
    });

    if (!Number.isFinite(minOffset)) {
      return Math.max(minGap - ROW_GAP, 2);
    }
    const targetGap = Math.max(curveHeight + clearance - minOffset, minGap);
    return Math.max(targetGap - ROW_GAP, 2);
  }, [allCurvesMeta, domainStart, domainEnd]);

  const insulinChartHeight = INSULIN_PLOT_HEIGHT + dynamicInsulinMarginTop + X_AXIS_HEIGHT;
  const twoRowHeight = INSULIN_ROW_TOP + insulinChartHeight + X_AXIS_HEIGHT + GRAPH_BOTTOM_INSET;

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
          const aupm = curve[lo].activityUnitsPerMinute + ratio * (curve[hi].activityUnitsPerMinute - curve[lo].activityUnitsPerMinute);
          // Peak-normalized activity (0–1) drives the row display so every
          // dose renders the gentle rise → peak → long-tail shape at the same
          // amplitude (matching the published Daily Flow insulin row). Each
          // curve's SHAPE is still computed from the dose's own units/time via
          // the exponential model; real units remain on _actual/_aupm for IOB
          // sums and tooltips.
          point[key] = activity;
          point[`${key}_actual`] = activeUnits;
          point[`${key}_activity`] = activity;
          point[`${key}_aupm`] = aupm;
          point[`${key}_total`] = doseUnits;
        }
      });
      if (glucoseMap[t] !== undefined) {
        point.glucose = Math.min(glucoseMap[t], effectiveMax);
      }
      result.push(point);
    }
    return result;
  }, [doses, glucoseReadings, carbEntries, filters, domainStart, domainEnd, allCurvesMeta, glucoseMap, maxBolusUnits, maxBasalUnits, effectiveMax, effectiveMin]);

  const doseKeys = useMemo(() => {
    const typeCount = new Map();
    return filteredDoses.map((dose, index) => {
      const typeKey = dose.insulin_type || "Insulin";
      const sameTypeIdx = typeCount.get(typeKey) || 0;
      typeCount.set(typeKey, sameTypeIdx + 1);
      // Step opacity down for overlapping doses of the same insulin type so
      // each curve stays individually distinguishable. Clinical color-coding
      // is preserved — same type shares its pharmaceutical color; opacity
      // separates stacked curves.
      const opacity = Math.max(0.32, 0.92 - sameTypeIdx * 0.22);
      return {
        key: getDoseKey(dose, index),
        label: String(typeKey).split(" ")[0],
        units: getDoseUnits(dose),
        color: getInsulinProfile(dose.insulin_type)?.color || "#888",
        isBasal: isBasalInsulinType(dose.insulin_type),
        isActive: getDoseIOB(dose, Date.now()) >= 0.5,
        isSpent: getDoseIOB(dose, Date.now()) <= 0.01,
        opacity
      };
    });
  }, [filteredDoses]);

  // Only insulin types whose curves have activity overlapping the visible
  // graph window — drives the legend so it reflects what's actually shown.
  // Per-insulin-type totals, counting only doses that are still active (IOB
  // >= 0.5u) — the same threshold the IOB card uses — so the legend stays
  // accurate to what's genuinely on board, including lingering long-lasting
  // insulins. Displayed as "Xu Type" next to each color dot.
  const activeDoseKeys = useMemo(() => {
    const now = Date.now();
    const byType = new Map();
    allCurvesMeta.forEach(({ dose, curve }) => {
      if (!curve.length) return;
      const iob = getDoseIOB(dose, now);
      if (iob < 0.5) return;
      const label = String(dose.insulin_type || "Insulin").split(" ")[0];
      const color = getInsulinProfile(dose.insulin_type)?.color || "#888";
      const units = getDoseUnits(dose);
      const existing = byType.get(label);
      if (existing) {
        existing.activeUnits += iob;
        existing.totalUnits += units;
      } else {
        byType.set(label, { label, color, activeUnits: iob, totalUnits: units });
      }
    });
    return Array.from(byType.values());
  }, [allCurvesMeta]);

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
    const placed = [];
    const minGap = 36;

    return carbEventMarkers.
    slice().
    sort((a, b) => a.time - b.time).
    map((marker) => {
      const trueX = (marker.time - domainStart) / totalMs * chartWidth;
      let displayX = trueX;

      for (const p of placed) {
        if (Math.abs(displayX - p.displayX) < minGap) {
          displayX = p.displayX + minGap;
        }
      }

      placed.push({ displayX, trueX });
      return { ...marker, x: displayX, trueX, displaced: Math.abs(displayX - trueX) > 2 };
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
      const isBasal = isBasalInsulinType(dose.insulin_type);
      const doseStart = new Date(dose.administered_at || dose.created_at || dose.created_date).getTime();
      if (isBasal) {
        // Basal curves have no distinct peak — place the label within 1 hour
        // of the logging timestamp, with a leader to the curve at that point.
        const targetTime = doseStart + 60 * 60 * 1000;
        let closest = curve[0];
        for (const p of curve) {
          if (Math.abs(p.time - targetTime) < Math.abs(closest.time - targetTime)) closest = p;
        }
        const na = closest.activity || 0;
        peakInfoByKey[key] = {
          peakTime: closest.time,
          peakY: dynamicInsulinMarginTop + (1 - na * 0.35) * INSULIN_PLOT_HEIGHT
        };
      } else {
        peakInfoByKey[key] = { peakTime: peak.time, peakY: dynamicInsulinMarginTop + 0.65 * INSULIN_PLOT_HEIGHT };
      }
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
      const isActive = getDoseIOB(dose, Date.now()) >= 0.5;
      const isSpent = getDoseIOB(dose, Date.now()) <= 0.01;
      return { dose, x, units, key, color, pillTop, peakY, isActive, isSpent };
    }).
    filter(Boolean);
  }, [filteredDoses, allCurvesMeta, maxBolusUnits, maxBasalUnits, domainStart, domainEnd, totalMs, chartWidth, dynamicInsulinMarginTop]);

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

    const first = glucoseLinePoints[0];
    const last = glucoseLinePoints[glucoseLinePoints.length - 1];

    if (time <= first.time) {
      return {
        value: first.value,
        plotValue: Math.min(first.value, effectiveMax),
        time,
        sourceTime: first.time
      };
    }
    if (time >= last.time) {
      return {
        value: last.value,
        plotValue: Math.min(last.value, effectiveMax),
        time,
        sourceTime: last.time
      };
    }

    // Snap to the nearest rendered data bucket. The chart's glucose line
    // passes exactly through each populated bucket, so this keeps the marker
    // glued to the line regardless of how recharts' monotone curve bends
    // between points — which previously caused the marker to float off the
    // line, especially across longer histories.
    const bucket = Math.round(time / STEP_MS) * STEP_MS;
    const bucketValue = glucoseMap[bucket];
    if (bucketValue !== undefined && Number.isFinite(bucketValue)) {
      return { value: bucketValue, plotValue: Math.min(bucketValue, effectiveMax), time, sourceTime: bucket };
    }

    // Gap between readings: the chart bridges with a straight line
    // (connectNulls), so linearly interpolate between the two bracketing
    // readings — this matches the rendered line in gaps.
    for (let i = 1; i < glucoseLinePoints.length; i++) {
      const previous = glucoseLinePoints[i - 1];
      const next = glucoseLinePoints[i];
      if (time > next.time) continue;

      const span = next.time - previous.time || 1;
      const ratio = Math.max(0, Math.min(1, (time - previous.time) / span));
      const value = previous.value + (next.value - previous.value) * ratio;
      const sourceTime = ratio < 0.5 ? previous.time : next.time;
      return { value, plotValue: Math.min(value, effectiveMax), time, sourceTime };
    }

    return {
      value: last.value,
      plotValue: Math.min(last.value, effectiveMax),
      time,
      sourceTime: last.time
    };
  };

  // Returns the single REAL Dexcom data point nearest the given time. The
  // large glucose number is always this reading's exact value — never an
  // interpolated value computed between readings or from the marker's pixel
  // position on the line. Readings are sorted by time, so a binary search
  // finds the nearest point cheaply (runs inside the scroll rAF loop).
  const getSelectedReading = (time) => {
    if (!filteredGlucoseReadings.length) return null;
    const first = filteredGlucoseReadings[0];
    const last = filteredGlucoseReadings[filteredGlucoseReadings.length - 1];
    if (time <= first.time) return first;
    if (time >= last.time) return last;

    let lo = 0;
    let hi = filteredGlucoseReadings.length - 1;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (filteredGlucoseReadings[mid].time < time) lo = mid + 1;else
      hi = mid;
    }
    const a = filteredGlucoseReadings[lo - 1];
    const b = filteredGlucoseReadings[lo];
    return Math.abs(a.time - time) <= Math.abs(b.time - time) ? a : b;
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

    // The selected data point is always a REAL Dexcom reading — the one
    // nearest the viewport center. Its exact value drives the large number;
    // the marker can keep tracking the smooth line for visual continuity.
    const selected = getSelectedReading(centerTime);
    if (!selected || !Number.isFinite(selected.time)) {
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

    // The displayed value is the selected reading's REAL glucose value —
    // clamped only for display scale, never interpolated.
    const selectedValue = Math.min(Math.max(selected.value, effectiveMin), effectiveMax);

    // Animate ONLY when the selected data point changes from one real
    // reading to another — not on every scroll frame. This keeps the number
    // perfectly static between readings and fires the existing rolling
    // animation precisely when the active reading changes (scrub or live).
    const selectedKey = selected.id ?? selected.time;
    const shouldAnimate = lastSelectedKeyRef.current !== null && lastSelectedKeyRef.current !== selectedKey;
    lastSelectedKeyRef.current = selectedKey;

    // Marker Y still samples the ACTUAL rendered glucose <path> so the dot
    // stays glued to the smooth line (visual only). The NUMBER above is
    // always the real reading — it is never derived from this pixel Y.
    const targetSvgX = scrollLeft + containerWidth / 2;
    const pathEl = scrollRef.current?.querySelector("path.stackd-glucose-trend");
    let markerY = null;

    if (pathEl) {
      const sample = sampleGlucosePathAtX(pathEl, targetSvgX);
      if (sample) {
        markerY = sample.y;
      }
    }

    if (markerY == null || !Number.isFinite(markerY)) {
      markerY = getGlucoseY(selectedValue);
    }

    if (marker) {
      if (Number.isFinite(markerY)) {
        marker.style.transform = `translate3d(-50%, ${markerY}px, 0) translateY(-50%)`;
        marker.style.opacity = String(getHighRangeOpacity(selectedValue));
      } else {
        marker.style.opacity = "0";
      }
    }

    // Notify the card glow of the selected reading's glucose status. Only
    // dispatches when the status (high / low / in-range) changes, so this
    // does NOT fire on every scroll frame — just on transitions.
    const glowStatus =
    selectedValue > targetHigh ? "high" :
    selectedValue < targetLow ? "low" :
    "in_range";
    const overReference = selectedValue > highReference || selectedValue < FIXED_LOW_REFERENCE;
    if (glowStatus !== prevGlowStatusRef.current || overReference !== prevOverReferenceRef.current) {
      prevGlowStatusRef.current = glowStatus;
      prevOverReferenceRef.current = overReference;
      window.dispatchEvent(new CustomEvent("stackd-center-glucose-status", { detail: { status: glowStatus, overReference } }));
    }

    // The ticker rolls only when the selected reading changes; between
    // readings setValue receives the same string and no-ops, so the number
    // stays perfectly static until the next real Dexcom data point.
    if (tickerRef.current) tickerRef.current.setValue(formatGlucoseDisplay(selectedValue), shouldAnimate);
    if (timeEl) timeEl.textContent = formatReadingTime(selected.time);
    if (dateEl) dateEl.textContent = Number.isFinite(selected.time) ? format(new Date(selected.time), "EEEE, MMM d") : "";
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

      // Interpolate from soft dormant mauve to vibrant organic purple
      const t = isActive ? 1 : proximity * 0.7;
      const r = Math.round(138 + (168 - 138) * t);
      const g = Math.round(120 + (96 - 120) * t);
      const b = Math.round(168 + (205 - 168) * t);
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
      const selected = getSelectedReading(centerTime);
      if (selected && tooltipTimeRef.current) {
        tooltipTimeRef.current.textContent = formatReadingTime(selected.time);
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
      {/* Controls — portaled into the Daily Flow header slot */}
      {(() => {
        const controls =
        <div className="flex items-center gap-2">
            <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setFilterAnchorRect(rect);
              setShowFilter((v) => !v);
            }}
            className={`w-8 h-8 flex items-center rounded-xl border transition-all relative hidden justify-center ${
            showFilter ?
            "border-[#5b6550] bg-[rgba(91,101,80,0.10)] text-[#5b6550]" :
            "border-[#eadccf] bg-[#fdf9f2] text-[#a89e8d] hover:text-[#3f3830]"}`
            }>
              <SlidersHorizontal className="w-4 h-4" />
              {activeFilterCount < 3 &&
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full" style={{ background: "#5b6550" }} />
            }
            </button>
            <TimeViewToggle value={viewWindow} onChange={setViewWindow} />
            <AnimatePresence>
              {showFilter && filterAnchorRect &&
            <>
                  <div className="fixed inset-0 z-[199]" onClick={() => setShowFilter(false)} />
                  <FilterDropdown filters={filters} onChange={toggleFilter} anchorRect={filterAnchorRect} />
                </>
            }
            </AnimatePresence>
          </div>;

        return controlsPortalEl ? createPortal(controls, controlsPortalEl) : controls;
      })()}
      <div className="relative">
      <button
          type="button"
          onClick={scrollToLatestGlucose}
          className="absolute right-2 top-0 z-30 flex h-8 w-8 items-center justify-center rounded-full border shadow-lg transition hover:opacity-70"
          style={{ borderColor: "#eadccf", background: "#fdf9f2", color: "#6b6153" }}
          aria-label="Scroll to latest glucose">
          <CornerUpRight className="h-4 w-4" />
        </button>
      <div
          ref={graphViewportRef}
          className="relative overflow-hidden"
          style={{ width: "100%" }}>
      {!isCandlestick && filters.glucose && glucoseLinePoints.length > 0 &&
          <div
            className="absolute left-1/2 top-0 z-20 -translate-x-1/2 px-3 py-1 text-center pointer-events-none">
            
          <div className="flex items-center justify-center gap-1.5 text-2xl font-black leading-none" style={{ color: "#9f7d4eff" }}>
            {(onSelectLog || onDeleteLog) && !dexcomConnected &&
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: "#eadccf", background: "#fdf9f2", color: "#746959" }}>
                <Info className="h-2.5 w-2.5" />
              </span>
              }
            <GlucoseTicker ref={tickerRef} initialValue={formatGlucoseDisplay(glucoseLinePoints[glucoseLinePoints.length - 1].value)} /> <span className="text-xs font-medium" style={{ color: "#9f7d4eff" }}>mg/dL</span>
          </div>
          <div ref={tooltipTimeRef} className="mt-1 text-xs font-medium" style={{ color: "#9f7d4eff" }}>{format(new Date(glucoseLinePoints[glucoseLinePoints.length - 1].time), "h:mm a")}</div>
          <div ref={tooltipDateRef} className="mt-0.5 text-[10px] font-medium" style={{ color: "#9f7d4eff" }}>{format(new Date(glucoseLinePoints[glucoseLinePoints.length - 1].time), "EEEE, MMM d")}</div>
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
        <div className="absolute inset-0 rounded-full" style={{ background: "#9c5228", boxShadow: `0 0 6px #9c522866, 0 0 14px #9c522826` }} />
        <div className="absolute -inset-[3px] rounded-full border" style={{ borderColor: "#eadccf" }} />
      </div>
          }
      {filters.glucose && filteredGlucoseReadings.length > 0 &&
          (() => {
            const candlePlotH = CHART_HEIGHT - CHART_MARGIN_TOP - X_AXIS_HEIGHT;
            const refToY = isCandlestick ?
            (v) => {
              const c = Math.min(Math.max(v, effectiveMin), effectiveMax);
              return CHART_MARGIN_TOP + (effectiveMax - c) / (effectiveMax - effectiveMin) * candlePlotH;
            } :
            getGlucoseY;
            const refLabels = [
            { id: "highRef", value: highReference, side: "right", color: GLUCOSE_STATUS_COLORS.high, anchor: "above", secondary: true, text: `High ${highReference}` },
            { id: "lowRef", value: FIXED_LOW_REFERENCE, side: "right", color: GLUCOSE_STATUS_COLORS.low, anchor: "below", secondary: true, text: `${FIXED_LOW_REFERENCE}` },
            { id: "tgtHigh", value: targetHigh, side: "right", color: gTheme.inRangeColor, anchor: "above", secondary: false, text: `${Math.round(targetHigh)}` },
            { id: "tgtLow", value: targetLow, side: "right", color: gTheme.inRangeColor, anchor: "below", secondary: false, text: `${Math.round(targetLow)}` }];

            return (
              <ReferenceLabels
                labels={refLabels}
                toY={refToY}
                chartHeight={isCandlestick ? CHART_HEIGHT : GLUCOSE_CHART_HEIGHT} />);


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
        <div className="relative" style={{ width: chartWidth, height: isCandlestick ? CANDLESTICK_TOTAL_HEIGHT : twoRowHeight }}>
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
          {/* ── Glucose row (upper) ── */}
          <div style={{ position: "absolute", top: 0, left: 0 }}>
            <ComposedChart
                    width={chartWidth}
                    height={GLUCOSE_CHART_HEIGHT}
                    data={chartData}
                    margin={{ top: GLUCOSE_MARGIN_TOP, right: 0, left: -20, bottom: 0 }} className="opacity-100">
              {filters.glucose &&
                    <ReferenceArea
                      yAxisId="glucose"
                      x1={Date.now()}
                      x2={domainEnd}
                      fill="#af751b"
                      fillOpacity={0.06}
                      stroke="none" />

                    }

              <YAxis yAxisId="glucose" domain={[effectiveMin, effectiveMax]} allowDataOverflow hide />

              {filters.glucose && filteredGlucoseReadings.length > 0 &&
                    <>
                  <ReferenceLine yAxisId="glucose" y={targetHigh} stroke={gTheme.refLineStroke} strokeWidth={1} strokeDasharray="3 4" />
                  <ReferenceLine yAxisId="glucose" y={targetLow} stroke={gTheme.refLineStroke} strokeWidth={1} strokeDasharray="3 4" />
                  <ReferenceLine
                        yAxisId="glucose"
                        y={highReference}
                        stroke={GLUCOSE_STATUS_COLORS.high}
                        strokeOpacity={0.30}
                        strokeWidth={1}
                        strokeDasharray="6 5" />
                      
                  <ReferenceLine
                        yAxisId="glucose"
                        y={FIXED_LOW_REFERENCE}
                        stroke={GLUCOSE_STATUS_COLORS.low}
                        strokeOpacity={0.28}
                        strokeWidth={1}
                        strokeDasharray="6 5" />
                      
                  <ReferenceLine
                        x={Date.now()}
                        yAxisId="glucose"
                        stroke="#8a7b6bff"
                        strokeWidth={1}
                        strokeOpacity={0.3} />
                      
                </>
                    }

              {filters.glucose && filteredGlucoseReadings.length > 0 &&
                    <Line
                      yAxisId="glucose"
                      type="monotoneX"
                      dataKey="glucose"
                      name="Glucose"
                      className="stackd-glucose-trend"
                      stroke="#d6d0b5ff"
                      strokeWidth={2.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={false}
                      connectNulls={true}
                      isAnimationActive={false} />
                    }
            </ComposedChart>
          </div>

          {/* ── Insulin row (lower) — one shared timeline ── */}
          <div style={{ position: "absolute", top: INSULIN_ROW_TOP, left: 0 }}>
            <ComposedChart
                    width={chartWidth}
                    height={insulinChartHeight + X_AXIS_HEIGHT + GRAPH_BOTTOM_INSET}
                    data={chartData}
                    margin={{ top: dynamicInsulinMarginTop, right: 0, left: -20, bottom: GRAPH_BOTTOM_INSET }}>
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

              <YAxis yAxisId="insulin" domain={[0, INSULIN_YMAX]} allowDataOverflow hide />

              {filters.insulin && doseKeys.map((k) => {
                    const dimmed = highlightedDoseKey && highlightedDoseKey !== k.key;
                    const stroke = k.isSpent ? "#b8aea0" : k.color;
                    const fillOpacity = (k.isBasal ? 0.10 : 0.16) * (dimmed ? 0.25 : 1);
                    return (
                      <Area
                        key={`area_${k.key}`}
                        yAxisId="insulin"
                        type="monotone"
                        dataKey={k.key}
                        name={k.label}
                        stroke="none"
                        fill={stroke}
                        fillOpacity={fillOpacity}
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                        connectNulls={true} />
                    );
                    })}
              {filters.insulin && doseKeys.map((k) => {
                    const dimmed = highlightedDoseKey && highlightedDoseKey !== k.key;
                    const stroke = k.isSpent ? "#b8aea0" : k.color;
                    const baseOpacity = k.isSpent ? 0.4 : k.isBasal ? 0.55 : k.opacity;
                    const strokeOpacity = baseOpacity * (dimmed ? 0.22 : 1);
                    return (
                      <Line
                        key={`line_${k.key}`}
                        yAxisId="insulin"
                        type="monotone"
                        dataKey={k.key}
                        name={k.label}
                        stroke={stroke}
                        strokeWidth={k.isBasal ? 1.5 : 2}
                        strokeOpacity={strokeOpacity}
                        fill="none"
                        dot={false}
                        activeDot={false}
                        isAnimationActive={false}
                        connectNulls={true} />
                    );
                    })}
            </ComposedChart>
          </div>

          {/* Insulin unit labels with dotted leaders to curve peaks */}
          {filters.insulin && positionedDoseMarkers.map((m) => {
                  const labelY = INSULIN_ROW_TOP + m.pillTop;
                  const peakYAbs = INSULIN_ROW_TOP + m.peakY;
                  const leaderHeight = Math.max(0, peakYAbs - labelY - 14);
                  const unitsLabel = m.units % 1 === 0 ? m.units : m.units.toFixed(1);
                  const labelColor = m.isSpent ? "#b8aea0" : m.color;
                  return (
                    <div
                      key={`label_${m.key}`}
                      className="absolute z-[9] cursor-pointer"
                      style={{ left: m.x, top: labelY, transform: "translateX(-50%)" }}
                      onMouseEnter={() => setHighlightedDoseKey(m.key)}
                      onMouseLeave={() => setHighlightedDoseKey(null)}
                      onClick={(e) => {e.stopPropagation();handleDoseTap(m.dose, m.key, e.currentTarget.getBoundingClientRect());}}>
                      
                <span className="text-[10px] font-bold whitespace-nowrap px-1 rounded" style={{ color: labelColor, background: "rgba(247,241,232,0.85)" }}>
                  {unitsLabel}u
                </span>
                {leaderHeight > 0 &&
                      <div
                        className="absolute left-1/2 top-full"
                        style={{ height: leaderHeight, borderLeft: `1px dotted ${labelColor}80`, marginLeft: -0.5 }} />

                      }
              </div>);

                })}

          {/* Invisible tap zones for insulin curves */}
          {filters.insulin && positionedDoseMarkers.map((m) =>
                <div
                  key={`hit_${m.key}`}
                  className="absolute z-[7] cursor-pointer"
                  style={{ left: m.x - 30, top: INSULIN_ROW_TOP + dynamicInsulinMarginTop, width: 60, height: INSULIN_PLOT_HEIGHT }}
                  onMouseEnter={() => setHighlightedDoseKey(m.key)}
                  onMouseLeave={() => setHighlightedDoseKey(null)}
                  onClick={(e) => {e.stopPropagation();handleDoseTap(m.dose, m.key, e.currentTarget.getBoundingClientRect());}} />

                )}

          {/* Tappable meal markers ON the glucose curve */}
          {filters.carbs && positionedCarbMarkers.map(({ entry, x, trueX, displaced }) => {
                  const entryTime = new Date(entry.consumed_at).getTime();
                  if (!Number.isFinite(entryTime) || entryTime < domainStart || entryTime > domainEnd) return null;
                  const glucoseAt = getGlucoseAt(entryTime);
                  if (!glucoseAt) return null;
                  const ringY = getGlucoseY(glucoseAt.plotValue);
                  const isRescue = entry.is_rescue_carb === true || entry.classification === "rescue_carbs";
                  return (
                    <div key={`marker_${entry.id}`}>
                {displaced &&
                      <div
                        className="absolute z-[7] pointer-events-none"
                        style={{
                          left: Math.min(x, trueX),
                          top: ringY,
                          width: Math.abs(x - trueX),
                          borderTop: "1px dotted #3f3830",
                          opacity: 0.3
                        }} />

                      }
                <div
                        className="absolute z-[8] cursor-pointer"
                        style={{ left: x, top: ringY, transform: "translate(-50%, -50%)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          const tappedTime = new Date(entry.consumed_at).getTime();
                          const group = filteredCarbEntries.filter((ce) => {
                            const t = new Date(ce.consumed_at).getTime();
                            return Math.abs(t - tappedTime) <= 30 * 60 * 1000;
                          });
                          setEditingMeal(group);
                        }}>
                        
                  <div
                          className="rounded-full transition hover:scale-110"
                          style={{
                            width: 12,
                            height: 12,
                            border: `1.5px solid ${isRescue ? "#8a6db8" : "#3f3830"}`,
                            background: "#f7f1e8"
                          }} />
                        
                </div>
              </div>);

                })}


          </>
              }
        </div>
      </div>
      </div>
      <div className="flex items-center gap-4 px-3 mt-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="h-[2px] w-4" style={{ background: "#5b6550" }} />
          <span className="text-[10px]" style={{ color: "#746959" }}>glucose</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full border-[1.5px]" style={{ borderColor: "#3f3830", background: "#f7f1e8" }} />
          <span className="text-[10px]" style={{ color: "#746959" }}>meals</span>
        </div>
        {activeDoseKeys.map((k) =>
          <div key={k.label} className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ background: k.color }} />
            <span className="text-[10px]" style={{ color: "#746959" }}>{k.label} · {k.totalUnits} u</span>
          </div>
          )}
      </div>
      <div
          ref={monitoringLabelRef}
          className="pointer-events-none mt-1 flex items-center justify-center gap-1.5"
          style={{ opacity: 0, transform: "translateY(4px)", transition: "opacity 350ms ease-in-out, transform 350ms ease-in-out", minHeight: 16, display: isCandlestick ? "none" : undefined }}
          aria-hidden="true">
          
        <AlertTriangle className="h-3 w-3" style={{ color: "#8a5a12" }} />
        <span className="text-[9px] font-medium" style={{ color: "#8a5a12" }}>Delayed glucose response possible. Monitor for extended high's and low's.</span>
      </div>
      </div>

      {activeMarker &&
      <InfoPopover anchorRect={activeMarker.rect} onClose={closeMarker}>
          {activeMarker.type === "carbs" &&
        <div className="space-y-1.5">
              {(() => {
            const isRescue = activeMarker.item.is_rescue_carb === true || activeMarker.item.classification === "rescue_carbs";
            return <>
                  <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: isRescue ? "#8a6db8" : "#a89e8d" }}>{isRescue ? "Rescue Carb" : "Nourishment"}</span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-black" style={{ color: "#3f3830" }}>{Math.round(activeMarker.item.carbs)}</span>
                    <span className="text-xs" style={{ color: "#6b6153" }}>g {isRescue ? "rescue" : "carbs"}</span>
                  </div>
                  <p className="text-xs" style={{ color: "#3f3830" }}>{activeMarker.item.food_name || activeMarker.item.name || "Food"}</p>
                  <p className="text-[11px]" style={{ color: "#746959" }}>{format(new Date(activeMarker.item.consumed_at), "h:mm a · MMM d")}</p>
                </>;
          })()}
            </div>
        }
          {activeMarker.type === "insulin" &&
        <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#746959" }}>Insulin</span>
              <p className="text-sm font-bold" style={{ color: "#3f3830" }}>{activeMarker.item.insulin_type}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black" style={{ color: "#3f3830" }}>{Math.round(activeMarker.item.units)}</span>
                <span className="text-xs" style={{ color: "#6b6153" }}>units</span>
              </div>
              {(() => {
            const iob = getDoseIOB(activeMarker.item, Date.now());
            return iob > 0.01 ?
            <p className="text-[11px]" style={{ color: "#5b6550" }}>{Math.round(iob)}u estimated active</p> :
            <p className="text-[11px]" style={{ color: "#746959" }}>Support complete</p>;
          })()}
              <p className="text-[11px]" style={{ color: "#746959" }}>{format(new Date(activeMarker.item.administered_at), "h:mm a · MMM d")}</p>

            </div>
        }
          {activeMarker.type === "glucose" &&
        <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#746959" }}>Glucose</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black" style={{ color: "#d0c0aeff" }}>{activeMarker.item.value}</span>
                <span className="text-xs" style={{ color: "#6b6153" }}>mg/dL</span>
              </div>
              <p className="text-[11px]" style={{ color: "#746959" }}>{activeMarker.item.source === "dexcom" ? "CGM" : activeMarker.item.source === "system" ? "System" : "Manual"} · {format(new Date(activeMarker.item.recorded_at), "h:mm a · MMM d")}</p>

            </div>
        }

          {(onSelectLog || onDeleteLog) && !(activeMarker.type === "glucose" && (activeMarker.item.source === "dexcom" || glucoseReadOnly)) &&
        <div className="mt-2 flex gap-2">
              {onSelectLog && !confirmDelete &&
          <button type="button" onClick={handleEdit} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition hover:opacity-70" style={{ borderColor: "#eadccf", background: "#fdf9f2", color: "#3f3830" }}>
                  <Pencil className="h-3 w-3" /> Edit
                </button>
          }
              {onDeleteLog && !confirmDelete &&
          <button type="button" onClick={() => setConfirmDelete(true)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition hover:opacity-70" style={{ background: "rgba(200,112,96,0.06)", borderColor: "rgba(200,112,96,0.25)", color: "#c97060" }}>
                  <Trash2 className="h-3 w-3" /> Remove
                </button>
          }
              {confirmDelete &&
          <>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl border py-2 text-xs font-semibold transition hover:opacity-70" style={{ borderColor: "#eadccf", background: "#fdf9f2", color: "#3f3830" }}>Keep it</button>
                  <button type="button" onClick={handleDelete} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border py-2 text-xs font-semibold transition hover:opacity-70" style={{ background: "rgba(200,112,96,0.15)", borderColor: "rgba(200,112,96,0.35)", color: "#c97060" }}>
                    <Trash2 className="h-3 w-3" /> Confirm remove
                  </button>
                </>
          }
            </div>
        }
        </InfoPopover>
      }

      {editingMeal &&
      <MealEditOverlay entries={editingMeal} onClose={() => setEditingMeal(null)} />
      }
    </div>);

}