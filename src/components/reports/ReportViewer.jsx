import { useRef, useState, useCallback } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { downloadBase64Pdf } from "@/lib/pdfDownload";
import { REPORT_ORDER, REPORT_TYPE_BY_ID } from "./reportCatalog";
import { ReportHeader, ReportFooter } from "./reportShared";
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
// Each report is one slide; arrows + swipe move between slides. The header
// holds a share/download affordance and a Done button back to the picker.

export default function ReportViewer({ reports, reportIds, onBack, windowDays }) {
  const ordered = REPORT_ORDER.filter((id) => reportIds.includes(id));
  const [index, setIndex] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const scrollRef = useRef(null);

  const activeReport = ordered[index];
  const Active = REPORT_COMPONENTS[activeReport];
  const meta = reports?.meta || {};

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
      const res = await base44.functions.invoke("generateInsightsPdf", {
        mode: "download",
        windowDays,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      const ok = downloadBase64Pdf(res.data.base64, res.data.filename);
      if (!ok) toast.error("Unable to build the PDF. Please try again.");
      else toast.success("Report downloaded");
    } catch {
      toast.error("Unable to build the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="flex h-[calc(100dvh-0px)] flex-col">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 pb-2 pt-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold transition active:opacity-70"
          style={{ background: "rgba(253,249,242,0.10)", color: "#f7f1e8" }}
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="text-xs font-semibold tabular-nums" style={{ color: "#f7f1e8", opacity: 0.92 }}>
          {index + 1} of {ordered.length}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold transition active:opacity-70 disabled:opacity-50"
          style={{ background: "rgba(253,249,242,0.10)", color: "#f7f1e8" }}
          aria-label="Download report as PDF"
        >
          {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          <span className="hidden sm:inline">PDF</span>
        </button>
      </div>

      {/* Title line with the selected report name */}
      <div className="px-2 pb-2">
        <ReportHeader reports={reports} />
        <div className="mt-2 px-1">
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            style={{ background: "rgba(253,249,242,0.12)", color: "#f7f1e8" }}
          >
            {REPORT_TYPE_BY_ID[activeReport]?.label || activeReport}
          </span>
        </div>
      </div>

      {/* Slide content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="no-scrollbar flex-1 snap-x snap-mandatory overflow-x-auto"
      >
        {ordered.map((id, i) => {
          const C = REPORT_COMPONENTS[id];
          return (
            <section
              key={id}
              className="h-full w-full shrink-0 snap-center overflow-y-auto px-4 pb-10"
              style={{ scrollSnapAlign: "center" }}
            >
              {i === index && C ? (
                <div className="mx-auto max-w-md space-y-4">
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

      {/* Slide dots + arrows */}
      <div className="flex items-center justify-between px-4 py-3">
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
    </div>
  );
}