import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Download, Mail, Send, X, Check, Loader2 } from "lucide-react";
import PageHeader from "@/components/editorial/PageHeader";
import DashboardCard from "@/components/dashboard/DashboardCard";
import Sheet from "@/components/Sheet";
import TirBandCard from "@/components/insights/TirBandCard";
import PatternCard from "@/components/insights/PatternCard";
import BestDayCard from "@/components/insights/BestDayCard";
import InsightSkeleton from "@/components/insights/InsightSkeleton";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { downloadBase64Pdf } from "@/lib/pdfDownload";

const WINDOWS = [7, 14, 30, 90];

const DISCLAIMER =
  "Describes your CGM data. Not medical advice. Not a dose recommendation.";

export default function Insights() {
  const { connected, isLoading: dexcomLoading } = useDexcomConnection();
  const [windowDays, setWindowDays] = useState(14);
  const [downloading, setDownloading] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [copySelf, setCopySelf] = useState(true);
  const [sending, setSending] = useState(false);

  const { data: insights, isLoading } = useQuery({
    queryKey: ["insights", windowDays],
    queryFn: async () => {
      const res = await base44.functions.invoke("computeInsights", {
        windowDays,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      return res.data;
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    enabled: connected && !dexcomLoading,
  });

  // Prefill recipient with the user's own email when the connection data arrives.
  useEffect(() => {
    if (insights?.meta?.email && !recipient) {
      setRecipient(insights.meta.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insights?.meta?.email]);

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
    } catch (e) {
      toast.error("Unable to build the PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  const handleSendEmail = async () => {
    const email = recipient.trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Enter a valid email address.");
      return;
    }
    setSending(true);
    try {
      const res = await base44.functions.invoke("generateInsightsPdf", {
        mode: "email",
        windowDays,
        recipient: email,
        copySelf,
        tzOffsetMinutes: new Date().getTimezoneOffset(),
      });
      if (res.data?.sent) {
        toast.success("Report on its way");
        setEmailOpen(false);
      } else {
        toast.error(res.data?.error || "Unable to send the report.");
      }
    } catch (e) {
      toast.error("Unable to send the report. Please try again.");
    } finally {
      setSending(false);
    }
  };

  // Access gate: manual-log users get a static empty state.
  if (dexcomLoading) {
    return (
      <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
        <PageHeader italicWord="insights" />
        <InsightSkeleton />
      </div>
    );
  }

  if (!connected) {
    return (
      <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
        <PageHeader italicWord="insights" />
        <DashboardCard className="p-6 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "#f0e8db" }}>
            <Mail className="h-6 w-6" style={{ color: "#6b6153" }} />
          </div>
          <h3 className="text-base font-semibold" style={{ color: "#3f3830" }}>
            Insights need CGM data
          </h3>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed" style={{ color: "#6b6153" }}>
            Pattern detection is only truthful with readings every few minutes. Connect your Dexcom to unlock Insights.
          </p>
          <p
            className="mx-auto mt-6 max-w-xs text-xs leading-relaxed"
            style={{ color: "#746959" }}
          >
            {DISCLAIMER}
          </p>
        </DashboardCard>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
      <PageHeader italicWord="insights" />

      {/* Window control + PDF actions */}
      <div className="flex flex-col gap-3">
        <div className="inline-flex self-start rounded-full p-1" style={{ background: "#f0e8db" }}>
          {WINDOWS.map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => setWindowDays(w)}
              className="min-w-[52px] rounded-full px-3 py-1.5 text-xs font-semibold transition"
              style={{
                background: windowDays === w ? "#3f3830" : "transparent",
                color: windowDays === w ? "#f7f1e8" : "#6b6153",
              }}
              aria-pressed={windowDays === w}
            >
              {w}d
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition active:opacity-70 disabled:opacity-60"
            style={{ background: "#3f3830", color: "#f7f1e8" }}
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {downloading ? "Preparing…" : "Download PDF"}
          </button>
          <button
            type="button"
            onClick={() => setEmailOpen(true)}
            disabled={isLoading}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold transition active:opacity-70 disabled:opacity-60"
            style={{ background: "#fdf9f2", color: "#3f3830", border: "1px solid #eadccf" }}
          >
            <Mail className="h-4 w-4" />
            Email
          </button>
        </div>
      </div>

      {isLoading ? (
        <>
          <DashboardCard className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full" style={{ background: "#f0e8db" }}>
                <div className="h-full w-full origin-left animate-[indeterminate_1.4s_ease-in-out_infinite]" style={{ background: "#9c5228" }} />
              </div>
              <span className="shrink-0 text-xs" style={{ color: "#6b6153" }}>
                One moment while we gather some insight.
              </span>
            </div>
          </DashboardCard>
          <InsightSkeleton />
        </>
      ) : (
        insights && (
          <>
            <TirBandCard tir={insights.tir} gates={insights.gates} />

            {insights.patterns?.length > 0 ? (
              <div className="space-y-4">
                <div className="section-label">Recurring windows</div>
                {insights.patterns.map((p, i) => (
                  <PatternCard key={i} pattern={p} />
                ))}
              </div>
            ) : (
              <DashboardCard className="p-5">
                <div className="section-label">Recurring windows</div>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: "#6b6153" }}>
                  {insights.gates?.passTir
                    ? "No recurring high or low windows detected in this period."
                    : insights.gates?.tirMessage || "Not enough data yet."}
                </p>
              </DashboardCard>
            )}

            <BestDayCard bestDay={insights.bestDay} />

            <p className="px-2 text-xs leading-relaxed" style={{ color: "#746959" }}>
              {DISCLAIMER}
            </p>
          </>
        )
      )}

      <style>{`@keyframes indeterminate { 0% { transform: translateX(-100%);} 50% { transform: translateX(0);} 100% { transform: translateX(100%);} }`}</style>

      {/* Email sheet */}
      <Sheet open={emailOpen} onClose={() => !sending && setEmailOpen(false)}>
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold" style={{ color: "#3f3830" }}>Email the report</h2>
            <button
              type="button"
              onClick={() => setEmailOpen(false)}
              disabled={sending}
              className="flex h-8 w-8 items-center justify-center rounded-full disabled:opacity-40"
              style={{ background: "#f0e8db" }}
              aria-label="Close"
            >
              <X className="h-4 w-4" style={{ color: "#3f3830" }} />
            </button>
          </div>

          <label className="block text-sm font-medium" style={{ color: "#3f3830" }}>
            Recipient email
          </label>
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value)}
            className="mt-2 w-full rounded-xl border px-4 py-3 text-base outline-none"
            style={{ background: "#f7f1e8", borderColor: "#eadccf", color: "#000" }}
          />

          <button
            type="button"
            onClick={() => setCopySelf((v) => !v)}
            className="mt-4 flex w-full items-center gap-3 rounded-xl px-2 py-3 text-left"
          >
            <span
              className="flex h-6 w-6 items-center justify-center rounded-md transition"
              style={{ background: copySelf ? "#3f3830" : "#f0e8db" }}
              aria-hidden="true"
            >
              {copySelf && <Check className="h-4 w-4" style={{ color: "#f7f1e8" }} />}
            </span>
            <span className="text-sm" style={{ color: "#3f3830" }}>
              Send a copy to myself
            </span>
          </button>
          <p className="mt-1 px-2 text-xs" style={{ color: "#746959" }}>
            {insights?.meta?.email ? `A copy goes to ${insights.meta.email}.` : "A copy goes to your account email."}
          </p>

          <button
            type="button"
            onClick={handleSendEmail}
            disabled={sending || !recipient.trim()}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold transition active:opacity-80 disabled:opacity-50"
            style={{ background: "#3f3830", color: "#f7f1e8" }}
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            {sending ? "Sending…" : "Send report"}
          </button>
        </div>
      </Sheet>
    </div>
  );
}