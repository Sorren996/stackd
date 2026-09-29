import { fmtDate, fmtDay, MUTED, INK, GRAY } from "@/lib/pdf/theme";
import { headingBlock, textBlock, ruleBlock, statGridBlock, tirBlock } from "@/lib/pdf/blocks";
import { percentileChartBlock } from "@/lib/pdf/charts";

export function renderCover(flow, reports) {
  const meta = reports?.meta || {};
  const who = `${meta.displayName || "Stackd user"}${meta.email ? ` · ${meta.email}` : ""}`;
  flow.placeTogether([
    textBlock(flow, "STACKD REPORTS", { size: 11, style: "bold", color: GRAY, after: 6 }),
    textBlock(flow, "Your CGM report", { size: 20, style: "bold", color: INK, after: 4 }),
    textBlock(flow, `${fmtDate(reports.rangeStart)} — ${fmtDate(reports.rangeEnd)}`, { size: 10, color: GRAY, after: 4 }),
    textBlock(
      flow,
      `${who} · generated ${meta.generatedAt ? fmtDate(meta.generatedAt) : "just now"} · ${meta.cgmSystem || "Dexcom"} · ${reports.windowDays}-day window`,
      { size: 8.5, color: MUTED, after: 8 }
    ),
    ruleBlock(flow, { weight: 1, after: 16 }),
  ]);
}

export function renderOverview(flow, reports) {
  const o = reports?.overview;
  if (!o) return;
  const s = o.stats || {};
  const c = o.completeness || {};
  const cells = [
    ["GMI", s.gmi != null ? `${s.gmi}%` : "—", "avg glucose, hbA1c-like"],
    ["Mean", s.mean != null ? `${s.mean} mg/dL` : "—", "average reading"],
    ["Variability", s.sd != null ? `\u00B1${s.sd}` : "—", "standard deviation"],
    ["%CV", s.cv != null ? `${s.cv}%` : "—", "coefficient of variation"],
    ["Days with data", c.daysWithData ?? "—", `of ${c.totalDays ?? reports.windowDays} days`],
    ["Data captured", c.percentCaptured != null ? `${c.percentCaptured}%` : "—", "readings collected"],
    ["Best day in range", o.bestDay ? `${fmtDay(o.bestDay.date)} · ${o.bestDay.tirPercent}%` : "—", "highest target time"],
    ["Readings", s.count?.toLocaleString?.() ?? s.count ?? "—", "dexcom readings"],
  ];
  flow.placeTogether([
    headingBlock(flow, "Overview", "Your glucose across this whole window"),
    statGridBlock(flow, cells),
  ]);

  flow.space(8);
  flow.placeTogether([
    textBlock(flow, "Time in range", { size: 10, style: "bold", color: INK, after: 6 }),
    tirBlock(flow, o.bands),
  ]);

  flow.space(12);
  flow.placeTogether([
    textBlock(flow, "Glucose by hour of day", { size: 10, style: "bold", color: INK, after: 4 }),
    percentileChartBlock(flow, o.hourBands),
    textBlock(flow, "Shaded bands are the 5th–95th and 25th–75th percentiles; the line is the median.", { size: 7, color: MUTED }),
  ]);
}