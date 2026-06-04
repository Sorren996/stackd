import { useMemo, useRef, useEffect, useState } from "react";
import { Area, Line, ComposedChart, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { format } from "date-fns";

const TIME_RANGES = [
  { label: "1h", hours: 1, pxPerMin: 18 },
  { label: "3h", hours: 3, pxPerMin: 8 },
  { label: "12h", hours: 12, pxPerMin: 2.5 },
  { label: "24h", hours: 24, pxPerMin: null },
];

function getGlucoseColor(mgdl) {
  if (mgdl < 70) return "#cd9719ff";
  if (mgdl > 180) return "#b50f0dff";
  return "#2c9352ff";
}

const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 400;

function computeActivity(m, profile) {
  const onset = (profile.onsetMin + profile.onsetMax) / 2;
  const duration = (profile.durationMin + profile.durationMax) / 2;
  const hasPeak = profile.peakMin !== null;
  const peak = hasPeak ? (profile.peakMin + profile.peakMax) / 2 : duration / 2;

  if (m >= duration) return 0;
  if (m < onset) return 0.05 * (m / onset);
  if (m < peak) {
    const progress = (m - onset) / (peak - onset);
    return 0.05 + 0.95 * Math.sin((progress * Math.PI) / 2);
  }
  if (hasPeak) {
    const progress = (m - peak) / (duration - peak);
    return Math.cos((progress * Math.PI) / 2);
  }
  const flatEnd = duration * 0.75;
  if (m < flatEnd) return 0.85;
  const progress = (m - flatEnd) / (duration - flatEnd);
  return 0.85 * Math.cos((progress * Math.PI) / 2);
}

function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const insulinEntries = payload.filter((p) => p.dataKey?.startsWith("dose_") && p.value > 0);
  const glucoseEntry = payload.find((p) => p.dataKey === "glucose");
  const progressEntry = payload.find((p) => p.dataKey === "progress");

  return (
    <div className="rounded-xl px-3 py-2 shadow-xl" style={{ background: "rgba(20,30,25,0.92)", border: "1px solid rgba(255,255,255,0.08)" }}>
      {progressEntry != null && insulinEntries.length > 0 && (
        <p className="text-[10px] text-white/40 mb-1">{Math.round(progressEntry.value)}% absorbed</p>
      )}
      {glucoseEntry && glucoseEntry.value != null && (() => {
        const mgdl = glucoseEntry.value;
        const color = getGlucoseColor(mgdl);
        return (
          <div className="flex items-center gap-2 text-xs mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-white/80">Glucose</span>
            <span className="ml-auto pl-3 font-medium" style={{ color }}>{mgdl} mg/dL</span>
          </div>
        );
      })()}
      {insulinEntries.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-white/80">{p.name}</span>
          <span className="text-white/40 ml-auto pl-3">{p.value.toFixed(1)}u</span>
        </div>
      ))}
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

  const doseKeys = useMemo(() =>
    doses.map((dose) => ({
      key: `dose_${dose.id}`,
      label: dose.insulin_type.split(" ")[0],
      units: dose.units,
      color: INSULIN_PROFILES[dose.insulin_type]?.color || "#888",
    })),
    [doses]
  );

  // Build chart data: 101 points from progress=0..100 for insulin curves
  // plus glucose readings mapped to their chronological time (stored as `glucoseTime`)
  const chartData = useMemo(() => {
    const insulinPoints = [];
    for (let p = 0; p <= 100; p++) {
      const point = { progress: p };
      doses.forEach((dose) => {
        const profile = INSULIN_PROFILES[dose.insulin_type];
        if (!profile) return;
        const duration = (profile.durationMin + profile.durationMax) / 2;
        const m = (p / 100) * duration;
        const activity = computeActivity(m, profile);
        point[`dose_${dose.id}`] = Math.round(Math.max(0, activity) * dose.units * 100) / 100;
      });
      insulinPoints.push(point);
    }

    // Glucose readings need a separate dataset — we overlay them using a second XAxis keyed to time
    const glucosePoints = glucoseReadings.map((g) => ({
      glucoseTime: new Date(g.recorded_at).getTime(),
      glucose: g.value,
    }));

    // Merge by index — recharts ComposedChart allows different dataKeys on different series
    // We combine into one array where insulin points dominate (101 pts) and glucose points are appended
    return [...insulinPoints, ...glucosePoints];
  }, [doses, glucoseReadings]);

  const is24h = selectedRange.pxPerMin === null;
  const viewMinutes = selectedRange.hours * 60 * 1.1;
  const chartWidth = is24h ? containerWidth : Math.round(viewMinutes * selectedRange.pxPerMin);

  useEffect(() => {
    if (!scrollRef.current || is24h) return;
    const totalViewMs = viewEnd - viewStart;
    const nowOffset = ((snappedNow - viewStart) / totalViewMs) * chartWidth;
    const halfContainer = scrollRef.current.clientWidth / 2;
    scrollRef.current.scrollLeft = nowOffset - halfContainer;
  }, [rangeIdx, doses]);

  if (!doses.length && !glucoseReadings.length) return null;

  const tickCount = Math.max(2, Math.floor(chartWidth / 90));

  return (
    <div ref={containerRef} className="-mx-4 overflow-hidden">
      {/* Range selector */}
      <div className="flex items-center mb-10 justify-center">
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

            {/* Insulin X-axis: 0–100 progress */}
            <XAxis
              xAxisId="progress"
              dataKey="progress"
              type="number"
              domain={[0, 100]}
              tickFormatter={(v) => `${v}%`}
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.25)" }}
              axisLine={false}
              tickLine={false}
              tickCount={6}
            />

            {/* Glucose X-axis: chronological time — hidden, used only for positioning */}
            <XAxis
              xAxisId="glucoseTime"
              dataKey="glucoseTime"
              type="number"
              domain={is24h ? [domainStart, domainEnd] : [viewStart, viewEnd]}
              tickFormatter={(t) => format(new Date(t), "h:mma")}
              tick={{ fontSize: 10, fill: "rgba(255,255,255,0.15)" }}
              axisLine={false}
              tickLine={false}
              tickCount={tickCount}
              hide
            />

            {/* Insulin Y-axis: scaled by units */}
            <YAxis yAxisId="insulin" domain={[0, "auto"]} hide />

            {/* Glucose Y-axis: mg/dL range */}
            <YAxis yAxisId="glucose" domain={[GLUCOSE_MIN, GLUCOSE_MAX]} hide />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "rgba(255,255,255,0.1)", strokeWidth: 1 }} />

            {/* "Now" reference line on the progress axis at 0 (left edge) */}
            <ReferenceLine
              xAxisId="progress"
              yAxisId="insulin"
              x={0}
              stroke="transparent"
            />

            {/* Insulin curves on progress axis */}
            {doseKeys.map((k) => (
              <Area
                key={k.key}
                xAxisId="progress"
                yAxisId="insulin"
                type="monotoneX"
                dataKey={k.key}
                name={k.label}
                stroke={k.color}
                strokeWidth={2.5}
                fill={`url(#grad_${k.key})`}
                dot={false}
                connectNulls
                isAnimationActive={false}
              />
            ))}

            {/* Glucose scatter on chronological time axis */}
            {glucoseReadings.length > 0 && (
              <Line
                xAxisId="glucoseTime"
                yAxisId="glucose"
                type="monotoneX"
                dataKey="glucose"
                name="Glucose"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth={1.5}
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.glucose == null) return <g key={`dot-${payload.glucoseTime}`} />;
                  const color = getGlucoseColor(payload.glucose);
                  return (
                    <circle
                      key={`dot-${payload.glucoseTime}`}
                      cx={cx} cy={cy} r={3.5}
                      fill={color}
                      stroke="rgba(0,0,0,0.4)"
                      strokeWidth={1}
                      style={{ filter: `drop-shadow(0 0 3px ${color}99)` }}
                    />
                  );
                }}
                activeDot={{ r: 5, stroke: "rgba(0,0,0,0.4)", strokeWidth: 1 }}
                connectNulls
                isAnimationActive={false}
              />
            )}
          </ComposedChart>
        </div>
      </div>
    </div>
  );
}