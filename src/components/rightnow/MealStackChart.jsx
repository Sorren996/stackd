import { useMemo } from "react";

// Shared IOB chart for the multi-meal Stack.
//
// All meals' bolus doses on one shared zero-based axis, same time window.
// Active meal's curve: sage #5b6550 stroke (2.6px) with translucent sage fill.
// Other meals' curves: warm gray #b9b1a4 at ~60% opacity, thinner, no fill.
// Dashed taupe total envelope: pointwise sum of all active dose curves.
// Copper dashed "now" line with "Now · <time>" label, hourly axis labels.
// Legend: colored dots per meal (active "· in focus") + dashed "Total, N meals".

const SAGE = "#5b6550";
const GRAY = "#b9b1a4";
const TAUPE = "#8a7f70";
const COPPER = "#9c5228";
const INK = "#3f3830";
const FAINT = "#746959";

function formatClock(time) {
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatHourLabel(time) {
  if (!Number.isFinite(time)) return "";
  const d = new Date(time);
  const h = d.getHours();
  const h12 = h % 12 || 12;
  const period = h >= 12 ? "PM" : "AM";
  return `${h12}${period}`;
}

export default function MealStackChart({ chartData, meals, now }) {
  const { windowStart, windowEnd, sampleTimes, mealCurves, totalCurve } = chartData || {};

  const W = 320;
  const H = 150;
  const padTop = 12;
  const padBottom = 22;
  const innerH = H - padTop - padBottom;
  const innerW = W;

  const yMax = useMemo(() => {
    if (!totalCurve) return 1;
    let max = 0;
    totalCurve.forEach((p) => { if (p.iob > max) max = p.iob; });
    mealCurves?.forEach((mc) => mc.forEach((p) => { if (p.iob > max) max = p.iob; }));
    return max > 0 ? max * 1.15 : 1;
  }, [totalCurve, mealCurves]);

  const xScale = (t) => ((t - windowStart) / (windowEnd - windowStart)) * innerW;
  const yScale = (v) => padTop + innerH - (v / yMax) * innerH;

  // Build SVG path for a curve
  const buildPath = (curve) => {
    if (!curve || !curve.length) return "";
    return curve
      .map((p, i) => {
        const x = xScale(p.time);
        const y = yScale(p.iob);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  // Build fill path (curve down to baseline)
  const buildFillPath = (curve) => {
    if (!curve || !curve.length) return "";
    const path = buildPath(curve);
    const lastX = xScale(curve[curve.length - 1].time);
    const firstX = xScale(curve[0].time);
    const baseline = yScale(0);
    return `${path} L ${lastX.toFixed(1)} ${baseline} L ${firstX.toFixed(1)} ${baseline} Z`;
  };

  // Hourly grid lines + labels
  const hourMarks = useMemo(() => {
    if (!Number.isFinite(windowStart) || !Number.isFinite(windowEnd)) return [];
    const marks = [];
    const start = new Date(windowStart);
    start.setMinutes(0, 0, 0);
    for (let t = start.getTime(); t <= windowEnd; t += 60 * 60 * 1000) {
      if (t >= windowStart && t <= windowEnd) marks.push(t);
    }
    return marks;
  }, [windowStart, windowEnd]);

  if (!chartData || !sampleTimes?.length) return null;

  const nowX = xScale(now);
  const nowVisible = now >= windowStart && now <= windowEnd;
  const mealCount = meals.length;

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0 }}>Insulin on board · this meal in focus</div>

      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }}>
        {/* Hourly grid lines */}
        {hourMarks.map((t) => {
          const x = xScale(t);
          return (
            <g key={t}>
              <line x1={x} y1={padTop} x2={x} y2={padTop + innerH} stroke="#eadccf" strokeWidth="0.5" />
              <text x={x} y={H - 6} textAnchor="middle" fontSize="8" fill={FAINT} fontFamily="sans-serif">
                {formatHourLabel(t)}
              </text>
            </g>
          );
        })}

        {/* Other meals' curves (rendered first, behind active) */}
        {mealCurves.map((curve, i) => {
          if (i === meals.activeIndex) return null;
          return (
            <path
              key={`meal-${i}`}
              d={buildPath(curve)}
              fill="none"
              stroke={GRAY}
              strokeWidth="1.5"
              strokeOpacity="0.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}

        {/* Active meal curve fill + stroke */}
        {mealCurves[meals.activeIndex] && (
          <>
            <path d={buildFillPath(mealCurves[meals.activeIndex])} fill={SAGE} fillOpacity="0.12" />
            <path
              d={buildPath(mealCurves[meals.activeIndex])}
              fill="none"
              stroke={SAGE}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}

        {/* Total envelope (dashed) */}
        <path
          d={buildPath(totalCurve)}
          fill="none"
          stroke={TAUPE}
          strokeWidth="1.2"
          strokeDasharray="4 3"
          strokeLinecap="round"
        />

        {/* Now line (dashed copper) */}
        {nowVisible && (
          <g>
            <line
              x1={nowX}
              y1={padTop}
              x2={nowX}
              y2={padTop + innerH}
              stroke={COPPER}
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            <text x={nowX} y={padTop - 3} textAnchor="middle" fontSize="8" fontWeight="600" fill={COPPER} fontFamily="sans-serif">
              Now · {formatClock(now)}
            </text>
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {meals.all.map((meal, i) => (
          <div key={i} className="flex items-center gap-1">
            <span
              className="inline-block rounded-full"
              style={{
                width: 8,
                height: 8,
                background: i === meals.activeIndex ? SAGE : GRAY,
                opacity: i === meals.activeIndex ? 1 : 0.6,
              }}
            />
            <span className="text-[10px]" style={{ color: FAINT }}>
              {meal.name}
              {i === meals.activeIndex && (
                <span style={{ color: SAGE, fontWeight: 600 }}> · in focus</span>
              )}
            </span>
          </div>
        ))}
        <div className="flex items-center gap-1">
          <svg width="16" height="4">
            <line x1="0" y1="2" x2="16" y2="2" stroke={TAUPE} strokeWidth="1.2" strokeDasharray="3 2" />
          </svg>
          <span className="text-[10px]" style={{ color: FAINT }}>
            Total, {mealCount} {mealCount === 1 ? "meal" : "meals"}
          </span>
        </div>
      </div>
    </div>
  );
}