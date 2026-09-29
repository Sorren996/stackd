import { useState } from "react";
import { ReportCard, val, unit } from "./reportShared";

// Daily Statistics — Monday→Sunday breakdown, split into daytime and overnight.
// Transposed so each row is one metric (Average, In target, Low–High, CV),
// each column a weekday.

export default function DailyStatsReport({ reports }) {
  const [mode, setMode] = useState("daytime");
  const ds = reports?.dailyStats;
  if (!ds) return null;

  const cols = ds[mode] || {};
  const displayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun -> JS dow keys
  const colsArr = displayOrder.map((k) => ({ label: ds.columns[displayOrder.indexOf(k)], col: cols[k] }));

  const metricRows = [
    {
      label: "Avg",
      f: (c) => (c ? `${val(c.mean)}` : "—"),
      sub: (c) => (c ? unit() : ""),
    },
    {
      label: "In target",
      f: (c) => (c ? `${c.target}%` : "—"),
    },
    {
      label: "Low–High",
      f: (c) => (c ? `${val(c.min)}–${val(c.max)}` : "—"),
      tiny: true,
    },
    {
      label: "CV",
      f: (c) => (c ? `${c.cv?.toFixed?.(0) ?? c.cv}%` : "—"),
    },
    {
      label: "Readings",
      f: (c) => (c ? c.count?.toLocaleString?.() ?? c.count : "—"),
    },
  ];

  return (
    <ReportCard title="Daily Statistics">
      <p className="text-sm" style={{ color: "#6b6153" }}>
        The week, day by day — split into daytime and the overnight hours.
      </p>

      <div className="mt-4 flex gap-2">
        {[
          { k: "daytime", label: "Daytime" },
          { k: "overnight", label: "Overnight" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setMode(t.k)}
            className="rounded-full px-3 py-1.5 text-xs font-semibold transition-colors"
            style={{
              background: mode === t.k ? "#3f3830" : "#f0e8db",
              color: mode === t.k ? "#f7f1e8" : "#6b6153",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="pb-2 pr-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#6b6153" }}>
                {mode}
              </th>
              {colsArr.map((c) => (
                <th key={c.label} className="pb-2 pr-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#6b6153" }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {metricRows.map((m, ri) => (
              <tr key={ri} className="border-t" style={{ borderColor: "#eadccf" }}>
                <td className="py-2 pr-2 text-[11px] font-medium" style={{ color: "#6b6153" }}>{m.label}</td>
                {colsArr.map((c, ci) => (
                  <td key={ci} className={`py-2 pr-1 tabular-nums ${m.tiny ? "text-[12px]" : "text-base"}`} style={{ color: "#3f3830" }}>
                    {m.f(c.col)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
        "In target" is the share of that weekday's readings within your target range; CV is how varied that day tends
        to be.
      </p>
    </ReportCard>
  );
}