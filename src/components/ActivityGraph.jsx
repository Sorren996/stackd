import { useMemo, useRef, useEffect, useState } from "react";
import {
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  Line,
  ComposedChart,
} from "recharts";
import { generateActivityCurve, INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import { generateCarbCurve, PROFILE_COLORS } from "@/lib/carbAbsorption";
import { format } from "date-fns";
import { SlidersHorizontal, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

/* =========================
   CONFIG
========================= */

const GLUCOSE_MIN = 40;
const GLUCOSE_MAX = 400;

/* =========================
   TOOLTIP
========================= */

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const glucose = payload.find((p) => p.dataKey === "glucose");

  const insulin = payload.filter(
    (p) => p.dataKey?.startsWith("dose_")
  );

  const carbs = payload.filter(
    (p) => p.dataKey?.startsWith("carb_")
  );

  return (
    <div className="rounded-xl px-3 py-2 shadow-xl bg-black/80 border border-white/10">
      <p className="text-xs text-white/40 mb-1">
        {format(new Date(label), "h:mm a")}
      </p>

      {glucose && (
        <div className="text-sm text-white mb-1">
          Glucose: {Math.round(glucose.value)} mg/dL
        </div>
      )}

      {insulin.map((p) => (
        <div key={p.dataKey} className="text-sm text-white/70">
          {p.name}: {p.value?.toFixed(1)}u
        </div>
      ))}

      {carbs.map((p) => (
        <div key={p.dataKey} className="text-sm text-white/70">
          {p.payload?.[`${p.dataKey}_food`]}:{" "}
          {p.payload?.[`${p.dataKey}_carbs`]}g
        </div>
      ))}
    </div>
  );
}

/* =========================
   MAIN COMPONENT
========================= */

export default function ActivityGraph({
  doses,
  glucoseReadings = [],
  carbEntries = [],
}) {
  const containerRef = useRef(null);
  const scrollRef = useRef(null);

  const [containerWidth, setContainerWidth] = useState(600);
  const [filters] = useState({
    glucose: true,
    insulin: true,
    carbs: true,
  });

  /* =========================
     RESIZE OBSERVER
  ========================= */

  useEffect(() => {
    if (!containerRef.current) return;

    const ro = new ResizeObserver(([e]) => {
      setContainerWidth(e.contentRect.width);
    });

    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* =========================
     CURVES
  ========================= */

  const allCarbCurvesMeta = useMemo(
    () =>
      carbEntries
        .filter((e) => !e.is_custom)
        .map((entry) => ({
          entry,
          curve: generateCarbCurve(entry),
          color:
            PROFILE_COLORS?.[entry.absorption_profile] ||
            "#f59e0b",
        })),
    [carbEntries]
  );

  const maxCarbs = useMemo(
    () =>
      Math.max(
        ...carbEntries
          .filter((e) => !e.is_custom)
          .map((e) => e.carbs),
        1
      ),
    [carbEntries]
  );

  const chartData = useMemo(() => {
    const step = 5 * 60000;
    const now = Date.now();

    const start = now - 6 * 60 * 60 * 1000;
    const end = now + 1 * 60 * 60 * 1000;

    const result = [];

    for (let t = start; t <= end; t += step) {
      const point = {
        time: t,
        bg: GLUCOSE_MAX,
      };

      allCarbCurvesMeta.forEach(({ entry, curve }) => {
        const key = `carb_${entry.id}`;

        if (!curve.length) return;

        const first = curve[0].time;
        const last = curve[curve.length - 1].time;

        if (t < first || t > last) {
          point[key] = null;
          return;
        }

        let i = 0;
        while (
          i < curve.length - 1 &&
          curve[i + 1].time < t
        ) {
          i++;
        }

        const a = curve[i];
        const b = curve[i + 1] || a;

        const ratio =
          b.time === a.time
            ? 0
            : (t - a.time) / (b.time - a.time);

        const activity =
          a.activity +
          (b.activity - a.activity) * ratio;

        /* 🔥 KEY CHANGE: NO HEAVY NORMALIZATION */
        point[key] = activity * entry.carbs;
      });

      result.push(point);
    }

    return result;
  }, [allCarbCurvesMeta]);

  /* =========================
     RENDER
========================= */

  return (
    <div ref={containerRef} className="w-full overflow-hidden">
      <div
        ref={scrollRef}
        className="overflow-x-auto"
      >
        <div style={{ width: containerWidth, height: 260 }}>
          <ComposedChart data={chartData} width={containerWidth} height={260}>
            <XAxis
              dataKey="time"
              type="number"
              tickFormatter={(t) => format(new Date(t), "h:mm a")}
              tick={{ fontSize: 10, fill: "#aaa" }}
              axisLine={false}
              tickLine={false}
            />

            <YAxis hide />

            <Tooltip content={<CustomTooltip />} />

            {/* CARB CURVES */}
            {allCarbCurvesMeta.map(({ entry }) => (
              <Area
                key={entry.id}
                type="linear"   /* 🔥 IMPORTANT FIX */
                dataKey={`carb_${entry.id}`}
                stroke="#f59e0b"
                fill="#f59e0b22"
                strokeWidth={2}
                dot={false}
              />
            ))}

            {/* GLUCOSE */}
            {glucoseReadings.length > 0 && (
              <Line
                type="linear"
                dataKey="glucose"
                stroke="white"
                strokeWidth={1.5}
                dot={false}
              />
            )}
          </ComposedChart>
        </div>
      </div>
    </div>
  );
}