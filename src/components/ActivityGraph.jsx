import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Area, XAxis, YAxis, Line, ComposedChart, ReferenceLine, ReferenceArea, ReferenceDot } from "recharts";
import { generateActivityCurve, getDoseIOB, getInsulinProfile, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { formatRemaining } from "@/lib/remainingInsulin";
import { PROFILE_COLORS } from "@/lib/carbAbsorption";
import { format } from "date-fns";
import { CornerUpRight, SlidersHorizontal, Check, Pencil, Trash2, Info } from "lucide-react";
import { HIGH_PROTEIN_FAT_MONITORING_HOURS, mergeMonitoringIntervals, hasDelayedRise } from "@/lib/mealMonitoring";
import DelayedRiseCautionCard from "@/components/graph/DelayedRiseCautionCard";
import { GLUCOSE_STATUS_COLORS, readHighReference, FIXED_LOW_REFERENCE } from "@/lib/glucoseStatus";
import { canonicalGlucoseSeries, buildGlucoseSegments } from "@/lib/glucoseSeries";
import { motion, AnimatePresence } from "framer-motion";
import InfoPopover from "@/components/graph/InfoPopover";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { useIsLightTheme } from "@/lib/theme";
import { getGraphTheme } from "@/lib/graphTheme";
import { shouldAnchorToLatest } from "@/lib/graphAnchor";
import { resolveScrollBounds, isAtResting, shouldReturnToResting, shouldFollowLatest } from "@/lib/graphScroll";
import { newestDrawnPoint } from "@/lib/graphMarker";
import { useGlucoseStaleness } from "@/hooks/useGlucoseStaleness";
import { getLatestDexcomReading, formatReadingAge } from "@/lib/glucoseStaleness";
import { formatGlucose, glucoseUnitLabel, getGlucoseUnits } from "@/lib/glucoseUnits";
import GlucoseTicker from "@/components/graph/GlucoseTicker";
import TimeViewToggle from "@/components/graph/TimeViewToggle";
import CandlestickView from "@/components/graph/CandlestickView";
import ReferenceLabels from "@/components/graph/ReferenceLabels";
import MealEditOverlay from "@/components/insulin/MealEditOverlay";
import ProjectionOverlay from "@/components/graph/ProjectionOverlay";

const STEP_MS = 3 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
// How far the plot's domain reaches behind the newest reading. The Home chart
// loads 26 hours of readings, so the domain covers one day and the left edge is
// always backed by real data. Older days live on the Journal's day view.
const HISTORY_DAYS = 1;
const FUTURE_HOURS = 3;

// How long scroll silence marks a gesture (finger or iOS momentum) as finished.
const SCROLL_SETTLE_MS = 150;
const VISIBLE_HOURS = 6;
const HOUR_MS = 60 * 60 * 1000;
// The extended (24 hour) view plots the same one day of history.
const CANDLESTICK_HISTORY_HOURS = 24;
const CANDLESTICK_FUTURE_HOURS = 12;
const CHART_HEIGHT = 305;
const CANDLESTICK_TOTAL_HEIGHT = 425;
const CHART_MARGIN_TOP = 70;
const CHART_MARGIN_BOTTOM = 0;
const X_AXIS_HEIGHT = 30;
const GLUCOSE_CHART_HEIGHT = 234;
// Small top margin: the reading row now lives above the chart in normal flow,
// so the plot only needs enough headroom for the reference labels that sit
// above the highest line.
const GLUCOSE_MARGIN_TOP = 22;
const GLUCOSE_PLOT_HEIGHT = GLUCOSE_CHART_HEIGHT - GLUCOSE_MARGIN_TOP;
const CARB_LANE_HEIGHT = 34;
const INSULIN_PLOT_HEIGHT = 46;
const INSULIN_PEAK_FILL = 0.35; // largest visible dose peak fills 35% of the insulin row
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
  return formatGlucose(value);
}

