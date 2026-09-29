import { useRef, useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { REPORT_ORDER, REPORT_TYPE_BY_ID } from "./reportCatalog";
import { ReportFooter } from "./reportShared";
import { composeReportsPdf } from "@/lib/exportReportsPdf";
import OverviewReport from "./OverviewReport";
import PatternsReport from "./PatternsReport";
import OverlayReport from "./OverlayReport";
import DailyReport from "./DailyReport";
import CompareReport from "./CompareReport";
import DailyStatsReport from "./DailyStatsReport";
import HourlyStatsReport from "./HourlyStatsReport";
import AgpReport from "./AgpReport";

const REPORT_COMPONENTS = {
  overview: OverviewReport,
  patterns: PatternsReport,
  overlay: OverlayReport,
  daily: DailyReport,
  compare: CompareReport,
  dailyStats: DailyStatsReport,
  hourlyStats: HourlyStatsReport,
  agp: AgpReport,
};

// ReportViewer — paginated, swipeable walk through the selected reports.
// Full-screen overlay: a single compact header row (fixed), a swipeable slide
// area, and a dots/arrows row that clears the home indicator. Download builds
// ONE combined PDF containing every selected report, not just the active one.

export default function ReportViewer({ reports, reportIds, onBack, windowDays }) {
  const ordered = REPORT_ORDER.filter((id) => reportIds.includes(id));
  const [index, setIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const scrollRef = useRef(null);
  const captureRef = useRef(null);       // hidden container holding all selected reports

  const activeReport = ordered[index];
  const meta = reports?.meta || {};

  // Reset to the first slide whenever the report set changes.
  useEffect(() => {
    setIndex(0);
    const el = scrollRef.current;
    if (el) el.scrollLeft = 0;
  }, [reports, reportIds]);

  const go = useCallback(
    (i) => {
      if (i < 0 || i >= ordered.length) return;
      setIndex(i);
      scrollRef.current?.scrollTo({ left: i * scrollRef.current.clientWidth, behavior: "smooth" });
    },
    [ordered.length]
  );

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== index && i >= 0 && i < ordered.length) setIndex(i);
  };

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      if (!captureRef.current) {
        toast.error("Nothing to export yet.");
        return;
      }
      // Each selected report is a direct child of the hidden container.
      const nodes = Array.from(captureRef.current.children);
      const result = await composeReportsPdf(nodes);
      if (!result) {
        toast.error("Unable to build the PDF. Please try again.");
        return;
      }
      const url = URL.createObjectURL(result.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${ordered.length} report${ordered.length > 1 ? "s" : ""}`);
    } catch (err) {
      console.error("[ReportViewer] download failed:", err);
      toast.error("Unable to build the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col overflow-hidden"
      style={{ background: "#4c6770" }}
    >
      {/* Compact single-row header */}
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-3"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold transition active:opacity-70"
          style={{ background: "rgba(253,249,242,0.10)", color: "#f7f1e8" }}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>

        <div className="min-w-0 text-center">
          <div className="truncate text-sm font-semibold" style={{ color: "#f7f1e8" }}>
            {REPORT_TYPE_BY_ID[activeReport]?.label || activeReport}
          </div>
          <div className="text-[11px] tabular-nums" style={{ color: "#f7f1e8", opacity: 0.85 }}>
            {index + 1} of {ordered.length}
          </div>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-sm font-semibold transition active:opacity-70 disabled:opacity-50"
          style={{ background: "rgba(253,249,242,0.10)", color: "#f7f1e8" }}
          aria-label="Download all selected reports as PDF"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="hidden min-[380px]:inline">PDF</span>
        </button>
      </div>

      {/* Title line — range + author, compact */}
      <div className="shrink-0 px-4 pt-2">
        <h2 className="truncate text-sm font-semibold" style={{ color: "#f7f1e8" }}>
          {fmtRange(reports)} · {meta.displayName || "Stackd user"}
        </h2>
      </div>

      {/* Slide content — scrolls, clears the bottom controls */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="no-scrollbar mt-2 min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {ordered.map((id, i) => {
          const C = REPORT_COMPONENTS[id];
          return (
            <section
              key={id}
              className="h-full w-full shrink-0 snap-center overflow-y-auto px-4"
              style={{ scrollSnapAlign: "center" }}
            >
              {i === index && C ? (
                <div className="mx-auto max-w-md space-y-3 pb-6 pt-1">
                  <C reports={reports} />
                  <ReportFooter />
                </div>
              ) : (
                <div className="mx-auto max-w-md" />
              )}
            </section>
          );
        })}
      </div>

      {/* Slide dots + arrows — clears the home indicator */}
      <div
        className="flex shrink-0 items-center justify-between px-3 pt-2"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={() => go(index - 1)}
          disabled={index === 0}
          className="flex h-11 w-11 items-center justify-center rounded-full transition active:opacity-70 disabled:opacity-30"
          style={{ background: "#fdf9f2", color: "#3f3830" }}
          aria-label="Previous report"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-1.5">
          {ordered.map((id, i) => (
            <button
              key={id}
              type="button"
              onClick={() => go(i)}
              className="h-2 rounded-full transition-all"
              style={{
                width: i === index ? 18 : 7,
                background: i === index ? "#f7f1e8" : "rgba(247,241,232,0.4)",
              }}
              aria-label={`Go to ${REPORT_TYPE_BY_ID[id]?.label}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={() => go(index + 1)}
          disabled={index >= ordered.length - 1}
          className="flex h-11 w-11 items-center justify-center rounded-full transition active:opacity-70 disabled:opacity-30"
          style={{ background: "#fdf9f2", color: "#3f3830" }}
          aria-label="Next report"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Off-screen capture container — all selected reports, mounted for export.
          Kept at opacity:1 but pushed far off-screen (left:-10000px) so
          html2canvas can snapshot it without affecting the visible layout. */}
      <div
        ref={captureRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-[-10000px] top-0 w-[420px] max-w-[420px] -z-10"
      >
        {ordered.map((id) => {
          const C = REPORT_COMPONENTS[id];
          return (
            <div key={id} className="space-y-3" style={{ background: "#fdf9f2" }}>
              <div className="px-1 pt-1">
                <h3 className="text-sm font-semibold" style={{ color: "#3f3830" }}>
                  {REPORT_TYPE_BY_ID[id]?.label || id}
                </h3>
              </div>
              <C reports={reports} />
              <ReportFooter />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function fmtRange(reports) {
  if (!reports?.rangeStart || !reports?.rangeEnd) return "";
  const a = new Date(reports.rangeStart);
  const b = new Date(reports.rangeEnd);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return "";
  return `${a.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${b.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}