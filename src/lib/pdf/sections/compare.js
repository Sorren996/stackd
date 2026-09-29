import { BOX, LINE, INK, MUTED, GRID } from "@/lib/pdf/theme";
import { headingBlock, swatchLegend, tirItems, tirBar } from "@/lib/pdf/blocks";

const GAP = 24;
const COL_W = (BOX.w - GAP) / 2;
const ROW_H = 14;

const statRows = (d) => [
  ["Mean mg/dL", d?.stats?.mean != null ? String(d.stats.mean) : "—"],
  ["GMI %", d?.stats?.gmi != null ? String(d.stats.gmi) : "—"],
  ["Variability", d?.stats?.sd != null ? `\u00B1${d.stats.sd}` : "—"],
  ["%CV", d?.stats?.cv != null ? `${d.stats.cv}%` : "—"],
  ["Total insulin", d?.insulin?.totalUnits != null ? `${d.insulin.totalUnits} u` : "—"],
  ["Doses", d?.insulin?.doseCount != null ? String(d.insulin.doseCount) : "—"],
];

// One measured column: title, stat rows, TIR bar, legend (stacks as needed
// within the column width, so it can never reach the other column).
function column(flow, title, data) {
  const titleH = flow.measure(title, COL_W, { size: 9, style: "bold" });
  const legend = swatchLegend(flow, tirItems(data?.bands), COL_W);
  const rows = statRows(data);
  const barTop = titleH + 6 + rows.length * ROW_H + 6;
  return {
    h: barTop + 14 + 8 + legend.h,
    draw(x, top) {
      flow.text(title, x, top, COL_W, { size: 9, style: "bold", color: INK });
      let y = top + titleH + 6;
      for (const [k, v] of rows) {
        flow.text(k, x + 2, y, COL_W * 0.6 - 2, { size: 8, color: MUTED, maxLines: 1 });
        flow.text(v, x + COL_W * 0.6, y, COL_W * 0.4, { size: 8, style: "bold", color: INK, align: "right", maxLines: 1 });
        flow.doc.setDrawColor(...GRID);
        flow.doc.setLineWidth(0.4);
        flow.line(x, y + 8 * LINE + 1, x + COL_W, y + 8 * LINE + 1);
        y += ROW_H;
      }
      tirBar(flow, x, top + barTop, COL_W, 14, data?.bands);
      legend.draw(x, top + barTop + 22);
    },
  };
}

export function renderCompare(flow, reports) {
  const c = reports?.compare;
  if (!c) return;
  const left = column(flow, "This stretch", c.current);
  const right = column(flow, "The stretch before", c.prior);
  // Both columns form one atomic block, so they never split across pages.
  flow.placeTogether([
    headingBlock(flow, "Compare", "This window against the equal-length window just before it"),
    {
      what: "compare-columns",
      h: Math.max(left.h, right.h) + 4,
      draw(top) {
        left.draw(BOX.x, top);
        right.draw(BOX.x + COL_W + GAP, top);
      },
    },
  ]);
}