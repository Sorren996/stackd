import { fmtDay, RANGE, INK, GRAY, MUTED } from "@/lib/pdf/theme";
import { headingBlock, textBlock } from "@/lib/pdf/blocks";

export function renderPatterns(flow, reports) {
  const p = reports?.patterns;
  if (!p) return;
  const heading = headingBlock(flow, "Patterns", "Recurring highs and lows");
  const recurring = p.recurring || [];

  if (!recurring.length) {
    flow.placeTogether([
      heading,
      textBlock(flow, "No recurring out-of-range hour windows were detected in this window.", { size: 9, style: "italic", color: GRAY }),
    ]);
    return;
  }

  recurring.forEach((pat, i) => {
    const isHigh = pat.type === "high";
    const group = [
      textBlock(flow, `${isHigh ? "Times above target" : "Times below target"} · mostly ${pat.windowLabel}`, {
        size: 9.5, style: "bold", color: isHigh ? RANGE.high : RANGE.low, after: 3,
      }),
      textBlock(flow, `${pat.count} of ${pat.ofDays} days, mostly between ${pat.windowLabel}`, { size: 8.5, color: INK, after: 3 }),
      pat.evidenceDates?.length
        ? textBlock(flow, `Seen on: ${pat.evidenceDates.slice(0, 10).map(fmtDay).join(", ")}`, { size: 7.5, color: MUTED, after: 3 })
        : null,
    ];
    if (i > 0) flow.space(8);
    flow.placeTogether(i === 0 ? [heading, ...group] : group);
  });
}