import { INK, MUTED } from "@/lib/pdf/theme";
import { headingBlock, textBlock, statGridBlock } from "@/lib/pdf/blocks";
import { percentileChartBlock } from "@/lib/pdf/charts";
import { flowTable } from "@/lib/pdf/table";

export function renderDailyStats(flow, reports) {
  const ds = reports?.dailyStats;
  if (!ds) return;
  const dayCols = [1, 2, 3, 4, 5, 6, 0];
  const cols = [
    { label: "Metric", frac: 1.5, bold: true },
    ...dayCols.map((_, i) => ({ label: ds.columns?.[i] ?? "", frac: 1, align: "right" })),
  ];
  const metrics = [
    ["Avg mg/dL", (c) => (c ? `${c.mean ?? "—"}` : "—")],
    ["In target %", (c) => (c ? `${c.target ?? "—"}%` : "—")],
    ["Low–High", (c) => (c ? `${c.min ?? "—"}\u2013${c.max ?? "—"}` : "—")],
    ["CV %", (c) => (c ? `${c.cv ?? "—"}` : "—")],
    ["Readings", (c) => (c ? String(c.count ?? "—") : "—")],
  ];

  ["daytime", "overnight"].forEach((key, i) => {
    const mode = ds[key] || {};
    const label = key === "daytime" ? "Daytime (6am–10pm)" : "Overnight (10pm–6am)";
    const sub = textBlock(flow, label, { size: 9, style: "bold", color: INK, after: 5 });
    if (i > 0) flow.space(14);
    flowTable(
      flow,
      cols,
      metrics.map(([name, f]) => [name, ...dayCols.map((dc) => f(mode[dc]))]),
      {
        lead: i === 0 ? [headingBlock(flow, "Daily Statistics", "Day of week, split into daytime and overnight"), sub] : [sub],
        continued: label,
      }
    );
  });
}

export function renderHourlyStats(flow, reports) {
  const hs = (reports?.hourlyStats || []).filter((h) => h.values?.count > 0);
  if (!hs.length) return;
  const rows = hs.map(({ hour, values: v }) => [
    `${hour % 12 === 0 ? 12 : hour % 12}${hour < 12 ? "am" : "pm"}`,
    v.mean != null ? `${v.mean}` : "—",
    v.target != null ? `${v.target}%` : "—",
    v.min != null ? `${v.min}\u2013${v.max}` : "—",
    v.cv != null ? `${v.cv}` : "—",
    v.count != null ? String(v.count) : "—",
  ]);
  flowTable(
    flow,
    [
      { label: "Hour", frac: 1.1, bold: true },
      { label: "Avg", frac: 1, align: "right" },
      { label: "In target %", frac: 1, align: "right" },
      { label: "Low–High", frac: 1.4, align: "right" },
      { label: "CV %", frac: 1, align: "right" },
      { label: "Readings", frac: 1, align: "right" },
    ],
    rows,
    { lead: [headingBlock(flow, "Hourly Statistics", "The same numbers, hour by hour")], size: 7.5, padY: 3, continued: "Hourly Statistics" }
  );
}

export function renderAgp(flow, reports) {
  const agp = reports?.agp;
  if (!agp) return;
  const hl = agp.headline || {};
  flow.placeTogether([
    headingBlock(flow, "Glucose Profile (AGP)", "Standard percentile profile"),
    statGridBlock(flow, [
      ["Mean", hl.mean != null ? `${hl.mean} mg/dL` : "—"],
      ["GMI", hl.gmi != null ? `${hl.gmi}%` : "—"],
      ["Variability", hl.cv != null ? `${hl.cv}% CV` : "—"],
      ["Days with data", hl.activePercent != null ? `${hl.activePercent}%` : "—"],
    ]),
  ]);
  flow.space(6);
  flow.placeTogether([
    textBlock(flow, "Hour-of-day pattern", { size: 10, style: "bold", color: INK, after: 4 }),
    percentileChartBlock(flow, agp.hourBands, { plotH: 116 }),
    textBlock(flow, "IQR envelope and median, like the standard AGP format.", { size: 7, color: MUTED }),
  ]);
}