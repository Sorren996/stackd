import Flow from "@/lib/pdf/Flow";
import { BOX, FOOTER_RULE_Y, FOOTER_TEXT, HAIR, MUTED } from "@/lib/pdf/theme";
import { renderCover, renderOverview } from "@/lib/pdf/sections/overview";
import { renderPatterns } from "@/lib/pdf/sections/patterns";
import { renderOverlay } from "@/lib/pdf/sections/overlay";
import { renderDaily } from "@/lib/pdf/sections/daily";
import { renderCompare } from "@/lib/pdf/sections/compare";
import { renderDailyStats, renderHourlyStats, renderAgp } from "@/lib/pdf/sections/stats";

// ─────────────────────────────────────────────────────────────────────────────
// Stackd Reports — typeset print renderer (vector, Clarity-style).
// All layout goes through the shared Flow engine, which clips every page to
// the A4 safe area, reserves each block's full height before painting, keeps
// headings with their content and table headers with their rows.
// ─────────────────────────────────────────────────────────────────────────────

const ORDER = ["overview", "patterns", "overlay", "daily", "compare", "dailyStats", "hourlyStats", "agp"];
const RENDERERS = {
  overview: renderOverview,
  patterns: renderPatterns,
  overlay: renderOverlay,
  daily: renderDaily,
  compare: renderCompare,
  dailyStats: renderDailyStats,
  hourlyStats: renderHourlyStats,
  agp: renderAgp,
};

// Footer inside the bottom of the safe area: disclaimer left, page number right.
function stampFooter(flow) {
  const d = flow.doc;
  const n = d.internal.getNumberOfPages();
  flow.footer = true;
  for (let p = 1; p <= n; p++) {
    d.setPage(p);
    flow.page = p;
    d.setDrawColor(...HAIR);
    d.setLineWidth(0.6);
    flow.line(BOX.x, FOOTER_RULE_Y, BOX.right, FOOTER_RULE_Y);
    flow.text(FOOTER_TEXT, BOX.x, FOOTER_RULE_Y + 5, BOX.w - 70, { size: 7, color: MUTED, maxLines: 1 });
    flow.text(`Page ${p} of ${n}`, BOX.right - 64, FOOTER_RULE_Y + 5, 64, { size: 7, color: MUTED, align: "right" });
  }
  flow.footer = false;
}

// Returns { filename, blob, audit } — audit lists any paint that fell outside
// its reserved block or the A4 safe area (expected to be empty).
export async function composeReportsPdf(reports, reportIds = []) {
  const flow = new Flow();
  renderCover(flow, reports);

  const wanted = new Set(reportIds.length ? reportIds : ORDER);
  for (const id of ORDER) {
    if (!wanted.has(id)) continue;
    flow.space(20);
    RENDERERS[id](flow, reports);
  }

  flow.finish();
  stampFooter(flow);

  const audit = { pages: flow.doc.internal.getNumberOfPages(), violations: flow.violations };
  if (audit.violations.length) console.warn("Report layout violations", audit.violations);

  const filename = `stackd-reports-${new Date().toISOString().slice(0, 10)}.pdf`;
  return { filename, blob: flow.doc.output("blob"), audit };
}