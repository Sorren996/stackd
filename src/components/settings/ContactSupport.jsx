import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, LifeBuoy, Bug, MessageSquare, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getAppVersion } from "@/lib/appVersion";
import MySupportRequests from "@/components/settings/MySupportRequests";
import SectionCard from "@/components/editorial/SectionCard";

const TICKET_TYPES = [
  { key: "support", label: "Get Support", icon: LifeBuoy, desc: "Technical problems or account help." },
  { key: "bug", label: "Report a Problem", icon: Bug, desc: "Bugs or unexpected behavior." },
  { key: "feedback", label: "Send Feedback", icon: MessageSquare, desc: "Suggestions, ideas, or general feedback." },
];

const CATEGORIES = [
  { key: "account", label: "Account" },
  { key: "dexcom", label: "Dexcom / CGM" },
  { key: "glucose", label: "Glucose" },
  { key: "insulin", label: "Insulin / carbs" },
  { key: "journal", label: "Journal" },
  { key: "performance", label: "Performance" },
  { key: "bug", label: "Bug" },
  { key: "feature_request", label: "Feature request" },
  { key: "other", label: "Other" },
];

export default function ContactSupport() {
  const [ticketType, setTicketType] = useState(null);
  const [category, setCategory] = useState("account");
  const [message, setMessage] = useState("");
  const [includeDiagnostics, setIncludeDiagnostics] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const appVersion = getAppVersion();

  const handleSubmit = async () => {
    if (!ticketType) {
      toast.error("Please choose what you need help with.");
      return;
    }
    if (!message.trim()) {
      toast.error("Please add a short message so we can help.");
      return;
    }
    setSubmitting(true);
    try {
      const diagnosticMetadata = includeDiagnostics
        ? {
            app_version: appVersion,
            platform: navigator?.platform || "unknown",
            user_agent: navigator?.userAgent || "unknown",
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            locale: navigator?.language || "unknown",
          }
        : {};

      await base44.entities.SupportTicket.create({
        ticket_type: ticketType,
        category,
        message: message.trim(),
        include_diagnostics: includeDiagnostics,
        app_version: appVersion,
        diagnostic_metadata: diagnosticMetadata,
        status: "open",
      });
      toast.success("Thank you, we received your message and will reach out soon.");
      setTicketType(null);
      setCategory("account");
      setMessage("");
      setIncludeDiagnostics(true);
    } catch {
      toast.error("We couldn't submit your message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <MySupportRequests />

      <SectionCard label="How can we help?">
        <div className="space-y-2.5 pt-3 pb-2">
          {TICKET_TYPES.map((t) => {
            const Icon = t.icon;
            const active = ticketType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTicketType(t.key)}
                className="w-full flex items-center gap-4 rounded-2xl border p-4 transition"
                style={active
                  ? { borderColor: "rgba(91,101,80,0.30)", background: "rgba(91,101,80,0.10)" }
                  : { borderColor: "#eadccf", background: "#fdf9f2" }
                }
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border" style={active ? { borderColor: "rgba(91,101,80,0.30)", background: "rgba(91,101,80,0.10)" } : { borderColor: "#eadccf", background: "#f7f1e8" }}>
                  <Icon className="h-5 w-5" style={{ color: active ? "#4d5742" : "#6b6153" }} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-semibold" style={{ color: active ? "#3f3830" : "#3f3830" }}>{t.label}</p>
                  <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#746959" }}>{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {ticketType && (
        <SectionCard label="Your Message">
          <div className="space-y-4 pt-3 pb-2">
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#746959" }}>Category</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                    style={category === c.key
                      ? { borderColor: "rgba(91,101,80,0.40)", background: "rgba(91,101,80,0.12)", color: "#3f3830" }
                      : { borderColor: "#eadccf", background: "#f7f1e8", color: "#6b6153" }
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#746959" }}>Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                placeholder="Tell us what's happening or what you'd like to share..."
                className="mt-2 w-full rounded-2xl border px-3.5 py-3 text-sm focus:outline-none resize-none"
                style={{ background: "#f7f1e8", borderColor: "#eadccf", color: "#3f3830" }}
              />
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <button
                type="button"
                onClick={() => setIncludeDiagnostics((v) => !v)}
                className="mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition"
                style={includeDiagnostics
                  ? { borderColor: "#4d5742", background: "rgba(91,101,80,0.20)" }
                  : { borderColor: "#eadccf", background: "#f7f1e8" }
                }
              >
                {includeDiagnostics && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#4d5742" }} />}
              </button>
              <div>
                <p className="text-xs font-medium" style={{ color: "#3f3830" }}>Include diagnostic information</p>
                <p className="text-[10px] mt-0.5 leading-relaxed" style={{ color: "#746959" }}>
                  Includes technical information such as app version and connection status. Your password and Dexcom credentials are never included.
                </p>
              </div>
            </label>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !message.trim()}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition disabled:opacity-40"
              style={{ background: "#3f3830", color: "#f7f1e8" }}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {submitting ? "Sending..." : "Send"}
            </button>
          </div>
        </SectionCard>
      )}

      <SectionCard>
        <div className="flex items-start gap-2.5">
          <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "#5b6550" }} />
          <p className="text-[10px] leading-relaxed" style={{ color: "#746959" }}>
            Your message is sent securely and associated with your account. We never receive your password or Dexcom credentials through this form.
          </p>
        </div>
      </SectionCard>
    </div>
  );
}