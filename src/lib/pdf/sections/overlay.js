import { BOX, fmtDay, targetOf, INK, MUTED, WEEK_COLORS, WEEKDAY_LABELS } from "@/lib/pdf/theme";
import { headingBlock, textBlock, swatchLegend } from "@/lib/pdf/blocks";
import { overlayChartBlock } from "@/lib/pdf/charts";

// Most recent week + one comparison week (~4 weeks earlier, else earliest).
function pickWeeks(weeks) {
  if (weeks.length <= 1) return weeks;
  if (weeks.length >= 5) return [weeks[weeks.length - 5], weeks[weeks.length - 1]];
  return [weeks[0], weeks[weeks.length - 1]];
}

export function renderOverlay(flow, reports) {
  const weeks = (reports?.overlay || []).filter((wk) => (wk.days || []).some((d) => d.hasData));
  if (!weeks.length) return;
  const heading = headingBlock(flow, "Weekly Overlay", "Your most recent week beside an earlier comparison week");
  const legend = swatchLegend(
    flow,
    WEEKDAY_LABELS.map((label, i) => ({ label, color: WEEK_COLORS[i] })),
    BOX.w,
    { size: 6.5, sw: 6, gapX: 12 }
  );

  pickWeeks(weeks).forEach((wk, i) => {
    const dataDays = (wk.days || []).filter((d) => d.hasData).length;
    const partial = dataDays < 7;
    const group = [
      textBlock(flow, `Week of ${fmtDay(wk.weekStart)}${partial ? "  ·  partial week" : ""}`, {
        size: 9, style: "bold", color: INK, after: 3,
      }),
      overlayChartBlock(flow, wk.days, targetOf(reports), WEEK_COLORS),
      { what: "week-legend", h: legend.h + 3, draw: (top) => legend.draw(BOX.x, top) },
      partial
        ? textBlock(flow, `${dataDays} day${dataDays > 1 ? "s" : ""} of this week fall inside the selected window.`, {
            size: 6.5, style: "italic", color: MUTED,
          })
        : null,
    ];
    if (i > 0) flow.space(14);
    flow.placeTogether(i === 0 ? [heading, ...group] : group);
  });
}