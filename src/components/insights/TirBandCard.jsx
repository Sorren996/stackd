import { useMemo } from "react";
import DashboardCard from "@/components/dashboard/DashboardCard";

const BAND_STYLES = {
  veryLow: { label: "Very Low", bg: "#b25f4e", display: "below 54" },
  low: { label: "Low", bg: "#c9855f", display: "54–69" },
  target: { label: "Target", bg: "#5b6550", display: "70–180" },
  high: { label: "High", bg: "#b5973f", display: "181–250" },
  veryHigh: { label: "Very High", bg: "#8a5a12", display: "above 250" },
};

export default function TirBandCard({ tir, gates }) {
  const bands = useMemo(
    () =>
      Object.keys(BAND_STYLES).map((key, i) => ({
        key,
        ...BAND_STYLES[key],
        percent: tir?.bandPercentages?.[i]?.percent ?? 0,
      })),
    [tir]
  );

  const showValue = tir?.pass;
  const gateMessage = tir?.pass ? null : gates?.tirMessage || "Not enough data yet";

  return (
    <DashboardCard className="p-5">
      <div className="section-label">Time in range</div>
      {showValue ? (
        <>
          <div className="mt-4 flex h-9 w-full items-stretch overflow-hidden rounded-lg" role="img" aria-label="Time in range by band">
            {bands.map((b) =>
              b.percent > 0 ? (
                <div
                  key={b.key}
                  className="flex items-center justify-center min-w-0 transition-all duration-500"
                  style={{ width: `${b.percent}%`, background: b.bg }}
                  title={`${b.label} ${b.percent}%`}
                >
                  {b.percent >= 5 && (
                    <span className="truncate px-0.5 text-xs font-semibold" style={{ color: "#fdf9f2" }}>
                      {b.percent}%
                    </span>
                  )}
                </div>
              ) : null
            )}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
            {bands.map((b) => (
              <div key={b.key} className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.bg }} />
                <span className="text-xs" style={{ color: "#6b6153" }}>
                  {b.label} <span className="font-semibold" style={{ color: "#3f3830" }}>{b.percent}%</span>
                </span>
              </div>
            ))}
          </div>

          <div className="mt-5 space-y-1.5 border-t pt-4" style={{ borderColor: "#eadccf" }}>
            <StatRow label="Mean glucose" value={`${tir.mean} mg/dL`} />
            <StatRow label="Standard deviation" value={`${tir.sd} mg/dL`} />
            <StatRow label="%CV" value={`${tir.cv}%`} />
            <StatRow label="GMI" value={`${tir.gmi}%`} />
            <p className="mt-2 text-xs leading-relaxed" style={{ color: "#746959" }}>
              {tir.gmiNote}
            </p>
            <p className="text-xs leading-relaxed" style={{ color: "#6b6153" }}>
              {tir.variabiltyNote}
            </p>
          </div>
        </>
      ) : (
        <p className="mt-3 text-sm" style={{ color: "#6b6153" }}>
          {gateMessage}
        </p>
      )}
    </DashboardCard>
  );
}

function StatRow({ label, value }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-sm" style={{ color: "#6b6153" }}>{label}</span>
      <span className="text-sm font-semibold" style={{ color: "#3f3830" }}>{value}</span>
    </div>
  );
}