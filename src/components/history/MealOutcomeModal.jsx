import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { format } from "date-fns";
import {
  ComposedChart,
  Line,
  Area,
  ReferenceArea,
  ReferenceLine,
  YAxis,
  XAxis,
  ResponsiveContainer,
} from "recharts";
import { getInsulinProfile, generateActivityCurve, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { GLUCOSE_STATUS_COLORS, readHighReference, FIXED_LOW_REFERENCE } from "@/lib/glucoseStatus";

const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;

function interpolateIOB(curve, atTime) {
  if (!curve?.length || !Number.isFinite(atTime)) return 0;
  if (atTime < curve[0].time || atTime > curve[curve.length - 1].time) return 0;
  for (let i = 0; i < curve.length - 1; i++) {
    if (curve[i].time <= atTime && curve[i + 1].time >= atTime) {
      const span = curve[i + 1].time - curve[i].time;
      const ratio = span > 0 ? (atTime - curve[i].time) / span : 0;
      return curve[i].activeUnits + (curve[i + 1].activeUnits - curve[i].activeUnits) * ratio;
    }
  }
  return 0;
}

function buildChartData(meal, glucose, insulin) {
  const mealTime = meal.time;
  const startTime = mealTime - 30 * MIN_MS;
  const endTime = mealTime + 3 * HOUR_MS;
  const stepMs = 5 * MIN_MS;

  const readings = (glucose || [])
    .map((g) => ({ time: new Date(g.recorded_at).getTime(), value: Number(g.value) }))
    .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value))
    .sort((a, b) => a.time - b.time);

  const associatedDoses = (insulin || []).filter((d) => {
    const dt = new Date(d.administered_at).getTime();
    return Number.isFinite(dt) && Math.abs(dt - mealTime) <= 30 * MIN_MS;
  });

  const curves = associatedDoses
    .map((d) => (isBasalInsulinType(d.insulin_type) ? null : generateActivityCurve(d)))
    .filter(Boolean);

  const data = [];
  for (let t = startTime; t <= endTime; t += stepMs) {
    let glucoseVal = null;
    let bestDist = Infinity;
    for (const r of readings) {
      const dist = Math.abs(r.time - t);
      if (dist <= 5 * MIN_MS && dist < bestDist) {
        bestDist = dist;
        glucoseVal = r.value;
      }
    }

    let iob = 0;
    for (const curve of curves) {
      iob += interpolateIOB(curve, t);
    }

    data.push({
      t: Math.round((t - mealTime) / MIN_MS),
      glucose: glucoseVal,
      iob: Math.round(iob * 100) / 100,
    });
  }

  return { data, doses: associatedDoses };
}

