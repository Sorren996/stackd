import { ComposedChart, Area, Line, XAxis, YAxis } from "recharts";
import { format } from "date-fns";
import { Wheat, ArrowUp } from "lucide-react";
import { motion } from "framer-motion";

const TOTAL_CURVE_COLOR = "#7ac8de";

function TimeAxisTick({ x, y, payload }) {
  const date = new Date(payload.value);
  const minute = date.getMinutes();
  if (minute === 30) {
    return <circle cx={x} cy={y + 6} r={1} fill="rgba(255,255,255,0.12)" />;
  }
  if (minute === 0) {
    return (
      <text x={x} y={y + 11} textAnchor="middle" fill="rgba(255,255,255,0.22)" fontSize={9} fontWeight={500}>
        {format(date, "h a")}
      </text>
    );
  }
  return null;
}

// Two-lane lower section for the Activity Graph:
//   Lane 1 (Carbs)  — compact amber pills anchored to real timestamps
//   Lane 2 (Insulin) — individual dose curves + combined Total Active Insulin
//                      curve, with dose pills at the top anchored to dose time
//                      (not peak time). Tapping a pill highlights its curve.
// The timeline (X-axis) lives at the bottom of the insulin lane, shared by all
// lanes and the glucose chart above.
export default function GraphLowerSection({
  chartData,
  doseKeys,
  positionedCarbMarkers,
  positionedDoseMarkers,
  positionedSpikeMarkers,
  domainStart,
  domainEnd,
  chartWidth,
  timeTicks,
  glucoseChartHeight,
  carbLaneHeight,
  insulinChartHeight,
  insulinMarginTop,
  xAxisHeight,
  selectedDoseKey,
  onDoseTap,
  onCarbTap,
  onSpikeTag,
  showInsulin,
  showCarbs,
}) {
  const insulinLaneTop = glucoseChartHeight + carbLaneHeight;
  const hasCurves = showInsulin && doseKeys.length > 0;

  const renderDoseArea = (k) => {
    const isSelected = selectedDoseKey === k.key;
    const isDimmed = selectedDoseKey && !isSelected;
    return (
      <Area
        key={k.key}
        yAxisId="insulin"
        type="basis"
        dataKey={k.key}
        name={k.label}
        stroke={k.color}
        strokeWidth={isSelected ? 1.5 : 1}
        strokeOpacity={isDimmed ? 0.1 : isSelected ? 0.65 : 0.32}
        fill={`url(#insulin_fill_${k.key})`}
        fillOpacity={isDimmed ? 0.03 : isSelected ? 0.28 : 0.14}
        dot={false}
        activeDot={false}
        isAnimationActive={false}
      />
    );
  };

  return (
    <>
      {/* Divider between glucose and carb lane */}
      <div
        className="pointer-events-none absolute left-0 right-0 z-[1]"
        style={{ top: glucoseChartHeight - 1, height: 1, background: "rgba(255,255,255,0.04)" }}
      />
      {/* Divider between carb and insulin lane */}
      <div
        className="pointer-events-none absolute left-0 right-0 z-[1]"
        style={{ top: insulinLaneTop - 1, height: 1, background: "rgba(255,255,255,0.04)" }}
      />

      {/* Insulin Activity ComposedChart */}
      <div style={{ position: "absolute", top: insulinLaneTop, left: 0 }}>
        <ComposedChart
          width={chartWidth}
          height={insulinChartHeight}
          data={chartData}
          margin={{ top: insulinMarginTop, right: 0, left: -20, bottom: 0 }}
        >
          <defs>
            {doseKeys.map((k) => (
              <linearGradient key={`insulin_fill_${k.key}`} id={`insulin_fill_${k.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={k.color} stopOpacity={0.7} />
                <stop offset="100%" stopColor={k.color} stopOpacity={0.12} />
              </linearGradient>
            ))}
            <linearGradient id="total_insulin_fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={TOTAL_CURVE_COLOR} stopOpacity={0.16} />
              <stop offset="100%" stopColor={TOTAL_CURVE_COLOR} stopOpacity={0} />
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
            height={xAxisHeight}
            interval={0}
          />
          <YAxis yAxisId="insulin" domain={[0, 75]} hide />

          {/* Individual basal curves (background layer) */}
          {hasCurves && doseKeys.filter((k) => k.isBasal).map(renderDoseArea)}
          {/* Individual bolus curves */}
          {hasCurves && doseKeys.filter((k) => !k.isBasal).map(renderDoseArea)}

          {/* Combined Total Active Insulin curve — brighter cyan, on top */}
          {hasCurves && (
            <Line
              yAxisId="insulin"
              type="basis"
              dataKey="total_activity"
              name="Total Active"
              stroke={TOTAL_CURVE_COLOR}
              strokeWidth={selectedDoseKey ? 1.2 : 2}
              strokeOpacity={selectedDoseKey ? 0.4 : 0.85}
              fill="url(#total_insulin_fill)"
              fillOpacity={0.12}
              dot={false}
              activeDot={false}
              isAnimationActive={false}
              connectNulls={true}
            />
          )}
        </ComposedChart>
      </div>

      {/* Carb pills — compact, in carb lane */}
      {showCarbs && positionedCarbMarkers.map(({ entry, color, x, lane }) => {
        const isEdgeLeft = x < 40;
        const isEdgeRight = x > chartWidth - 40;
        const pillTop = glucoseChartHeight + 3 + lane * 16;
        return (
          <div
            key={`carb_marker_${entry.id}`}
            className="pointer-events-none absolute top-0 z-[12]"
            style={{
              left: x,
              transform: isEdgeLeft ? "translateX(0)" : isEdgeRight ? "translateX(-100%)" : "translateX(-50%)"
            }}
          >
            <div
              className="absolute left-1/2 w-px -translate-x-1/2"
              style={{
                top: pillTop + 14,
                height: Math.max(2, carbLaneHeight - (pillTop - glucoseChartHeight) - 14),
                background: `linear-gradient(to bottom, ${color}40, ${color}08)`
              }}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCarbTap(entry, e.currentTarget.getBoundingClientRect()); }}
              aria-label={`Carbs ${Math.round(entry.carbs)}g`}
              className="pointer-events-auto relative flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-semibold leading-none backdrop-blur-sm transition hover:brightness-125"
              style={{ top: pillTop, color, borderColor: `${color}30`, background: "rgba(10,16,14,0.72)" }}
            >
              <Wheat className="h-2.5 w-2.5" />
              <span>{Math.round(entry.carbs)}g</span>
            </button>
          </div>
        );
      })}

      {/* Insulin dose pills — anchored to dose time, at top of insulin lane */}
      {showInsulin && positionedDoseMarkers.map(({ dose, x, units, key, color, pillTop }) => {
        const isEdgeLeft = x < 36;
        const isEdgeRight = x > chartWidth - 36;
        const formattedUnits = units % 1 === 0 ? String(units) : units.toFixed(1);
        const shortLabel = String(dose.insulin_type || "Insulin").split(" ")[0];
        const isSelected = selectedDoseKey === key;
        return (
          <div
            key={`dose_label_${key}`}
            className="pointer-events-none absolute top-0 z-[6]"
            style={{
              left: x,
              transform: isEdgeLeft ? "translateX(0)" : isEdgeRight ? "translateX(-100%)" : "translateX(-50%)"
            }}
          >
            {/* Dotted connector from pill down to curve area */}
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                top: insulinLaneTop + pillTop + 16,
                height: Math.max(2, insulinMarginTop - pillTop - 16 + 4),
                borderLeft: `1px dotted ${color}50`,
              }}
            />
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onDoseTap(dose, key, e.currentTarget.getBoundingClientRect()); }}
              aria-label={`${formattedUnits} units ${shortLabel}`}
              className="pointer-events-auto relative flex cursor-pointer items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none backdrop-blur-sm transition hover:brightness-125"
              style={{
                top: insulinLaneTop + pillTop,
                color,
                background: isSelected ? `${color}22` : "rgba(10,16,14,0.72)",
                border: `1px solid ${isSelected ? color : `${color}35`}`,
                boxShadow: isSelected ? `0 0 8px ${color}40` : "none",
              }}
            >
              <span>{formattedUnits}u</span>
              <span className="text-[8px] opacity-60">{shortLabel}</span>
            </button>
          </div>
        );
      })}

      {/* Spike markers — small, subtle, at bottom edge of glucose chart */}
      {positionedSpikeMarkers.map((spike, idx) => {
        const color = spike.handled ? "rgba(91,168,138,0.5)" : "rgba(251,191,36,0.5)";
        return (
          <div
            key={`spike_${idx}`}
            className="pointer-events-none absolute z-[15]"
            style={{ left: spike.x, top: glucoseChartHeight - 1, transform: "translateX(-50%)" }}
          >
            <motion.button
              type="button"
              onClick={(e) => { e.stopPropagation(); onSpikeTag(spike); }}
              whileTap={{ scale: 0.85 }}
              aria-label={spike.handled ? "Spike reviewed" : "Reflect on this glucose rise"}
              className="pointer-events-auto flex h-3 w-3 items-center justify-center"
              animate={spike.handled ? { scale: 1 } : { scale: [1, 1.15, 1] }}
              transition={spike.handled ? { duration: 0.2 } : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <ArrowUp className="h-2.5 w-2.5" style={{ color }} strokeWidth={2.5} />
            </motion.button>
          </div>
        );
      })}
    </>
  );
}