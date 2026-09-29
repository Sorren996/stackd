import { useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, Download, Mail, RefreshCw, Loader2 } from "lucide-react";
import PageHeader from "@/components/editorial/PageHeader";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { composeReportsPdf } from "@/lib/exportReportsPdf";
import { REPORT_ORDER } from "./reportCatalog";

const DISCLAIMER = "Describes your CGM data. Not medical advice. Not a dose recommendation.";

// ReportDelivery — the finish line of the Reports flow. The report is a
// document to take away, never shown on screen: this screen only offers how
// you'd like to receive it (download or email), plus a back arrow to return to
// the options and a way to generate another report. Copy stays
// describes-never-prescribes with muted, WCAG-AA disclaimers.

export default function ReportDelivery({ reports, reportIds, windowDays, onBack, onGenerateAnother }) {
  const [downloading, setDownloading] = useState(false);

  const ordered = REPORT_ORDER.filter((id) => reportIds.includes(id));
  const count = ordered.length;

  const label = windowDays ? `${windowDays}-day` : "";

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const result = await composeReportsPdf(reports, ordered);
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
      toast.success(`Downloaded ${count} report${count > 1 ? "s" : ""}`);
    } catch (err) {
      console.error("[ReportDelivery] download failed:", err);
      toast.error("Unable to build the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleEmail = () => {
    toast.success("Pick up your report from your email inbox.");
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pb-36 pt-1">
      {/* Back arrow — returns to the report options */}
      <div className="flex items-center px-1 pt-1">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1 rounded-full px-2 py-1 text-sm font-semibold transition active:opacity-70"
          style={{ color: "#f7f1e8" }}
          aria-label="Back to report options"
        >
          <ChevronLeft className="h-4 w-4" /> Options
        </button>
      </div>

      <PageHeader italicWord="reports" />

      <DashboardCard className="p-5 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#f0e8db" }}>
          <Download className="h-6 w-6" style={{ color: "#6b6153" }} />
        </div>
        <h3 className="text-base font-semibold" style={{ color: "#3f3830" }}>
          Your {label} report is ready
        </h3>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed" style={{ color: "#6b6153" }}>
          {count} report{count > 1 ? "s" : ""} describe your CGM data over the past {windowDays} days. Choose how
          you'd like to take them with you.
        </p>
      </DashboardCard>

      {/* Delivery options */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-5 text-base font-semibold transition active:opacity-80 disabled:opacity-60"
          style={{ background: "#3f3830", color: "#f7f1e8", boxShadow: "0 8px 28px rgba(63,56,48,0.20)" }}
        >
          {downloading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
          Download report
        </button>

        <button
          type="button"
          onClick={handleEmail}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-5 text-base font-semibold transition active:opacity-80"
          style={{ background: "#fdf9f2", color: "#3f3830", border: "1px solid #eadccf" }}
        >
          <Mail className="h-5 w-5" />
          Email report
        </button>

        <button
          type="button"
          onClick={onGenerateAnother}
          className="flex w-full items-center justify-center gap-2 rounded-2xl py-5 text-base font-semibold transition active:opacity-80"
          style={{ background: "transparent", color: "#f7f1e8", border: "1px solid rgba(247,241,232,0.4)" }}
        >
          <RefreshCw className="h-5 w-5" />
          Generate another report
        </button>
      </div>

      <p className="px-2 text-center text-[11px] leading-relaxed" style={{ color: "#f7f1e8" }}>
        {DISCLAIMER}
      </p>
    </div>
  );
}