function formatReadingTime(time) {
  if (!Number.isFinite(time)) return "-";
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
  return (
    <text
      x={x}
      y={y + 11}
      textAnchor="middle"
      fill="#7a6b5d"
      fontSize={11}
      fontWeight={500}>
      {format(date, "h a").toLowerCase()}
    </text>);

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

export default function ActivityGraph({ doses, glucoseReadings = [], carbEntries = [], onSelectLog = null, onDeleteLog = null, glucoseReadOnly = false, projection = null, projectionNote = null, snapshotNow, resumeRevision = 0, historyReady = true, historyLoading = false, historyError = false }) {
  const previousResume = useRef(resumeRevision);
  const previousNowPosition = useRef(null);
  // Identity of the scroll container the last anchoring ran against. A newly
  // mounted container starts at scrollLeft 0 — the oldest edge of the chart —
  // which is never where the reader left off.
  const lastScrollElRef = useRef(null);
  const [showFilter, setShowFilter] = useState(false);
  const [filterAnchorRect, setFilterAnchorRect] = useState(null);
  const [filters, setFilters] = useState({ glucose: true, insulin: true, carbs: true });
  const [viewWindow, setViewWindow] = useState(3);
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

  // ── Stable `now` (jitter fix: state + 60s timer) ──
  // Updates only every 60s, not on every render. This prevents the NOW line,
  // future zone, and IOB thresholds from shifting on every re-render — the
  // primary jitter source: recharts received new x1/x props for
  // ReferenceLine/ReferenceArea on every render, triggering chart re-layout.
  const [clockNow, setStableNow] = useState(() => Date.now());
  const stableNow = snapshotNow ?? clockNow;
  useEffect(() => {
    const id = setInterval(() => setStableNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

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
  const tickerRef = useRef(null);
  const selectionMarkerRef = useRef(null);
  const tooltipTimeRef = useRef(null);
  const tooltipDateRef = useRef(null);
  const scrollFrameRef = useRef(null);
  // True from a touch landing until 150ms after the last scroll event, so both
  // the finger and the momentum it started count as an active gesture.
  const scrollBusyRef = useRef(false);
  // False once the reader has panned away from the live edge.
  const atRestingRef = useRef(true);
  const settleTimerRef = useRef(null);
  const prevLatestValueRef = useRef(null);
  const prevGlowStatusRef = useRef(null);
  const prevOverReferenceRef = useRef(false);
  const lastSelectedKeyRef = useRef(null);
  // The reading the marker sits on, and the window it was picked in, so a
  // window change can carry that same reading across the new scale.
  const anchorTimeRef = useRef(null);
  const lastViewWindowRef = useRef(viewWindow);
  const pendingScrollLeftRef = useRef(0);
  const containerRef = useRef(null);
  const graphViewportRef = useRef(null);
  const monitoringGradientRef = useRef(null);
  const monitoringA11yRef = useRef(null);
  const prevMonitoringActiveRef = useRef(false);
  const monitoringBandRefs = useRef([]);
  const [containerWidth, setContainerWidth] = useState(600);
  const [targetRange, setTargetRange] = useState(readTargetRange);
  const [graphHeight, setGraphHeight] = useState(readGraphHeight);
  const [highReference, setHighReference] = useState(readHighReference);
  const [glucoseUnits, setGlucoseUnitsState] = useState(getGlucoseUnits());
  // Kept in step with the meal window setting so the graph's settings listener
  // stays whole; the projection no longer depends on it.
  const [, setMealOutcomeWindowMin] = useState(() => {
    if (typeof window === "undefined") return 240;
    const v = Number(window.localStorage.getItem("meal_outcome_window_minutes"));
    return Number.isFinite(v) && v > 0 ? v : 240;
  });

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
      setGlucoseUnitsState(getGlucoseUnits());
      const ow = Number(window.localStorage.getItem("meal_outcome_window_minutes"));
      setMealOutcomeWindowMin(Number.isFinite(ow) && ow > 0 ? ow : 240);
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
    // ── Issue 7: stable Y-axis bounds ──
    // Use only VISIBLE readings (within the current domain) so scrolling
    // doesn't change the bounds. Round to stable 50mg/dL increments so a
    // single new reading doesn't cause a visual jump. The bounds only
    // expand when a visible reading truly exceeds the current tier.
    let visibleMax = -Infinity;
    let visibleMin = Infinity;
    for (const r of glucoseReadings || []) {
      const v = Number(getReadingValue(r));
      if (!Number.isFinite(v)) continue;
      if (v > visibleMax) visibleMax = v;
      if (v < visibleMin) visibleMin = v;
    }
    const maxBase = Math.max(graphHeight, Number.isFinite(visibleMax) ? visibleMax : graphHeight);
    // Round UP to the next 50 so small fluctuations don't shift the axis.
    const max = visibleMax > graphHeight ? Math.ceil(maxBase / 50) * 50 : graphHeight;
    // Round DOWN to the nearest 10 for the min, with a 40 floor.
    const min = Number.isFinite(visibleMin) && visibleMin < 40 ? Math.floor(visibleMin / 10) * 10 : 40;
    return { effectiveMax: max, effectiveMin: min };
  }, [glucoseReadings, graphHeight]);

  const rangeTotal = effectiveMax - effectiveMin;
  const highPct = ((effectiveMax - targetHigh) / rangeTotal * 100).toFixed(1);
  const lowPct = ((effectiveMax - targetLow) / rangeTotal * 100).toFixed(1);

  // Only include doses/carbs if their filter is on
  const filteredDoses = filters.insulin ? doses : [];
  const filteredCarbEntries = filters.carbs ? carbEntries.map(normalizeCarbEntry).filter((entry) => entry.carbs > 0 && entry.consumed_at) : [];

  // One canonical real-reading series feeds the current marker, the selected
  // reading and the chart: ordered by sensor time, one point per sensor
  // timestamp, carry-forward rows excluded.
  const sortedGlucoseReadings = useMemo(() =>
  canonicalGlucoseSeries(glucoseReadings, { cgmOnly: dexcomConnected }),
  [glucoseReadings, dexcomConnected]
  );

  const latestGlucoseReading = sortedGlucoseReadings[sortedGlucoseReadings.length - 1];
  const latestDexcomReading = useMemo(
    () => getLatestDexcomReading(sortedGlucoseReadings),
    [sortedGlucoseReadings]
  );
  const isGlucoseStale = useGlucoseStaleness(latestDexcomReading, dexcomConnected);
  const latestGlucoseTime = latestGlucoseReading?.time ?? Math.round(stableNow / STEP_MS) * STEP_MS;
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

  // Quiet hint when the visible window has almost no readings (e.g. the 24h
  // Daily Flow view with a tiny data sliver). Matches the Rhythm empty-state tone.
  const showSparseHint = filters.glucose && filteredGlucoseReadings.length < 3;

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

  // ── One smooth glucose trace, broken only at genuine gaps ──────────────
  // Readings arrive about every five minutes, so they join into one
  // continuous line; a slightly early or late reading never splits it. The
  // path breaks only where a sample is actually missing, and resumes as a
  // new smooth line when readings come back. Nothing is bridged across that
  // hole and no value is ever invented between samples.
  const glucoseSegments = useMemo(() => {
    const samples = filteredGlucoseReadings.
    map((reading) => ({ time: getReadingTime(reading), value: Number(getReadingValue(reading)) })).
    filter((sample) => Number.isFinite(sample.time) && Number.isFinite(sample.value));
    return buildGlucoseSegments(samples);
  }, [filteredGlucoseReadings]);

  // Which run of readings each chart bucket belongs to, so every sample lands
  // on its own run's line.
  const glucoseBucketSegments = useMemo(() => {
    const byBucket = new Map();
    glucoseSegments.forEach((segment, index) => {
      segment.forEach((sample) => {
        byBucket.set(Math.round(sample.time / STEP_MS) * STEP_MS, `glucose_seg_${index}`);
      });
    });
    return byBucket;
  }, [glucoseSegments]);

  // A run that holds a single reading has no line to draw, so it keeps a
  // visible marker instead of disappearing.
  const glucoseIsolatedPoints = useMemo(
    () => glucoseSegments.filter((segment) => segment.length === 1).map((segment) => segment[0]),
    [glucoseSegments]
  );

  const maxBolusUnits = useMemo(
    () => Math.max(...filteredDoses.filter((d) => !isBasalInsulinType(d.insulin_type)).map(getDoseUnits), 1),
    [filteredDoses]
  );
  const maxBasalUnits = useMemo(
    () => Math.max(...filteredDoses.filter((d) => isBasalInsulinType(d.insulin_type)).map(getDoseUnits), 1),
    [filteredDoses]
  );
  // Dose-proportional y-axis: the largest visible dose (bolus or basal) fills
  // INSULIN_PEAK_FILL of the insulin row; every other dose peaks at a height
  // proportional to its own units, so a 40u dose towers over a 6u dose.
  const maxVisibleUnits = Math.max(maxBolusUnits, maxBasalUnits, 1);
  const insulinYMax = maxVisibleUnits / INSULIN_PEAK_FILL;

  // Sub-linear amplitude compression: small doses get a proportionally
  // taller curve so they stay visible next to large doses, while the
  // largest dose still fills the same INSULIN_PEAK_FILL ceiling. A 3u
  // dose next to a 40u max rises ~3x higher than pure linear scaling.
  const AMPLITUDE_POWER = 0.6;
  const dosePeakRatio = (units) => Math.pow(units / maxVisibleUnits, AMPLITUDE_POWER);

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
        // Basal coverage band: pill sits at the top of the plateau, scaled
        // proportionally by dose units against the largest visible dose.
        const na = closest.activity || 0;
        const doseUnits = getDoseUnits(dose);
        offset = (1 - na * dosePeakRatio(doseUnits) * INSULIN_PEAK_FILL) * INSULIN_PLOT_HEIGHT - pillHeight - pillGap;
        peakTime = closest.time;
      } else {
        let peak = curve[0];
        for (const p of curve) {
          if (p.activity > peak.activity) peak = p;
        }
        // Dose-proportional: peak height scales with units against the
        // largest visible dose, so the pill sits just above the curve's
        // actual proportional peak.
        const doseUnits = getDoseUnits(dose);
        offset = (1 - dosePeakRatio(doseUnits) * INSULIN_PEAK_FILL) * INSULIN_PLOT_HEIGHT - pillHeight - pillGap;
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
  }, [allCurvesMeta, domainStart, domainEnd, maxVisibleUnits]);

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
          // Dose-proportional activity: multiply the peak-normalized shape
          // (0–1) by the dose's units so a 40u dose peaks proportionally
          // taller than a 6u dose, both against insulinYMax. The curve SHAPE
          // (rise → peak → tail) still comes from the exponential model; real
          // units remain on _actual/_aupm for IOB sums and tooltips.
          point[key] = activity * dosePeakRatio(doseUnits) * maxVisibleUnits;
          point[`${key}_actual`] = activeUnits;
          point[`${key}_activity`] = activity;
          point[`${key}_aupm`] = aupm;
          point[`${key}_total`] = doseUnits;
        }
      });
      if (glucoseMap[t] !== undefined) {
        point.glucose = Math.min(glucoseMap[t], effectiveMax);
        const segmentKey = glucoseBucketSegments.get(t);
        if (segmentKey) point[segmentKey] = Math.min(glucoseMap[t], effectiveMax);
      }
      result.push(point);
    }
    return result;
  }, [doses, glucoseReadings, carbEntries, filters, domainStart, domainEnd, allCurvesMeta, glucoseMap, glucoseBucketSegments, maxBolusUnits, maxBasalUnits, effectiveMax, effectiveMin]);

  // The newest point the glucose line actually DRAWS.
  //
  // The marker used to come from its own list, so it could name a sample the
  // plotted rows did not carry — and a ReferenceDot outside the domain is
  // silently dropped, leaving the line with no end dot. This reads the last
  // plotted row that holds a glucose segment value, so the dot is by
  // construction a point of the line it marks.
  const newestDrawnGlucosePoint = useMemo(() => newestDrawnPoint(chartData), [chartData]);

  // The end-of-line marker is a plain element placed INSIDE the scrollable
  // content, at the newest reading's own x in the chart's coordinate space
  // (latestGlucoseX) and its own y on the glucose scale. Because it lives in
  // the same scrolled box as the curve, it moves with the curve by definition;
  // it cannot be left behind on screen. See the marker itself in the chart
  // content below.

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
        isActive: getDoseIOB(dose, stableNow) > 0,
        isSpent: getDoseIOB(dose, stableNow) <= 0,
        opacity
      };
    });
  }, [filteredDoses, stableNow]);

  // Only insulin types whose curves have activity overlapping the visible
  // graph window — drives the legend so it reflects what's actually shown.
  // Per-insulin-type totals, counting only doses whose model still has a
  // remainder — the same test the IOB card uses — so the legend stays accurate
  // to what is still modelled, including lingering long-lasting insulins.
  // Displayed as "Xu Type" next to each color dot.
  const activeDoseKeys = useMemo(() => {
    const byType = new Map();
    allCurvesMeta.forEach(({ dose, curve }) => {
      if (!curve.length) return;
      const iob = getDoseIOB(dose, stableNow);
      if (iob <= 0) return;
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
  }, [allCurvesMeta, stableNow]);

  const totalMs = domainEnd - domainStart;
  const visibleMs = viewWindow * 60 * 60 * 1000;
  const pxPerMin = containerWidth / (visibleMs / 60000);
  const chartWidth = Math.max(containerWidth, Math.round(totalMs / 60000 * pxPerMin));
  const latestGlucoseX = (latestGlucoseBucket - domainStart) / totalMs * chartWidth;

  // THE RESTING POSITION IS THE CENTRE OF THE VIEWPORT.
  //
  // The newest reading belongs in the middle of the view: history to the left,
  // the projection tail to the right. The content keeps the chart's full width,
  // so that tail is on screen instead of being clipped at the reading. Every
  // automatic write targets restingScrollLeft — never the end of the content,
  // which sits up to half a viewport further right and is what parked the
  // reading against the right edge.
  const { restingScrollLeft, maxScrollLeft, contentWidth } = resolveScrollBounds({
    chartWidth,
    containerWidth,
    latestX: latestGlucoseX
  });
  const plotHeight = GLUCOSE_PLOT_HEIGHT;

  const mergedMonitoringIntervals = useMemo(() => {
    const MS = HIGH_PROTEIN_FAT_MONITORING_HOURS * 60 * 60 * 1000;
    const intervals = (Array.isArray(carbEntries) ? carbEntries : []).
    filter((e) => hasDelayedRise(e) && e.consumed_at).
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
        const du = getDoseUnits(dose);
        peakInfoByKey[key] = {
          peakTime: closest.time,
          peakY: dynamicInsulinMarginTop + (1 - na * dosePeakRatio(du) * INSULIN_PEAK_FILL) * INSULIN_PLOT_HEIGHT
        };
      } else {
        const du = getDoseUnits(dose);
        peakInfoByKey[key] = { peakTime: peak.time, peakY: dynamicInsulinMarginTop + (1 - dosePeakRatio(du) * INSULIN_PEAK_FILL) * INSULIN_PLOT_HEIGHT };
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
      const isActive = getDoseIOB(dose, stableNow) > 0;
      const isSpent = getDoseIOB(dose, stableNow) <= 0;
      return { dose, x, units, key, color, pillTop, peakY, isActive, isSpent };
    }).
    filter(Boolean);
  }, [filteredDoses, allCurvesMeta, maxBolusUnits, maxBasalUnits, maxVisibleUnits, domainStart, domainEnd, totalMs, chartWidth, dynamicInsulinMarginTop, stableNow]);

  const getGlucoseY = useCallback((value) => {
    const clamped = Math.min(Math.max(value, effectiveMin), effectiveMax);
    return GLUCOSE_MARGIN_TOP + (effectiveMax - clamped) / (effectiveMax - effectiveMin) * plotHeight;
  }, [effectiveMin, effectiveMax, plotHeight]);

  // The 24-hour (candlestick) window draws its own plot geometry, so the
  // projection overlay maps onto that plot instead of the line chart's.
  const candlePlotHeight = CHART_HEIGHT - CHART_MARGIN_TOP - X_AXIS_HEIGHT;
  const getCandleGlucoseY = useCallback((value) => {
    const clamped = Math.min(Math.max(value, effectiveMin), effectiveMax);
    return CHART_MARGIN_TOP + (effectiveMax - clamped) / (effectiveMax - effectiveMin) * candlePlotHeight;
  }, [effectiveMin, effectiveMax, candlePlotHeight]);

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

  // The marker sits on the reading the big number shows — the one nearest the
  // centre of the view. At rest that is the newest reading, so the dot rests on
  // the end of the line; as the view scrolls, it travels along the curve to
  // whichever reading is now displayed, instead of being stranded on an earlier
  // sample. It is moved imperatively from the same frame as the number, so it
  // can never lag behind the scroll.
  const positionSelectionMarker = (reading) => {
    const el = selectionMarkerRef.current;
    if (!el || !reading || !Number.isFinite(reading.time)) return;
    const value = Number(getReadingValue(reading) ?? reading.value);
    if (!Number.isFinite(value)) return;
    const HALO_R = 9;
    const cx = Math.min(
      Math.max((reading.time - domainStart) / totalMs * chartWidth, HALO_R),
      Math.max(HALO_R, chartWidth - HALO_R)
    );
    const cy = Math.min(
      Math.max(getGlucoseY(Math.min(value, effectiveMax)), GLUCOSE_MARGIN_TOP + HALO_R),
      GLUCOSE_MARGIN_TOP + plotHeight - HALO_R
    );
    el.setAttribute("transform", `translate(${cx} ${cy})`);
  };

  // The centred reading's number, time and glow, plus the marker that rides on
  // that same reading.
  const drawCenterGlucose = (scrollLeft, animate = false, suppressMotion = false) => {
    const timeEl = tooltipTimeRef.current;
    const dateEl = tooltipDateRef.current;

    if (!filters.glucose || !glucoseLinePoints.length) return;

    const centerTime = getCenterTimeForScroll(scrollLeft);

    // The selected data point is always a REAL Dexcom reading — the one
    // nearest the viewport center. Its exact value drives the large number;
    // the marker can keep tracking the smooth line for visual continuity.
    const selected = getSelectedReading(centerTime);
    if (!selected || !Number.isFinite(selected.time)) return;

    // Keep the marker on the reading the number is showing, and remember which
    // reading that is so a window change can keep it in place.
    anchorTimeRef.current = selected.time;
    positionSelectionMarker(selected);

    // Stale-reading contingency: when the CGM stream has gone quiet and the
    // viewport is centered in the gap past the last real reading, hide the
    // marker, show "--" in the ticker, and surface the last reading's age.
    const lastReadingTime = glucoseLinePoints.length ? glucoseLinePoints[glucoseLinePoints.length - 1].time : null;
    if (isGlucoseStale && lastReadingTime != null && centerTime >= lastReadingTime) {
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
    const shouldAnimate = !suppressMotion && lastSelectedKeyRef.current !== null && lastSelectedKeyRef.current !== selectedKey;
    lastSelectedKeyRef.current = selectedKey;

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

    if (anyActive !== prevMonitoringActiveRef.current) {
      prevMonitoringActiveRef.current = anyActive;
      const a = monitoringA11yRef.current;
      if (a) a.textContent = anyActive ? "Extended meal response window active." : "Extended meal response window ended for the selected graph time.";
    }
  };

  // ── Scroll gestures: observe, never correct mid-gesture ────────────────
  //
  // A scroll handler may not move the container. Writing scrollLeft there
  // fights iOS momentum (iOS pushes past the end, the handler pulls it back,
  // iOS pushes again), and that fight is what moved the now-guide up to 142px
  // mid-swipe. This is the only correction, it runs once a gesture has genuinely
  // finished, and it targets the resting offset — the centre of the viewport,
  // never the end of the content — so a bounce resolves to centre. Panning into
  // history is never pulled back.
  const settleScroll = () => {
    scrollBusyRef.current = false;
    const el = scrollRef.current;
    if (el && shouldReturnToResting(el.scrollLeft, restingScrollLeft)) {
      el.scrollLeft = restingScrollLeft;
    }
  };

  const scheduleScrollSettle = () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      settleScroll();
    }, SCROLL_SETTLE_MS);
  };

  const beginScrollGesture = () => {
    scrollBusyRef.current = true;
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  };

  // The finger lifting does not end the gesture — iOS momentum keeps firing
  // scroll events — so this only (re)arms the idle timer that decides when the
  // movement is genuinely over.
  const endScrollGesture = () => scheduleScrollSettle();

  // Finger down or momentum still running — either way the reader is moving the
  // viewport, so nothing here writes a position.
  const handleScrollPosition = (scrollLeft) => {
    scrollBusyRef.current = true;
    // Following the live edge is only allowed from the live edge. Panning away
    // latches it off until the reader comes back to the edge or taps Now.
    atRestingRef.current = isAtResting(scrollLeft, restingScrollLeft);
    scheduleCenterGlucoseUpdate(scrollLeft);
    scheduleScrollSettle();
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

  // Back to the present: the viewport centres the newest real reading, so the
  // marker and the large number land on the freshest value.
  const scrollToLatestGlucose = () => {
    if (!scrollRef.current) return;

    // Tapping Now re-arms following, whatever the reader had latched off.
    atRestingRef.current = true;
    scrollRef.current.scrollTo({ left: restingScrollLeft, behavior: "smooth" });
    scheduleCenterGlucoseUpdate(restingScrollLeft);
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    const resumed = previousResume.current !== resumeRevision;
    previousResume.current = resumeRevision;
    const freshViewport = lastScrollElRef.current !== scrollRef.current;
    lastScrollElRef.current = scrollRef.current;
    const anchorToLatest = shouldAnchorToLatest({
      resumed,
      freshViewport,
      previousNowPosition: previousNowPosition.current,
      scrollLeft: scrollRef.current.scrollLeft
    });
    // Auto-follow writes ONLY when the reader is not moving the viewport and was
    // already sitting within 24px of rest. Writing the new resting offset is the
    // delta shift: the content moves with the reading, so the marker stays fixed
    // in the centre instead of jumping. Once the reader pans away, nothing drags
    // them back: the Now control is the way home.
    const followAllowed = shouldFollowLatest({
      busy: scrollBusyRef.current,
      atResting: atRestingRef.current
    });
    // A change of window (3h ↔ 6h ↔ 12h) only zooms the graph: the reading the
    // marker sits on is carried across the new scale and re-centred, so the
    // visible span changes while the marker stays on the same reading in the
    // same place on screen.
    const viewChanged = lastViewWindowRef.current !== viewWindow;
    lastViewWindowRef.current = viewWindow;
    if (viewChanged && anchorTimeRef.current != null) {
      const anchorX = (anchorTimeRef.current - domainStart) / totalMs * chartWidth;
      const keepLeft = Math.min(Math.max(anchorX - containerWidth / 2, 0), Math.max(maxScrollLeft, 0));
      scrollRef.current.scrollLeft = keepLeft;
      atRestingRef.current = isAtResting(keepLeft, restingScrollLeft);
    } else if (anchorToLatest && followAllowed) {
      scrollRef.current.scrollLeft = restingScrollLeft;
    }
    previousNowPosition.current = restingScrollLeft;
    const position = scrollRef.current.scrollLeft;
    const latestValue = glucoseLinePoints.length > 0 ? glucoseLinePoints[glucoseLinePoints.length - 1].value : null;
    const shouldAnimate = !resumed && prevLatestValueRef.current !== null && latestValue !== null && latestValue !== prevLatestValueRef.current;
    prevLatestValueRef.current = latestValue;
    drawCenterGlucose(position, shouldAnimate, resumed);
    updateMonitoringOverlay(position);

    return () => {
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [restingScrollLeft, latestGlucoseBucket, filters.glucose, glucoseLinePoints.length, positionedMonitoringIntervals, isGlucoseStale, glucoseUnits, resumeRevision, viewWindow, chartWidth]);

  // The waiting state keeps the SAME root element as the chart, so the measured
  // container and its ResizeObserver survive the swap. Returning a different
  // root here detached the observer, which froze the chart width at its default
  // and left the trace mis-scaled once data arrived.
  if (!historyReady || !doses.length && !glucoseReadings.length && !carbEntries.length) {
    return (
      <div ref={containerRef} className="relative overflow-visible">
        <div className="flex min-h-[240px] items-center justify-center px-5 text-center text-sm text-muted-foreground" role="status">
          {!historyReady ? historyLoading ? 'Loading saved history…' : 'Saved history is unavailable right now.' :
          historyError ? 'Saved history is unavailable right now.' : 'No readings or logs in this window yet.'}
        </div>
      </div>);

  }

  // Range-driven tick count: 3h/6h → 1h interval, 12h → 2h, 24h → 4h.
  // Prevents hundreds of duplicate hour labels from flooding the DOM.
  const tickIntervalMs = viewWindow <= 6 ? HOUR_MS : viewWindow <= 12 ? 2 * HOUR_MS : 4 * HOUR_MS;
  const timeTicks = [];
  const firstTick = Math.ceil(domainStart / tickIntervalMs) * tickIntervalMs;
  for (let tick = firstTick; tick <= domainEnd; tick += tickIntervalMs) {
    timeTicks.push(tick);
  }

  // How many filters are off (to show indicator dot)
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  // The newest real reading — the point the marker always sits on.
  const latestGlucosePoint = glucoseLinePoints.length ? glucoseLinePoints[glucoseLinePoints.length - 1] : null;

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
      {/* Compact reading row — the selected reading's number and unit on the
             left, its time and date and the way back to now on the right. It sits
             in normal flow above the trace, replacing the tall stacked block that
             used to float over the top of the chart and leave dead space. */}
      <div className="resume-chart-row relative flex items-center gap-2 px-[18px] pb-1.5">
        <div className="resume-chart-reading flex min-w-0 items-end gap-2">
          {filters.glucose && glucoseLinePoints.length > 0 &&
            <>
              {(onSelectLog || onDeleteLog) && !dexcomConnected &&
              <span className="flex h-4 w-4 shrink-0 items-center justify-center self-center rounded-full border" style={{ borderColor: "#e6dccd", background: "#fdf8f1", color: "#7a6b5d" }}>
                  <Info className="h-2.5 w-2.5" />
                </span>
              }
              <span className="flex items-baseline gap-1" style={{ color: "#3a2f28" }}>
                <GlucoseTicker
                  ref={tickerRef}
                  className="text-[27px] font-light leading-none tabular-nums"
                  initialValue={formatGlucoseDisplay(glucoseLinePoints[glucoseLinePoints.length - 1].value)} />
                <span className="text-[11px] font-medium leading-none" style={{ color: "#a39484" }}>{glucoseUnitLabel()}</span>
              </span>
              {/* Thin hairline divider between the reading and its timestamp. */}
              <span aria-hidden="true" className="h-[18px] w-px shrink-0 self-center" style={{ background: "#e6dccd" }} />
            </>
            }
          {/* Time over weekday/date, directly after the divider inside the same
                 left-aligned reading group. Both lines use leading-none and the
                 3px bottom padding lifts the stack so the date's bottom edge lands
                 on the same baseline as the glucose number and mg/dL, rather than
                 hanging below it. */}
          <span className="flex min-w-0 flex-col pb-[3px]" style={{ color: "#7a6b5d" }}>
            <span ref={tooltipTimeRef} className="text-[11px] font-medium leading-none tabular-nums" />
            <span ref={tooltipDateRef} className="mt-[3px] truncate text-[10px] leading-none" />
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center">
          <button
              type="button"
              onClick={scrollToLatestGlucose}
              className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2 transition hover:opacity-70 self-center"
              style={{ background: "#f3ece0", color: "#8a4a2a" }}
              aria-label="Back to now">
              <CornerUpRight className="h-3.5 w-3.5" />
              <span className="text-[11px] font-semibold">Now</span>
            </button>
        </div>
      </div>
      <div
          ref={graphViewportRef}
          className="relative overflow-hidden"
          style={{ width: "100%" }}>
      {showSparseHint &&
          <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center">
          <span className="text-[12px]" style={{ color: "#746959" }}>Not much logged in this window yet</span>
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
            { id: "highRef", value: highReference, side: "right", color: GLUCOSE_STATUS_COLORS.high, anchor: "above", secondary: true, text: `High ${formatGlucose(highReference)}` },
            { id: "lowRef", value: FIXED_LOW_REFERENCE, side: "right", color: GLUCOSE_STATUS_COLORS.low, anchor: "below", secondary: true, text: `${formatGlucose(FIXED_LOW_REFERENCE)}` },
            { id: "tgtHigh", value: targetHigh, side: "right", color: gTheme.inRangeColor, anchor: "above", secondary: false, text: `${formatGlucose(targetHigh)}` },
            { id: "tgtLow", value: targetLow, side: "right", color: gTheme.inRangeColor, anchor: "below", secondary: false, text: `${formatGlucose(targetLow)}` }];

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
            style={{
              WebkitOverflowScrolling: "touch",
              // The end of the content is the end of the story: the browser is
              // told not to rubber-band past it, so nothing has to be pulled
              // back afterwards.
              overscrollBehaviorX: "contain",
              scrollbarWidth: "none",
              overflowY: "hidden"
            }}
            onTouchStart={beginScrollGesture}
            onTouchEnd={endScrollGesture}
            onTouchCancel={endScrollGesture}
            onScroll={(event) => handleScrollPosition(event.currentTarget.scrollLeft)}>
        {/* The chart's full width: at rest the reading is centred and the
                 projection tail continues past it to the right. */}
        <div className="relative" style={{ width: contentWidth, height: isCandlestick ? CANDLESTICK_TOTAL_HEIGHT : twoRowHeight }}>
          {/* No forecast, but a reason. When the engine withholds a trajectory it
                   is because the evidence is genuinely absent, so the future area says
                   so quietly, in the graph's own type — never a bare gap. */}
          {!projection && projectionNote && (() => {
                const nowX = (stableNow - domainStart) / totalMs * chartWidth;
                const noteWidth = 176;
                const left = Math.min(Math.max(nowX + 14, 8), Math.max(8, chartWidth - noteWidth - 8));
                return (
                  <div
                    className="pointer-events-none absolute z-[6]"
                    style={{ left, top: GLUCOSE_MARGIN_TOP + 10, width: noteWidth }}>
                <p className="text-[11px] leading-snug" style={{ color: "#746959" }}>{projectionNote}</p>
              </div>);

              })()}
          {isCandlestick ?
              <>
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
                  highReference={highReference} />

                {/* The projection belongs to every window that contains its
                     points, the 24-hour view included. It maps onto this view's
                     own plot geometry and clips at the edges like the rest. */}
                {projection &&
                <ProjectionOverlay
                  projection={projection}
                  domainStart={domainStart}
                  totalMs={totalMs}
                  chartWidth={chartWidth}
                  glucoseChartHeight={CHART_HEIGHT}
                  glucoseMarginTop={CHART_MARGIN_TOP}
                  plotHeight={candlePlotHeight}
                  effectiveMin={effectiveMin}
                  effectiveMax={effectiveMax}
                  getGlucoseY={getCandleGlucoseY}
                  latestReading={latestGlucosePoint}
                  readings={filteredGlucoseReadings} />

                }
              </> :


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
                      x1={stableNow}
                      x2={domainEnd}
                      fill="#af751b"
                      fillOpacity={0.06}
                      stroke="none" />

                    }

              <YAxis yAxisId="glucose" domain={[effectiveMin, effectiveMax]} allowDataOverflow hide />

              {filters.glucose && filteredGlucoseReadings.length > 0 &&
                    <>
                  {/* The comfort zone as a status band: quiet sage wash with two
                           thin solid sage edges, using the user's own thresholds. */}
                  <ReferenceArea
                        yAxisId="glucose"
                        y1={targetLow}
                        y2={targetHigh}
                        fill="#8fa68c"
                        fillOpacity={0.14}
                        stroke="none" />
                  <ReferenceLine yAxisId="glucose" y={targetHigh} stroke="#5f8460" strokeWidth={1} strokeOpacity={0.55} />
                  <ReferenceLine yAxisId="glucose" y={targetLow} stroke="#5f8460" strokeWidth={1} strokeOpacity={0.55} />
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
                      
                  {/* Now — a faint dotted vertical through the measured area. */}
                  <ReferenceLine
                        x={stableNow}
                        yAxisId="glucose"
                        stroke="#8a7b6b"
                        strokeWidth={1}
                        strokeDasharray="2 4"
                        strokeOpacity={0.35} />
                      
                </>
                    }

              {/* One smooth line per contiguous run of readings. Readings on
                         their normal cadence flow through as a single curve; a
                         genuinely missing sample ends its run, leaving real blank
                         space until readings resume and a new smooth line starts. */}
              {filters.glucose && filteredGlucoseReadings.length > 0 &&
                    glucoseSegments.map((segment, index) =>
                    <Line
                      key={`glucose_seg_${index}`}
                      yAxisId="glucose"
                      type="monotoneX"
                      dataKey={`glucose_seg_${index}`}
                      name="Glucose"
                      className="stackd-glucose-trend"
                      stroke="#8c4a28"
                      strokeWidth={2.75}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      dot={false}
                      activeDot={false}
                      connectNulls
                      isAnimationActive={false} />

                    )
                    }

              {/* A lone reading between two gaps has no line to draw, and the
                         newest reading always carries a marker, so nothing real ever
                         disappears from the trace. */}
              {filters.glucose && glucoseIsolatedPoints.
                    filter((point) => point.time !== newestDrawnGlucosePoint?.time).
                    map((point) =>
                    <ReferenceDot
                      key={`glucose_lone_${point.time}`}
                      yAxisId="glucose"
                      x={point.time}
                      y={Math.min(point.value, effectiveMax)}
                      r={2.6}
                      fill="#8d8672"
                      stroke="#fdf9f2"
                      strokeWidth={1.2}
                      isFront />

                    )
                    }
              {/* The current-reading marker is NOT a chart annotation. It is
                         painted by the glucose line itself, through that line's own dot
                         renderer (see renderNewestMarker above), because an annotation
                         placed beside the plot is what left a dot hovering over older
                         data while the curve moved. Anything added here as a separate
                         overlay element would bring that bug back. */}
            </ComposedChart>
          </div>

          {/* ── Projection overlay (future trajectory) ── */}
          {projection &&
                <ProjectionOverlay
                  projection={projection}
                  domainStart={domainStart}
                  totalMs={totalMs}
                  chartWidth={chartWidth}
                  glucoseChartHeight={GLUCOSE_CHART_HEIGHT}
                  glucoseMarginTop={GLUCOSE_MARGIN_TOP}
                  plotHeight={plotHeight}
                  effectiveMin={effectiveMin}
                  effectiveMax={effectiveMax}
                  getGlucoseY={getGlucoseY}
                  latestReading={latestGlucosePoint}
                  readings={filteredGlucoseReadings} />

                }

          {/* ── The selection marker ──
                     One dot, drawn inside the chart's own content coordinates, sitting
                     on the reading the big number shows. It starts on the newest
                     reading and is then moved by positionSelectionMarker() from the
                     same animation frame that updates the number, so scrolling carries
                     it along the line to the displayed sample instead of leaving it on
                     an earlier one. Coordinates are clamped inside the plot so it can
                     never render outside the drawable area. */}
          {!isCandlestick && filters.glucose && (() => {
                  const HALO_R = 9;
                  const newest = filteredGlucoseReadings[filteredGlucoseReadings.length - 1];
                  const newestValue = newest ? Number(getReadingValue(newest) ?? newest.value) : NaN;
                  const clampX = (t) => Math.min(Math.max((t - domainStart) / totalMs * chartWidth, HALO_R), Math.max(HALO_R, chartWidth - HALO_R));
                  const clampY = (v) => Math.min(
                    Math.max(getGlucoseY(Math.min(v, effectiveMax)), GLUCOSE_MARGIN_TOP + HALO_R),
                    GLUCOSE_MARGIN_TOP + plotHeight - HALO_R
                  );
                  const startX = newest && Number.isFinite(newest.time) ? clampX(newest.time) : chartWidth - HALO_R;
                  const startY = Number.isFinite(newestValue) ? clampY(newestValue) : GLUCOSE_MARGIN_TOP + plotHeight / 2;
                  return (
                    <svg
                      className="pointer-events-none absolute left-0 top-0 z-[12]"
                      width={chartWidth}
                      height={GLUCOSE_CHART_HEIGHT}
                      viewBox={`0 0 ${chartWidth} ${GLUCOSE_CHART_HEIGHT}`}
                      aria-hidden="true">
                <g ref={selectionMarkerRef} transform={`translate(${startX} ${startY})`}>
                  <circle r={9} fill="#8c4a28" fillOpacity={0.12} />
                  <circle r={3.6} fill="#8c4a28" stroke="#fdf8f1" strokeWidth={1.6} />
                </g>
              </svg>);

                })()}

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

              <YAxis yAxisId="insulin" domain={[0, insulinYMax]} allowDataOverflow hide />

              {/* A neutral hairline under the traces, on the shared time axis. */}
              <ReferenceLine yAxisId="insulin" y={0} stroke="#e6dccd" strokeWidth={1} />

              {/* The same faint "now" marker as the glucose row, continued
                         through the insulin lane on this chart's own coordinates. */}
              {filters.glucose &&
                    <ReferenceLine
                      x={stableNow}
                      yAxisId="insulin"
                      stroke="#8a7b6b"
                      strokeWidth={1}
                      strokeDasharray="2 4"
                      strokeOpacity={0.35} />
                    }

              {filters.insulin && doseKeys.map((k) => {
                      const dimmed = highlightedDoseKey && highlightedDoseKey !== k.key;
                      const stroke = k.isSpent ? "#b8aea0" : k.color;
                      const fillOpacity = (k.isSpent ? 0.07 : k.isBasal ? 0.10 : 0.16) * (dimmed ? 0.25 : 1);
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
                          connectNulls={true} />);

                    })}
              {filters.insulin && doseKeys.map((k) => {
                      const dimmed = highlightedDoseKey && highlightedDoseKey !== k.key;
                      const stroke = k.isSpent ? "#b8aea0" : k.color;
                      const baseOpacity = k.isSpent ? 0.45 : k.isBasal ? 0.55 : k.opacity;
                      const strokeOpacity = baseOpacity * (dimmed ? 0.22 : 1);
                      return (
                        <Line
                          key={`line_${k.key}`}
                          yAxisId="insulin"
                          type="monotone"
                          dataKey={k.key}
                          name={k.label}
                          stroke={stroke}
                          strokeWidth={k.isSpent ? 1.75 : k.isBasal ? 1.75 : 2.5}
                          strokeOpacity={strokeOpacity}
                          fill="none"
                          dot={false}
                          activeDot={false}
                          isAnimationActive={false}
                          connectNulls={true} />);

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

          {/* There is exactly ONE end-of-line marker, and it is the pair of
                     ReferenceDots drawn inside the glucose chart's own SVG (above).
                     A second, DOM-positioned copy used to live here: an absolutely
                     positioned div whose `left` was computed from the chart width. An
                     overlay element like that is a sibling of the plot rather than a
                     child of its coordinate space, so it can sit still on screen while
                     the curve travels under it — which is exactly the "planted dot"
                     that was measured. Nothing may be positioned here again: the marker
                     must stay inside the SVG, mapped by the chart's own x and y scales,
                     so it can only ever move with the line it marks. */}

          </>
              }
        </div>
      </div>
      </div>
      <div className="px-3 mt-1.5 space-y-1">
        {/* Row 1: received / projected / selected — the three states of the
               trace, in the graph's own words. */}
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="h-[2.75px] w-3 rounded-full" style={{ background: "#8c4a28" }} />
            <span className="text-[10px] font-medium" style={{ color: "#7a6b5d" }}>received</span>
          </div>
          {projection &&
            <>
              <div className="flex items-center gap-1.5">
                <div className="h-[2.5px] w-3 border-t-2 border-dashed" style={{ borderColor: "#AF751B", opacity: 0.9 }} />
                <span className="text-[10px] font-medium" style={{ color: "#7a6b5d" }}>projected</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full hidden" style={{ border: "1.5px solid #8C4A28", background: "rgba(140,74,40,0.12)" }} />
                <span className="text-[10px] font-medium hidden" style={{ color: "#7a6b5d" }}>selected</span>
              </div>
            </>
            }
        </div>
        {/* Row 2: insulin entries, plus the meal markers */}
        <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full" style={{ border: "1.5px solid #3f3830", background: "#f7f1e8" }} />
            <span className="text-[10px] font-medium" style={{ color: "#6b6153" }}>Meals</span>
          </div>
          {activeDoseKeys.length > 0 ?
            activeDoseKeys.map((k) =>
            <div key={k.label} className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full" style={{ background: k.color }} />
                <span className="text-[10px] font-medium" style={{ color: "#6b6153" }}>{k.label} {k.totalUnits}u</span>
              </div>
            ) :

            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ background: "#5b6550" }} />
              <span className="text-[10px] font-medium" style={{ color: "#6b6153" }}>Insulin</span>
            </div>
            }
          {filters.insulin && doseKeys.some((k) => k.isSpent) &&
            <div className="flex items-center gap-1.5">
              <div className="h-2 w-2 rounded-full" style={{ background: "#b8aea0" }} />
              <span className="text-[10px] font-medium" style={{ color: "#6b6153" }}>Finished dose</span>
            </div>
            }
        </div>
      </div>
      <DelayedRiseCautionCard carbEntries={carbEntries} />
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
                  <p className="text-[11px]" style={{ color: "#746959" }}>{format(new Date(activeMarker.item.consumed_at), "h:mm a, MMM d")}</p>
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
            // Any positive remainder reads as at least "1u" — the estimate is
            // never rounded down to a confident-looking zero before the model's
            // own endpoint.
            return iob > 0 ?
            <p className="text-[11px]" style={{ color: "#5b6550" }}>{formatRemaining(iob)} estimated active</p> :
            <p className="text-[11px]" style={{ color: "#746959" }}>Estimate complete</p>;
          })()}
              <p className="text-[11px]" style={{ color: "#746959" }}>{format(new Date(activeMarker.item.administered_at), "h:mm a, MMM d")}</p>

            </div>
        }
          {activeMarker.type === "glucose" &&
        <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#746959" }}>Glucose</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black tabular-nums" style={{ color: "#d0c0aeff" }}>{formatGlucose(activeMarker.item.value)}</span>
                <span className="text-xs" style={{ color: "#6b6153" }}>{glucoseUnitLabel()}</span>
              </div>
              <p className="text-[11px]" style={{ color: "#746959" }}>{activeMarker.item.source === "dexcom" ? "CGM" : activeMarker.item.source === "system" ? "System" : "Manual"}, {format(new Date(activeMarker.item.recorded_at), "h:mm a, MMM d")}</p>

            </div>
        }

          {(onSelectLog || onDeleteLog) && !(activeMarker.type === "glucose" && (activeMarker.item.source === "dexcom" || glucoseReadOnly)) &&
        <div className="mt-4 flex gap-2">
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