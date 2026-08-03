import { useMemo, useRef, useEffect, useState } from "react";
import { Area, XAxis, YAxis, Line, ComposedChart } from "recharts";
import { generateActivityCurve, getDoseIOB, getInsulinProfile } from "@/lib/insulinPharmacology";
import { PROFILE_COLORS } from "@/lib/carbAbsorption";
import { format } from "date-fns";
import { AlertTriangle, CornerUpRight, SlidersHorizontal, Check, Wheat, Pencil } from "lucide-react";
import { HIGH_PROTEIN_FAT_MONITORING_HOURS, mergeMonitoringIntervals } from "@/lib/mealMonitoring";
import { motion, AnimatePresence } from "framer-motion";
import InfoPopover from "@/components/graph/InfoPopover";

const STEP_MS = 3 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
const HISTORY_DAYS = 7;
const FUTURE_HOURS = 3;
const VISIBLE_HOURS = 6;
const CHART_HEIGHT = 260;
const CHART_MARGIN_TOP = 70;
const CHART_MARGIN_BOTTOM = 0;
const X_AXIS_HEIGHT = 30;
const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 250;
const CARB_PROFILE_COLORS = {
  fast: "#fb923c",
  medium: "#f59e0b",
  slow: "#22c55e",
  delayed: "#a78bfa",
};

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };

  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);

  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180,
  };
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

