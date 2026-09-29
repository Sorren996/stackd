import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Mail } from "lucide-react";
import PageHeader from "@/components/editorial/PageHeader";
import DashboardCard from "@/components/dashboard/DashboardCard";
import InsightSkeleton from "@/components/insights/InsightSkeleton";
import ReportPicker from "@/components/reports/ReportPicker";
import ReportDelivery from "@/components/reports/ReportDelivery";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";

const DISCLAIMER = "Describes your CGM data. Not medical advice. Not a dose recommendation.";

// Insights — the multi-report engine behind the Insights tab. Picks a date
// range and report set, generates the deterministic computeReports bundle,
// then delivers it as a document to take away (download or email). The report
// content never renders on screen — the page stays on the options / progress /
// delivery steps and never scrolls to report content.

export default function Insights() {
  const { connected, isLoading: dexcomLoading } = useDexcomConnection();

  // State machine: "options" → "generating" → "done".
  const [stage, setStage] = useState("options");
  const [request, setRequest] = useState(null); // { windowDays, reportIds }
  const [reports, setReports] = useState(null);
  const [error, setError] = useState(null);

  const handleGenerate = async ({ windowDays, reportIds }) => {
    setError(null);
    setReports(null);
    setStage("generating");
    try {
      const res = await base44.functions.invoke("computeReports", {
        windowDays,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      setReports(res.data);
      setRequest({ windowDays, reportIds });
      setStage("done");
    } catch {
      setError("Sorry, we couldn't gather that report just now. Please try again.");
      setStage("options");
    }
  };

  const handleBackToOptions = () => {
    setRequest(null);
    setReports(null);
    setStage("options");
  };

  const handleGenerateAnother = () => {
    setRequest(null);
    setReports(null);
    setStage("options");
  };

  // Access gate: manual-log users get a static empty state.
  if (dexcomLoading) {
    return (
      <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
        <PageHeader italicWord="reports" />
        <InsightSkeleton />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
        <PageHeader italicWord="reports" />
        <DashboardCard className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#f0e8db" }}>
            <Mail className="h-6 w-6" style={{ color: "#6b6153" }} />
          </div>
          <h3 className="text-base font-semibold" style={{ color: "#3f3830" }}>
            Reports need CGM data
          </h3>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed" style={{ color: "#6b6153" }}>
            These pattern and overlay reports are only truthful with readings every few minutes. Connect your Dexcom to
            unlock Reports.
          </p>
          <p className="mx-auto mt-6 max-w-xs text-xs leading-relaxed" style={{ color: "#746959" }}>
            {DISCLAIMER}
          </p>
        </DashboardCard>
      </div>
    );
  }

  // Delivery state — the report is ready as a document to take away.
  if (stage === "done" && reports && request) {
    return (
      <ReportDelivery
        reports={reports}
        reportIds={request.reportIds}
        windowDays={request.windowDays}
        onBack={handleBackToOptions}
        onGenerateAnother={handleGenerateAnother}
      />
    );
  }

  // Generating — the options are removed, replaced with a centered progress
  // card. The card is vertically centered in the content area (between the
  // fixed header and the bottom nav) rather than pinned to the top.
  if (stage === "generating") {
    return (
      <>
        <div
          className="mx-auto flex max-w-md flex-col justify-center px-4"
          style={{ minHeight: "calc(100dvh - 3.5rem - 7rem)" }}
        >
          <PageHeader italicWord="reports" />
          <DashboardCard className="p-6">
            <div className="space-y-4">
              <div className="space-y-1.5 text-center">
                <h2 className="text-lg font-semibold leading-snug" style={{ color: "#3f3830" }}>
                  Generating your report…
                </h2>
                <p className="text-sm leading-relaxed" style={{ color: "#6b6153" }}>
                  Gathering your glucose range into a document you can keep.
                </p>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "#f0e8db" }}>
                <div
                  className="h-full w-full origin-left animate-[indeterminate_1.4s_ease-in-out_infinite]"
                  style={{ background: "#9c5228" }}
                />
              </div>
            </div>
          </DashboardCard>
          <p className="mt-5 px-2 text-center text-[11px] leading-relaxed" style={{ color: "#f7f1e8" }}>
            {DISCLAIMER}
          </p>
        </div>
        <style>{`@keyframes indeterminate { 0% { transform: translateX(-100%);} 50% { transform: translateX(0);} 100% { transform: translateX(100%);} }`}</style>
      </>
    );
  }

  // Options state — default. Shows an inline error note if the last run failed.
  return (
    <>
      <ReportPicker onGenerate={handleGenerate} />

      {error && (
        <div className="mx-auto -mt-8 max-w-md pb-4">
          <DashboardCard className="p-4">
            <p className="text-sm leading-relaxed" style={{ color: "#6b6153" }}>{error}</p>
          </DashboardCard>
        </div>
      )}
    </>
  );
}