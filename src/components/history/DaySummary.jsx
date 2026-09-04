import { GLUCOSE_STATUS_COLORS } from "@/lib/glucoseStatus";
import { formatDuration } from "@/lib/dayRecapMetrics";

function Metric({ label, value, unit, accent }) {
  return (
    <div
      className="rounded-2xl border px-3.5 py-3"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0.008))",
        borderColor: "rgba(255,255,255,0.10)",
      }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</p>
      <p className="mt-0.5 text-base font-bold" style={{ color: accent || "rgba(255,255,255,0.92)" }}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-medium text-white/40">{unit}</span>}
      </p>
    </div>
  );
}

export default function DaySummary({ metrics, daySummary, manualCount, hasCGM, targetLow, targetHigh }) {
  // No glucose at all
  if (!metrics.hasData && manualCount === 0) {
    return (
      <div
        className="rounded-2xl border px-4 py-5 text-center"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))",
          borderColor: "rgba(255,255,255,0.10)",
        }}
      >
        <p className="text-sm font-medium text-white/55">No glucose data for this day</p>
      </div>
    );
  }

  // Manual-only day (no CGM data — only intentional, user-entered readings)
  if (!hasCGM && manualCount > 0) {
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-4xl font-black text-white">{metrics.avg}</span>
          <span className="text-xs font-medium text-white/40">mg/dL</span>
          <span
            className="ml-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold text-white/55"
            style={{ background: "rgba(255,255,255,0.04)", borderColor: "rgba(255,255,255,0.12)" }}
          >
            {manualCount} manual {manualCount === 1 ? "reading" : "readings"}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <Metric label="Highest" value={metrics.max} unit="mg/dL" accent={GLUCOSE_STATUS_COLORS.high} />
          <Metric label="Lowest" value={metrics.min} unit="mg/dL" accent={GLUCOSE_STATUS_COLORS.low} />
        </div>
      </div>
    );
  }

  // CGM day
  const avg = daySummary?.glucose?.count
    ? Math.round(daySummary.glucose.sum / daySummary.glucose.count)
    : metrics.avg;
  const tir = daySummary?.glucose?.count
    ? Math.round((daySummary.glucose.inRange / daySummary.glucose.count) * 100)
    : metrics.tir;

  return (
    <div className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <span className="text-4xl font-black text-white">{avg}</span>
          <p className="text-[10px] font-medium text-white/40">mg/dL average</p>
        </div>
        <div className="text-right">
          <span className="text-3xl font-black text-teal-300/90">{tir}%</span>
          <p className="text-[10px] font-medium text-white/40">in your comfort zone</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Metric label="Highest" value={metrics.max} unit="mg/dL" accent={GLUCOSE_STATUS_COLORS.high} />
        <Metric label="Lowest" value={metrics.min} unit="mg/dL" accent={GLUCOSE_STATUS_COLORS.low} />
        <Metric label="Above range" value={formatDuration(metrics.aboveMs)} />
        <Metric label="Below range" value={formatDuration(metrics.belowMs)} />
      </div>
      {manualCount > 0 && (
        <p className="text-[11px] font-medium text-white/40">
          Plus {manualCount} manual {manualCount === 1 ? "reading" : "readings"}
        </p>
      )}
    </div>
  );
}