function buildMonotoneSegments(points, getValue) {
  if (!Array.isArray(points) || points.length < 2) return [];

  const sorted = points
    .map((point) => ({ x: Number(point.time), y: Number(getValue(point)) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .sort((a, b) => a.x - b.x);

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
    m1: slopes[index + 1],
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
    (t3 - t2) * width * segment.m1
  );
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

export default function ActivityGraph({ doses, glucoseReadings = [], carbEntries = [], onSelectLog = null }) {
  const [showFilter, setShowFilter] = useState(false);
  const [filterAnchorRect, setFilterAnchorRect] = useState(null);
  const [filters, setFilters] = useState({ glucose: true, insulin: true, carbs: true });
  const [activeMarker, setActiveMarker] = useState(null);

  const openMarker = (type, item, rect) => setActiveMarker({ type, item, rect });
  const closeMarker = () => setActiveMarker(null);
  const handleEdit = () => {
    if (!activeMarker || !onSelectLog) return;
    onSelectLog({ type: activeMarker.type, item: activeMarker.item });
    closeMarker();
  };
  const scrollRef = useRef(null);
  const centerMarkerRef = useRef(null);
  const tooltipValueRef = useRef(null);
  const tooltipTimeRef = useRef(null);
  const tooltipDateRef = useRef(null);
  const scrollFrameRef = useRef(null);
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

  useEffect(() => {
    const updateTargetRange = () => setTargetRange(readTargetRange());

    window.addEventListener("target-range-updated", updateTargetRange);
    window.addEventListener("storage", updateTargetRange);

    return () => {
      window.removeEventListener("target-range-updated", updateTargetRange);
      window.removeEventListener("storage", updateTargetRange);
    };
  }, []);

  const toggleFilter = (key) => setFilters((f) => ({ ...f, [key]: !f[key] }));

  const targetLow = targetRange.low;
  const targetHigh = targetRange.high;

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
    plotValue: buildMonotoneSegments(glucoseLinePoints, (point) => Math.min(point.value, GLUCOSE_MAX)),
  }), [glucoseLinePoints]);

  const maxDoseUnits = useMemo(() => Math.max(...filteredDoses.map(getDoseUnits), 1), [filteredDoses]);
  const chartData = useMemo(() => {
    if (!doses.length && !glucoseReadings.length && !carbEntries.length) return [];
    const result = [];
    for (let t = domainStart; t <= domainEnd; t += STEP_MS) {
      const point = { time: t, bg: GLUCOSE_MAX };
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
          point[key] = activity * (doseUnits / maxDoseUnits) * 70;
          point[`${key}_actual`] = activeUnits;
          point[`${key}_activity`] = activity;
          point[`${key}_total`] = doseUnits;
        }
      });
      if (glucoseMap[t] !== undefined) {
        point.glucose = Math.min(glucoseMap[t], GLUCOSE_MAX);
      }
      result.push(point);
    }
    return result;
  }, [doses, glucoseReadings, carbEntries, filters, domainStart, domainEnd, allCurvesMeta, glucoseMap]);

  const doseKeys = useMemo(() =>
  filteredDoses.map((dose, index) => ({
    key: getDoseKey(dose, index),
    label: String(dose.insulin_type || "Insulin").split(" ")[0],
    units: getDoseUnits(dose),
    color: getInsulinProfile(dose.insulin_type)?.color || "#888"
  })),
  [filteredDoses]
  );

  const totalMs = domainEnd - domainStart;
  const visibleMs = VISIBLE_HOURS * 60 * 60 * 1000;
  const pxPerMin = containerWidth / (visibleMs / 60000);
  const chartWidth = Math.max(containerWidth, Math.round(totalMs / 60000 * pxPerMin));
  const latestGlucoseX = (latestGlucoseBucket - domainStart) / totalMs * chartWidth;
  const maxScrollLeft = Math.max(0, Math.min(chartWidth - containerWidth, latestGlucoseX - containerWidth / 2));
  const plotHeight = CHART_HEIGHT - CHART_MARGIN_TOP - CHART_MARGIN_BOTTOM - X_AXIS_HEIGHT;

  const mergedMonitoringIntervals = useMemo(() => {
    const MS = HIGH_PROTEIN_FAT_MONITORING_HOURS * 60 * 60 * 1000;
    const intervals = (Array.isArray(carbEntries) ? carbEntries : [])
      .filter((e) => e.is_high_protein_fat_meal === true && e.consumed_at)
      .map((e) => { const s = new Date(e.consumed_at).getTime(); return Number.isFinite(s) ? { start: s, end: s + MS } : null; })
      .filter(Boolean);
    return mergeMonitoringIntervals(intervals);
  }, [carbEntries]);

  const monitoringBandTop = CHART_MARGIN_TOP;
  const monitoringBandHeight = plotHeight;

  const positionedMonitoringIntervals = useMemo(() => {
    return mergedMonitoringIntervals
      .map((iv) => {
        const startX = ((iv.start - domainStart) / totalMs) * chartWidth;
        const endX = ((iv.end - domainStart) / totalMs) * chartWidth;
        return { start: iv.start, end: iv.end, x: startX, width: Math.max(2, endX - startX) };
      })
      .filter((iv) => iv.width > 0 && iv.x + iv.width > 0 && iv.x < chartWidth);
  }, [mergedMonitoringIntervals, domainStart, totalMs, chartWidth]);

  const positionedCarbMarkers = useMemo(() => {
    const laneLastX = [];
    const laneCount = 3;
    const minMarkerGap = 86;

    return carbEventMarkers
      .slice()
      .sort((a, b) => a.time - b.time)
      .map((marker) => {
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
    const minHorizontalGap = 30;
    const labelHeight = 12;
    const minVerticalGap = 2;

    return filteredDoses
      .slice()
      .sort((a, b) => {
        const aTime = new Date(a.administered_at || a.created_at || a.created_date).getTime();
        const bTime = new Date(b.administered_at || b.created_at || b.created_date).getTime();
        return aTime - bTime;
      })
      .map((dose, index) => {
        const time = new Date(dose.administered_at || dose.created_at || dose.created_date).getTime();
        if (!Number.isFinite(time) || time < domainStart || time > domainEnd) return null;
        const units = getDoseUnits(dose);
        if (!Number.isFinite(units) || units <= 0) return null;
        const x = (time - domainStart) / totalMs * chartWidth;

        const key = getDoseKey(dose, index);
        let peakVal = 0;
        let peakX = x;
        for (const point of chartData) {
          const v = point[key];
          if (Number.isFinite(v) && v > peakVal) {
            peakVal = v;
            peakX = (point.time - domainStart) / totalMs * chartWidth;
          }
        }
        const peakY = CHART_MARGIN_TOP + plotHeight * (1 - Math.min(peakVal, 75) / 75);

        let labelTop = Math.max(2, peakY - 16);

        for (const p of placed) {
          const horizontalOverlap = Math.abs(peakX - p.x) < minHorizontalGap;
          const verticalOverlap =
            labelTop < p.labelTop + p.labelHeight + minVerticalGap &&
            labelTop + labelHeight + minVerticalGap > p.labelTop;
          if (horizontalOverlap && verticalOverlap) {
            labelTop = Math.max(2, p.labelTop - labelHeight - minVerticalGap);
          }
        }

        placed.push({ x: peakX, labelTop, labelHeight });
        return { dose, x: peakX, units, key, peakY, labelTop };
      })
      .filter(Boolean);
  }, [filteredDoses, domainStart, domainEnd, totalMs, chartWidth, chartData, plotHeight]);

  const getGlucoseY = (value) => {
    const clamped = Math.min(Math.max(value, GLUCOSE_MIN), GLUCOSE_MAX);
    return CHART_MARGIN_TOP + (GLUCOSE_MAX - clamped) / (GLUCOSE_MAX - GLUCOSE_MIN) * plotHeight;
  };

  const positionedGlucoseMarkers = useMemo(() =>
    filteredGlucoseReadings
      .map((reading) => ({
        reading,
        x: (reading.time - domainStart) / totalMs * chartWidth,
        y: getGlucoseY(reading.value),
      }))
      .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y) && m.x >= 0 && m.x <= chartWidth),
    [filteredGlucoseReadings, domainStart, totalMs, chartWidth]
  );

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

      const segmentIndex = i - 1;
      const value = interpolateMonotoneSegment(glucoseCurveSegments.value[segmentIndex], time) ?? previous.value;
      const plotValue = interpolateMonotoneSegment(glucoseCurveSegments.plotValue[segmentIndex], time) ?? Math.min(previous.value, GLUCOSE_MAX);
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
    if (!glucose || !Number.isFinite(glucose.time)) {
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

  const updateMonitoringOverlay = (scrollLeft) => {
    const centerTime = getCenterTimeForScroll(scrollLeft);
    const viewportCenterX = scrollLeft + containerWidth / 2;
    const viewportLeft = scrollLeft;
    const viewportRight = scrollLeft + containerWidth;
    const anyActive = mergedMonitoringIntervals.some((i) => centerTime >= i.start && centerTime < i.end);

    monitoringBandRefs.current.forEach((el, idx) => {
      if (!el) return;
      const iv = positionedMonitoringIntervals[idx];
      if (!iv) { el.style.opacity = "0"; return; }
      const bandCenterX = iv.x + iv.width / 2;
      const inView = iv.x + iv.width > viewportLeft && iv.x < viewportRight;
      if (!inView) { el.style.opacity = "0"; return; }
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

  const scrollToLatestGlucose = () => {
    if (!scrollRef.current) return;

    scrollRef.current.scrollTo({ left: maxScrollLeft, behavior: "smooth" });
    scheduleCenterGlucoseUpdate(maxScrollLeft);
  };

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollLeft = maxScrollLeft;
    drawCenterGlucose(maxScrollLeft);
    updateMonitoringOverlay(maxScrollLeft);

    return () => {
      if (scrollFrameRef.current) cancelAnimationFrame(scrollFrameRef.current);
    };
  }, [maxScrollLeft, latestGlucoseBucket, filters.glucose, glucoseLinePoints.length, positionedMonitoringIntervals]);

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
        className="absolute right-0 top-0 z-30 flex backdrop-blur-sm h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/[0.06] text-white/55 shadow-lg transition-colors hover:bg-white/[0.1] hover:text-white/85"
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
      {/* monitoring gradient bands live inside the scrollable chart below */}
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
        <div className="relative" style={{ width: chartWidth, height: CHART_HEIGHT }}>
          {positionedMonitoringIntervals.map((iv, idx) => (
            <div
              key={`monitoring_band_${idx}`}
              ref={(el) => (monitoringBandRefs.current[idx] = el)}
              className="pointer-events-none absolute z-[2]"
              style={{
                left: iv.x,
                top: monitoringBandTop,
                width: iv.width,
                height: monitoringBandHeight,
                opacity: 0,
                transition: "opacity 1000ms ease-in-out",
                borderRadius: 4,
                willChange: "opacity",
              }}
              aria-hidden="true"
            />
          ))}
          <ComposedChart
            width={chartWidth}
            height={CHART_HEIGHT}
            data={chartData}
            margin={{ top: CHART_MARGIN_TOP, right: 0, left: -20, bottom: CHART_MARGIN_BOTTOM }}>
            <defs>
              {doseKeys.map((k) =>
              <linearGradient key={`insulin_fill_${k.key}`} id={`insulin_fill_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={k.color} stopOpacity={1} />
                  <stop offset="52%" stopColor={k.color} stopOpacity={0.96} />
                  <stop offset="100%" stopColor={k.color} stopOpacity={0.88} />
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
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0} />
                <stop offset="10%" stopColor="#ef4444" stopOpacity={0.18} />
                <stop offset="24%" stopColor="#ef4444" stopOpacity={0.72} />
                <stop offset={`${Math.max(24, Number(highPct) - 3)}%`} stopColor="#ef4444" stopOpacity={0.72} />
                <stop offset={`${Math.min(100, Number(highPct) + 3)}%`} stopColor="#ffffff" stopOpacity={0.72} />
                <stop offset={`${Math.max(0, Number(lowPct) - 3)}%`} stopColor="#ffffff" stopOpacity={0.72} />
                <stop offset={`${Math.min(100, Number(lowPct) + 3)}%`} stopColor="#fbbf24" stopOpacity={0.72} />
                <stop offset="100%" stopColor="#fbbf24" stopOpacity={0.72} />
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
              fill={`url(#insulin_fill_${k.key})`}
              fillOpacity={0.6}
              dot={false}
              activeDot={false}
              isAnimationActive={false} />

            )}

            {filters.glucose && filteredGlucoseReadings.length > 0 &&
            <Line
              yAxisId="glucose"
              type="monotoneX"
              dataKey="glucose"
              name="Glucose"
              stroke="url(#glucose_line_grad)"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={false}
              activeDot={false}
              connectNulls={true}
              isAnimationActive={false} />

            }

          </ComposedChart>

          {filters.insulin && positionedDoseMarkers.map(({ dose, x, units, key, labelTop }) => {
            const isEdgeLeft = x < 24;
            const isEdgeRight = x > chartWidth - 24;
            const formattedUnits = units % 1 === 0 ? String(units) : units.toFixed(1);

            return (
              <div
                key={`dose_label_${key}`}
                className="pointer-events-none absolute top-0 z-[5]"
                style={{
                  left: x,
                  transform: isEdgeLeft ? "translateX(0)" : isEdgeRight ? "translateX(-100%)" : "translateX(-50%)"
                }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openMarker("insulin", dose, e.currentTarget.getBoundingClientRect()); }}
                  aria-label={`${formattedUnits} units ${String(dose.insulin_type || "Insulin").split(" ")[0]}`}
                  className="pointer-events-auto relative flex cursor-pointer items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none transition hover:brightness-110"
                  style={{
                    top: labelTop,
                    color: "rgba(91,168,138,0.9)",
                    background: "linear-gradient(145deg, rgba(14,24,21,0.72), rgba(14,24,21,0.42))",
                    border: "1px solid rgba(91,168,138,0.16)",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.22)"
                  }}
                >
                  <span>{formattedUnits}u</span>
                </button>
              </div>
            );
          })}

          {filters.carbs && positionedCarbMarkers.map(({ entry, color, x, lane }) => {
            const isEdgeLeft = x < 58;
            const isEdgeRight = x > chartWidth - 58;
            const pillTop = CHART_MARGIN_TOP + 8 + lane * 26;

            return (
              <div
                key={`carb_marker_${entry.id}`}
                className="pointer-events-none absolute top-0 z-[12]"
                style={{
                  left: x,
                  height: CHART_HEIGHT - X_AXIS_HEIGHT,
                  transform: isEdgeLeft ? "translateX(0)" : isEdgeRight ? "translateX(-100%)" : "translateX(-50%)"
                }}>
                <div
                  className="absolute left-1/2 w-px -translate-x-1/2"
                  style={{
                    top: pillTop + 18,
                    height: Math.max(24, CHART_MARGIN_TOP + plotHeight - pillTop - 18),
                    background: `linear-gradient(to bottom, ${color}cc, ${color}33 62%, transparent)`,
                    boxShadow: `0 0 12px ${color}26`
                  }} />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); openMarker("carbs", entry, e.currentTarget.getBoundingClientRect()); }}
                  aria-label={`Carbs ${Math.round(entry.carbs)}g`}
                  className="pointer-events-auto relative flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold leading-none shadow-lg backdrop-blur-md transition hover:brightness-110"
                  style={{
                    top: pillTop,
                    color,
                    borderColor: `${color}45`,
                    background: `linear-gradient(145deg, rgba(14,24,21,0.92), rgba(14,24,21,0.62)), ${color}12`,
                    boxShadow: "0 10px 24px rgba(0,0,0,0.32), inset 0 1px 0 rgba(255,255,255,0.08)"
                  }}
                >
                  <Wheat className="h-3 w-3" />
                  <span className="text-white/55">Carbs</span>
                  <span className="text-white/90">{Math.round(entry.carbs)}g</span>
                </button>
              </div>
            );
          })}

          {filters.glucose && positionedGlucoseMarkers.map(({ reading, x, y }) => {
            const dotOpacity = getHighRangeOpacity(reading.value);
            return (
              <button
                key={`glucose_marker_${reading.id}`}
                type="button"
                onClick={(e) => { e.stopPropagation(); openMarker("glucose", reading, e.currentTarget.getBoundingClientRect()); }}
                aria-label={`Glucose ${reading.value} mg/dL`}
                className="pointer-events-auto absolute z-[15] flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full"
                style={{ left: x, top: y }}
              >
                <span
                  className="block h-[7px] w-[7px] rounded-full"
                  style={{
                    backgroundColor: `rgba(255,255,255,${0.82 * dotOpacity})`,
                    boxShadow: `0 0 0 2px rgba(255,255,255,${0.14 * dotOpacity}), 0 0 5px rgba(255,255,255,${0.2 * dotOpacity})`,
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>
      </div>
      <div
        ref={monitoringLabelRef}
        className="pointer-events-none mt-1 flex items-center justify-center gap-1.5"
        style={{ opacity: 0, transform: "translateY(4px)", transition: "opacity 350ms ease-in-out, transform 350ms ease-in-out", minHeight: 16 }}
        aria-hidden="true"
      >
        <AlertTriangle className="h-3 w-3" style={{ color: "rgba(217,169,56,0.7)" }} />
        <span className="text-[9px] font-medium" style={{ color: "rgba(217,169,56,0.8)" }}>Delayed glucose response. Monitor for extended high's and low's.</span>
      </div>
      </div>

      {activeMarker && (
        <InfoPopover anchorRect={activeMarker.rect} onClose={closeMarker}>
          {activeMarker.type === "carbs" && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Nourishment</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white">{Math.round(activeMarker.item.carbs)}</span>
                <span className="text-xs text-white/40">g carbs</span>
              </div>
              <p className="text-xs text-white/70">{activeMarker.item.food_name || activeMarker.item.name || "Food"}</p>
              <p className="text-[11px] text-white/40">{format(new Date(activeMarker.item.consumed_at), "h:mm a · MMM d")}</p>
              {onSelectLog && (
                <button type="button" onClick={handleEdit} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/5" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
            </div>
          )}
          {activeMarker.type === "insulin" && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Insulin</span>
              <p className="text-sm font-bold text-white">{activeMarker.item.insulin_type}</p>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-white">{activeMarker.item.units % 1 === 0 ? activeMarker.item.units : activeMarker.item.units.toFixed(1)}</span>
                <span className="text-xs text-white/40">units</span>
              </div>
              {(() => {
                const iob = getDoseIOB(activeMarker.item, Date.now());
                return iob > 0.01
                  ? <p className="text-[11px] text-teal-300/80">{Math.round(iob)}u estimated active</p>
                  : <p className="text-[11px] text-white/40">Support complete</p>;
              })()}
              <p className="text-[11px] text-white/40">{format(new Date(activeMarker.item.administered_at), "h:mm a · MMM d")}</p>
              {onSelectLog && (
                <button type="button" onClick={handleEdit} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/5" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
            </div>
          )}
          {activeMarker.type === "glucose" && (
            <div className="space-y-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Glucose</span>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white">{activeMarker.item.value}</span>
                <span className="text-xs text-white/40">mg/dL</span>
              </div>
              <p className="text-[11px] text-white/40">Manual · {format(new Date(activeMarker.item.recorded_at), "h:mm a · MMM d")}</p>
              {onSelectLog && (
                <button type="button" onClick={handleEdit} className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/12 py-2 text-xs font-semibold text-white/85 transition hover:bg-white/5" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <Pencil className="h-3 w-3" /> Edit
                </button>
              )}
            </div>
          )}
        </InfoPopover>
      )}
    </div>);

}