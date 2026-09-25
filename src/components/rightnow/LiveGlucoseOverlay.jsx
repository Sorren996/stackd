import { useMemo } from "react";
import { Lock } from "lucide-react";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  sage: "#5b6550",
  hairline: "#eadccf",
  lock: "#8a7f70",
};

/**
 * Live glucose overlay for the Meal Review card.
 *
 * When Dexcom is connected, renders the CGM glucose trace across the open
 * review window as a small sparkline, aligned to the same time axis as the
 * dose and meal log entries. When not connected, shows a quiet locked state.
 */
export default function LiveGlucoseOverlay({
  dexcomConnected,
  glucoseReadings,
  mealTime,
  reviewWindowEnd,
  now,
  targetLow = 70,
  targetHigh = 180,
  onConnectDexcom,
}) {
  const windowReadings = useMemo(() => {
    if (!dexcomConnected) return [];
    const end = Math.min(now, reviewWindowEnd);
    return (Array.isArray(glucoseReadings) ? glucoseReadings : [])
      .map((r) => ({ time: new Date(r.recorded_at).getTime(), value: Number(r.value) }))
      .filter((r) => Number.isFinite(r.time) && Number.isFinite(r.value) && r.time >= mealTime && r.time <= end)
      .sort((a, b) => a.time - b.time);
  }, [dexcomConnected, glucoseReadings, mealTime, reviewWindowEnd, now]);

  // Locked state — quiet, informational.
  if (!dexcomConnected) {
    return (
      <button
        type="button"
        onClick={onConnectDexcom || undefined}
        className="mt-3 flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left transition"
        style={{
          background: "#f7f1e8",
          cursor: onConnectDexcom ? "pointer" : "default",
        }}
      >
        <Lock size={13} strokeWidth={2} style={{ color: PALETTE.lock, flexShrink: 0 }} />
        <span className="text-[12px] leading-snug" style={{ color: PALETTE.faint }}>
          Connect Dexcom to see live glucose here.
        </span>
      </button>
    );
  }

  if (windowReadings.length < 2) {
    return (
      <div className="mt-3 flex items-center gap-2 px-1">
        <span className="text-[12px]" style={{ color: PALETTE.faint }}>
          Waiting for live glucose.
        </span>
      </div>
    );
  }

  // Sparkline geometry
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

  const x = (t) => padX + ((t - start) / timeSpan) * (width - padX * 2);
  const y = (v) => padY + (1 - (v - vMin) / vSpan) * (height - padY * 2);

  const rangeYTop = y(targetHigh);
  const rangeYBottom = y(targetLow);

  const path = windowReadings
    .map((r, i) => `${i ? "L" : "M"} ${x(r.time).toFixed(1)} ${y(r.value).toFixed(1)}`)
    .join(" ");

  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>
          Live glucose · this window
        </span>
        <span className="text-[10px] tabular-nums" style={{ color: PALETTE.faint }}>
          {windowReadings.length} readings
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none">
        {/* Target range band */}
        <rect
          x={padX}
          y={Math.min(rangeYTop, rangeYBottom)}
          width={width - padX * 2}
          height={Math.abs(rangeYBottom - rangeYTop)}
          fill="#5b6550"
          fillOpacity={0.07}
        />
        {/* CGM trace */}
        <path d={path} fill="none" stroke={PALETTE.sage} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
        {/* Current point */}
        {windowReadings.length > 0 && (
          <circle
            cx={x(windowReadings[windowReadings.length - 1].time)}
            cy={y(windowReadings[windowReadings.length - 1].value)}
            r={2.5}
            fill={PALETTE.sage}
          />
        )}
      </svg>
    </div>
  );
}