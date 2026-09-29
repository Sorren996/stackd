import { fmtTime, targetOf, GRAY, MUTED } from "@/lib/pdf/theme";
import { headingBlock, textBlock } from "@/lib/pdf/blocks";
import { dayChartBlock } from "@/lib/pdf/charts";
import { flowTable } from "@/lib/pdf/table";

// One spotlight day: heading + chart kept together, then the events table
// (header kept with its first row), then a one-line stat summary.
export function renderDayDetail(flow, reports, title, tag, day, events) {
  const head = headingBlock(flow, title, day ? `${tag} · ${day.tirPercent}% in target` : null, { size: 11 });
  if (!day) {
    flow.placeTogether([head, textBlock(flow, "Not enough data yet for a full day.", { size: 9, style: "italic", color: GRAY })]);
    return;
  }
  flow.placeTogether([head, dayChartBlock(flow, day.series, targetOf(reports))]);

  const rows = (events || []).map((e) => [fmtTime(e.time), e.type || "Event", e.details || e.name || "—", e.valueText || ""]);
  if (rows.length) {
    flow.space(8);
    flowTable(
      flow,
      [
        { label: "Time", frac: 0.13 },
        { label: "Type", frac: 0.17 },
        { label: "Details", frac: 0.52 },
        { label: "Amount", frac: 0.18, align: "right", bold: true },
      ],
      rows,
      {
        lead: [headingBlock(flow, "Day events", "Each support dose and nourishment you logged appears here once.", { size: 9, rule: false, after: 6 })],
        continued: `${title} · day events`,
      }
    );
  }

  const s = day.stats;
  if (s) {
    flow.space(6);
    flow.place(
      textBlock(
        flow,
        `Readings ${s.count ?? "—"} · Mean ${s.mean ?? "—"} mg/dL · Low–high ${s.min ?? "—"}\u2013${s.max ?? "—"} · TIR ${day.tirPercent}%`,
        { size: 7.5, color: MUTED }
      )
    );
  }
}