function xTickFormatter(v) {
  if (v === 0) return "Meal";
  const h = v / 60;
  if (h === 0) return "Meal";
  const sign = v < 0 ? "-" : "+";
  const abs = Math.abs(v);
  if (abs < 60) return `${sign}${abs}m`;
  const hours = abs / 60;
  return `${sign}${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
}

export default function MealOutcomeModal({ meal, glucose, insulin, targetLow, targetHigh, onClose }) {
  useEffect(() => {
    if (!meal) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [meal]);

  const { data, doses } = useMemo(
    () => (meal ? buildChartData(meal, glucose, insulin) : { data: [], doses: [] }),
    [meal, glucose, insulin]
  );

  const highRef = useMemo(() => readHighReference(), []);
  const glucoseTicks = useMemo(
    () => [FIXED_LOW_REFERENCE, targetLow, targetHigh, highRef],
    [targetLow, targetHigh, highRef]
  );

  const { yMin, yMax, maxIOB } = useMemo(() => {
    if (!data.length) return { yMin: FIXED_LOW_REFERENCE, yMax: highRef, maxIOB: 1 };
    const vals = data.map((d) => d.glucose).filter((v) => v != null);
    const iobs = data.map((d) => d.iob);
    return {
      yMin: FIXED_LOW_REFERENCE,
      yMax: Math.min(400, Math.max(highRef, ...(vals.length ? vals : [highRef]))),
      maxIOB: Math.max(1, ...iobs),
    };
  }, [data, targetLow, targetHigh, highRef]);

  const riseColor =
    meal?.rise > 60 ? "#d4a056" : meal?.rise < 0 ? "#5ba88a" : "rgba(255,255,255,0.85)";

  return (
    <AnimatePresence>
      {meal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center px-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/75 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.97 }}
            transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-3xl border p-5"
            style={{
              background: "linear-gradient(165deg, rgba(18,28,23,0.97), rgba(10,16,13,0.97))",
              borderColor: "rgba(255,255,255,0.16)",
              boxShadow: "0 24px 80px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.12)",
              backdropFilter: "blur(20px)",
            }}
          >
            {/* Header */}
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-white">{meal.name}</p>
                <p className="mt-0.5 text-[11px] text-white/40">
                  {format(new Date(meal.time), "h:mm a")} · {Math.round(meal.carbs)}g carbs
                  {meal.insulinUnits != null && ` · ${meal.insulinUnits}u support`}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-white/60 transition hover:text-white"
                style={{
                  background: "linear-gradient(145deg, rgba(255,255,255,0.06), rgba(255,255,255,0.02))",
                  borderColor: "rgba(255,255,255,0.14)",
                }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Chart */}
            {data.length > 0 ? (
              <div className="rounded-2xl border p-3" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                <p className="mb-1 px-1 text-[11px] font-semibold text-white/65">Glucose Response</p>
                <p className="mb-2 px-1 text-[9px] text-white/30">Your glucose journey from 30 min before to 3 hours after this meal</p>
                <ResponsiveContainer width="100%" height={200}>
                  <ComposedChart data={data} margin={{ top: 8, right: 14, left: 2, bottom: 4 }}>
                    <defs>
                      <linearGradient id="modalGlucoseGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d4a056" stopOpacity={0.95} />
                        <stop offset={`${((yMax - targetHigh) / (yMax - yMin)) * 100}%`} stopColor="#d4a056" stopOpacity={0.95} />
                        <stop offset={`${((yMax - targetHigh) / (yMax - yMin)) * 100}%`} stopColor="#ffffff" stopOpacity={0.9} />
                        <stop offset={`${((yMax - targetLow) / (yMax - yMin)) * 100}%`} stopColor="#ffffff" stopOpacity={0.9} />
                        <stop offset={`${((yMax - targetLow) / (yMax - yMin)) * 100}%`} stopColor={GLUCOSE_STATUS_COLORS.low} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={GLUCOSE_STATUS_COLORS.low} stopOpacity={0.9} />
                      </linearGradient>
                      <linearGradient id="modalIobGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#5ba3b8" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="#5ba3b8" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="t"
                      type="number"
                      domain={[-30, 180]}
                      ticks={[-30, 0, 60, 120, 180]}
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }}
                      tickFormatter={xTickFormatter}
                      axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                      tickLine={false}
                      dy={4}
                    />
                    <YAxis
                      yAxisId="glucose"
                      domain={[yMin, yMax]}
                      ticks={glucoseTicks}
                      tick={{ fontSize: 9, fill: "rgba(255,255,255,0.45)" }}
                      tickFormatter={(v) => Math.round(v)}
                      allowDecimals={false}
                      axisLine={false}
                      tickLine={false}
                      width={40}
                    />
                    <YAxis
                      yAxisId="iob"
                      orientation="right"
                      domain={[0, maxIOB * 1.3]}
                      tick={{ fontSize: 9, fill: "rgba(91,163,184,0.6)" }}
                      tickFormatter={(v) => (v % 1 === 0 ? String(v) : v.toFixed(1))}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <ReferenceArea yAxisId="glucose" y1={targetLow} y2={targetHigh} fill="#5ba88a" fillOpacity={0.06} />
                    <ReferenceLine yAxisId="glucose" y={targetHigh} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
                    <ReferenceLine yAxisId="glucose" y={targetLow} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 4" />
                    <ReferenceLine x={0} yAxisId="glucose" stroke="#f59e0b" strokeDasharray="2 3" strokeWidth={1} />
                    <Area
                      yAxisId="iob"
                      type="monotone"
                      dataKey="iob"
                      stroke="#5ba3b8"
                      strokeWidth={1.6}
                      fill="url(#modalIobGrad)"
                      isAnimationActive={false}
                    />
                    <Line
                      yAxisId="glucose"
                      type="monotone"
                      dataKey="glucose"
                      stroke="#ffffff"
                      strokeOpacity={0.9}
                      strokeWidth={2.2}
                      dot={false}
                      isAnimationActive={false}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#ffffff" }} />
                    <span className="text-[9px] text-white/40">Glucose (mg/dL)</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#5ba3b8" }} />
                    <span className="text-[9px] text-white/40">Insulin active</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#5ba88a" }} />
                    <span className="text-[9px] text-white/40">Comfort zone ({targetLow}–{targetHigh})</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: "#f59e0b" }} />
                    <span className="text-[9px] text-white/40">Meal time</span>
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex h-[120px] items-center justify-center rounded-2xl border" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                <p className="text-xs text-white/35">Not enough glucose data to chart this meal</p>
              </div>
            )}

            {/* Summary stats */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl border px-3 py-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                <p className="text-[9px] uppercase tracking-wider text-white/30">Before meal</p>
                <p className="mt-0.5 text-sm font-bold text-white/80">{Math.round(meal.startingGlucose)}</p>
                <p className="text-[8px] text-white/25">mg/dL</p>
              </div>
              <div className="rounded-xl border px-3 py-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                <p className="text-[9px] uppercase tracking-wider text-white/30">Peak</p>
                <p className="mt-0.5 text-sm font-bold" style={{ color: riseColor }}>{Math.round(meal.peakGlucose)}</p>
                <p className="text-[8px] text-white/25">mg/dL</p>
              </div>
              <div className="rounded-xl border px-3 py-2.5 text-center" style={{ background: "rgba(255,255,255,0.02)", borderColor: "rgba(255,255,255,0.08)" }}>
                <p className="text-[9px] uppercase tracking-wider text-white/30">Rise</p>
                <p className="mt-0.5 text-sm font-bold" style={{ color: riseColor }}>
                  {meal.rise > 0 ? "+" : ""}{Math.round(meal.rise)}
                </p>
                <p className="text-[8px] text-white/25">mg/dL</p>
              </div>
            </div>

            {/* Insulin details */}
            {doses.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Support logged near this meal</p>
                <div className="space-y-1.5">
                  {doses.map((d, i) => {
                    const profile = getInsulinProfile(d.insulin_type);
                    return (
                      <div key={i} className="flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: profile?.color || "#5ba3b8" }} />
                          <span className="text-white/55">{d.insulin_type}</span>
                        </span>
                        <span className="text-white/35">
                          {format(new Date(d.administered_at), "h:mm a")} · {Number(d.units).toFixed(1)}u
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}