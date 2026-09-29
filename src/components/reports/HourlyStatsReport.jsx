import { ReportCard, val, unit, hourLabel } from "./reportShared";

// Hourly Statistics — the same weekday-style metrics, hour by hour, across
// all 24 hours. A compact horizontal table keeps 24 columns glanceable.

export default function HourlyStatsReport({ reports }) {
  const hours = reports?.hourlyStats || [];
  if (!hours.length) {
    return (
      <ReportCard title="Hourly Statistics">
        <p className="text-sm" style={{ color: "#6b6153" }}>No Dexcom data to summarize by hour.</p>
      </ReportCard>
    );
  }

  const active = hours.filter((h) => h.values?.count > 0);

  return (
    <ReportCard title="Hourly Statistics">
      <p className="text-sm" style={{ color: "#6b6153" }}>
        Your numbers by the clock — the hours that quietly repeat and the ones that wander.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="pb-2 pr-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#6b6153" }}>Hour</th>
              {active.map((h) => (
                <th key={h.hour} className="pb-2 pr-1 text-[10px] font-semibold tabular-nums" style={{ color: "#6b6153" }}>
                  {hourLabel(h.hour)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[
              { label: "Avg", f: (v) => (v ? val(v.mean) : "—"), u: true },
              { label: "In target", f: (v) => (v ? `${v.target}%` : "—") },
              { label: "Low–High", f: (v) => (v ? `${val(v.min)}–${val(v.max)}` : "—"), tiny: true },
              { label: "CV", f: (v) => (v ? `${v.cv?.toFixed?.(0) ?? v.cv}%` : "—") },
              { label: "Reads", f: (v) => (v ? v.count : "—") },
            ].map((row, ri) => (
              <tr key={ri} className="border-t" style={{ borderColor: "#eadccf" }}>
                <td className="py-2 pr-2 text-[11px] font-medium" style={{ color: "#6b6153" }}>{row.label}</td>
                {active.map((h) => (
                  <td key={h.hour} className={`py-2 pr-1 tabular-nums ${row.tiny ? "text-[11px]" : "text-sm"}`} style={{ color: "#3f3830" }}>
                    {row.f(h.values)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
        Hours with no readings are left out. Each column covers that one hour across every day in the range.
      </p>
    </ReportCard>
  );
}