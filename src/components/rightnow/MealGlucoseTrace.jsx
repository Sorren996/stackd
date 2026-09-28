import { useMemo } from "react";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  sage: "#5b6550",
  copper: "#9c5228",
  hairline: "#eadccf"
};

/**
 * Small glucose response trace for the Meal Review outcome section.
 *
 * Renders the readings (manual or CGM) across the open review window as a
 * sparkline with comfort-zone shading. When the window has no readings at
 * all, shows a quiet empty state — never a Dexcom connect prompt.
 */
export default function MealGlucoseTrace({ glucoseReadings, mealTime, reviewWindowEnd, now, targetLow = 70, targetHigh = 180 }) {
  const windowReadings = useMemo(() => {
    const end = Math.min(now, reviewWindowEnd);
    return (Array.isArray(glucoseReadings) ? glucoseReadings : []).
    map((r) => ({ time: new Date(r.recorded_at).getTime(), value: Number(r.value) })).
    filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value) && r.time >= mealTime && r.time <= end).
    sort((a, b) => a.time - b.time);
  }, [glucoseReadings, mealTime, reviewWindowEnd, now]);

  if (windowReadings.length < 2) {
    return (
      <div className="mt-3 flex h-[56px] items-center justify-center rounded-[12px]" style={{ background: "#f7f1e8" }}>
        <span className="text-[12px]" style={{ color: PALETTE.faint }}>
          {windowReadings.length === 0 ? "No glucose logged around this meal" : "Waiting for more readings"}
        </span>
      </div>);

  }

  const width = 280;
  const height = 56;
  const padX = 2;
  const padY = 4;

  const start = mealTime;
  const end = Math.min(now, reviewWindowEnd);
  const timeSpan = Math.max(1, end - start);

  const values = windowReadings.map((r) => r.value);
  let vMin = Math.min(...values, targetLow);
  let vMax = Math.max(...values, targetHigh);
  const vPad = Math.max(10, (vMax - vMin) * 0.1);
  vMin -= vPad;
  vMax += vPad;
  const vSpan = Math.max(1, vMax - vMin);

  const x = (t) => padX + (t - start) / timeSpan * (width - padX * 2);
  const y = (v) => padY + (1 - (v - vMin) / vSpan) * (height - padY * 2);

  const rangeYTop = y(targetHigh);
  const rangeYBottom = y(targetLow);

  const path = windowReadings.
  map((r, i) => `${i ? "L" : "M"} ${x(r.time).toFixed(1)} ${y(r.value).toFixed(1)}`).
  join(" ");

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>
          Glucose in this window
        </span>
        

        
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        <rect
          x={padX}
          y={Math.min(rangeYTop, rangeYBottom)}
          width={width - padX * 2}
          height={Math.abs(rangeYBottom - rangeYTop)}
          fill={PALETTE.sage}
          fillOpacity={0.07} />
        
        <path d={path} fill="none" stroke={PALETTE.sage} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        <circle
          cx={x(windowReadings[windowReadings.length - 1].time)}
          cy={y(windowReadings[windowReadings.length - 1].value)}
          r={2.5}
          fill={PALETTE.sage} />
        
      </svg>
    </div>);

}