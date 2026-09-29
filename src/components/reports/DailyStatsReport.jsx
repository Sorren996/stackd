import { ReportCard, val, unit } from "./reportShared";

// Daily Statistics — Monday→Sunday breakdown, split into daytime and the
// overnight hours. Transposed so each row is one metric (Average, In target,
// Low–High, CV), each column a weekday. Both periods are always shown as plain
// labelled tables so a static report/export carries the full picture with no
// dead interactive toggle.

const MODES = [
  { k: "daytime", label: "Daytime" },
  { k: "overnight", label: "Overnight" },
];

function StatTable({ ds, mode }) {
  const displayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun -> JS dow keys
  const labels = ds[mode.k] || {};
  const colsArr = displayOrder.map((k) => ({ label: ds.columns[displayOrder.indexOf(k)], col: labels[k] }));

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
    <div className="mt-4">
      <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "#6b6153" }}>
        {mode.label}
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="pb-2 pr-2 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#6b6153" }}>
                {mode.label}
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
    </div>
  );
}

export default function DailyStatsReport({ reports }) {
  const ds = reports?.dailyStats;
  if (!ds) return null;

  return (
    <ReportCard title="Daily Statistics">
      <p className="text-sm" style={{ color: "#6b6153" }}>
        The week, day by day — split into daytime and the overnight hours.
      </p>

      {MODES.map((m) => (
        <StatTable key={m.k} ds={ds} mode={m} />
      ))}

      <p className="mt-4 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
        "In target" is the share of that weekday's readings within your target range; CV is how varied that day tends
        to be.
      </p>
    </ReportCard>
  );
}