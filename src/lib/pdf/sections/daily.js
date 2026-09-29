import { BOX, LINE, fmtDay, RANGE, INK, GRAY, GRID } from "@/lib/pdf/theme";
import { headingBlock } from "@/lib/pdf/blocks";
import { sparkline } from "@/lib/pdf/charts";
import { flowTable } from "@/lib/pdf/table";
import { renderDayDetail } from "@/lib/pdf/sections/dayDetail";

function allDaysTable(flow, pages) {
  const rows = pages.map((pg) => {
    const s = pg.stats || {};
    const doses = pg.markers?.doses || [];
    const units = doses.reduce((sum, d) => sum + (Number(d.units) || 0), 0);
    return [
      fmtDay(pg.date),
      s.mean != null ? `${s.mean}` : "—",
      `${pg.tirPercent ?? 0}%`,
      s.min != null ? `${s.min}\u2013${s.max}` : "—",
      units > 0 ? `${Math.round(units * 10) / 10}u` : "—",
      doses.length ? String(doses.length) : "—",
    ];
  });
  flowTable(
    flow,
    [
      { label: "Date", frac: 1.45, bold: true },
      { label: "Avg mg/dL", frac: 1.15, align: "right" },
      { label: "TIR %", frac: 0.9, align: "right" },
      { label: "Low–High", frac: 1.2, align: "right" },
      { label: "Insulin", frac: 0.85, align: "right" },
      { label: "# Doses", frac: 0.75, align: "right" },
    ],
    rows,
    { lead: [headingBlock(flow, "All Days", "One row per day — a glanceable summary")], continued: "All Days" }
  );
}

// Grid of compact per-day curves; each row of 4 is one block.
function dailyProfiles(flow, pages) {
  const perRow = 4;
  const gap = 12;
  const cellW = (BOX.w - gap * (perRow - 1)) / perRow;
  const labelH = 7 * LINE;
  const boxH = 40;
  const rowH = labelH + 2 + boxH + 12;
  const heading = headingBlock(flow, "Daily Profiles", "One compact curve for each day");

  for (let i = 0; i < pages.length; i += perRow) {
    const slice = pages.slice(i, i + perRow);
    const row = {
      what: "profile-row",
      h: rowH,
      draw(top) {
        slice.forEach((pg, ci) => {
          const x = BOX.x + ci * (cellW + gap);
          const tir = pg.tirPercent ?? 0;
          flow.text(fmtDay(pg.date), x, top, cellW * 0.62, { size: 7, style: "bold", color: INK, maxLines: 1 });
          flow.text(`TIR ${tir}%`, x + cellW * 0.62, top, cellW * 0.38, { size: 6.5, color: tir >= 70 ? RANGE.target : GRAY, align: "right", maxLines: 1 });
          const by = top + labelH + 2;
          flow.doc.setDrawColor(...GRID);
          flow.doc.setLineWidth(0.4);
          flow.rect(x, by, cellW, boxH, "S");
          sparkline(flow, x + 2, by + 3, cellW - 4, boxH - 6, pg.series || []);
        });
      },
    };
    flow.placeTogether(i === 0 ? [heading, row] : [row]);
  }
}

// Summary → highlights → detail.
export function renderDaily(flow, reports) {
  const pages = reports?.daily?.pages || [];
  const patterns = reports?.patterns;
  if (!pages.length && !patterns) return;

  if (pages.length) allDaysTable(flow, pages);

  const eventsFor = (date) => pages.find((pg) => pg.date === date)?.events || [];
  if (patterns?.bestDay) {
    flow.space(16);
    renderDayDetail(flow, reports, `Best day · ${fmtDay(patterns.bestDay.date)}`, "Most time in target", patterns.bestDay, eventsFor(patterns.bestDay.date));
  }
  if (patterns?.worstDay) {
    flow.space(16);
    renderDayDetail(flow, reports, `Hardest day · ${fmtDay(patterns.worstDay.date)}`, "Least time in target", patterns.worstDay, eventsFor(patterns.worstDay.date));
  }

  if (pages.length) {
    flow.space(16);
    dailyProfiles(flow, pages);
  }
}