import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, LifeBuoy, Bug, MessageSquare, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { getAppVersion } from "@/lib/appVersion";
import MySupportRequests from "@/components/settings/MySupportRequests";

const TICKET_TYPES = [
  { key: "support", label: "Get Support", icon: LifeBuoy, desc: "Technical problems or account help." },
  { key: "bug", label: "Report a Problem", icon: Bug, desc: "Bugs or unexpected behavior." },
  { key: "feedback", label: "Send Feedback", icon: MessageSquare, desc: "Suggestions, ideas, or general feedback." },
];

const CATEGORIES = [
  { key: "account", label: "Account" },
  { key: "dexcom", label: "Dexcom / CGM connection" },
  { key: "glucose", label: "Glucose data" },
  { key: "insulin", label: "Insulin / carb logging" },
  { key: "journal", label: "Journal" },
  { key: "performance", label: "App performance" },
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
      toast.success("Thank you — we received your message and will reach out soon.");
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

      {/* Ticket type selection */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider px-1">How can we help?</h3>
        <div className="space-y-2.5">
          {TICKET_TYPES.map((t) => {
            const Icon = t.icon;
            const active = ticketType === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTicketType(t.key)}
                className="w-full flex items-center gap-4 rounded-3xl border p-4 transition"
                style={active
                  ? { borderColor: "rgba(91,101,80,0.30)", background: "rgba(91,101,80,0.10)" }
                  : { borderColor: "#eadccf", background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }
                }
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border" style={active ? { borderColor: "rgba(91,101,80,0.30)", background: "rgba(91,101,80,0.10)" } : { borderColor: "#eadccf", background: "#f7f1e8" }}>
                  <Icon className="h-5 w-5" style={{ color: active ? "#5b6550" : "#8a7f70" }} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className={`text-sm font-semibold ${active ? "text-white" : "text-white/80"}`}>{t.label}</p>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{t.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form */}
      {ticketType && (
        <div className="space-y-4 glass-card rounded-3xl border p-4" style={{ background: "#fdf9f2", borderColor: "#eadccf", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}>
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Category</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                  style={category === c.key
                    ? { borderColor: "rgba(91,101,80,0.40)", background: "rgba(91,101,80,0.12)", color: "#3f3830" }
                    : { borderColor: "#eadccf", background: "#f7f1e8", color: "#8a7f70" }
                  }
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Tell us what's happening or what you'd like to share..."
              className="mt-2 w-full rounded-2xl border px-3.5 py-3 text-sm text-white placeholder:text-white/30 focus:outline-none resize-none"
              style={{ background: "#f7f1e8", borderColor: "#eadccf" }}
            />
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <button
              type="button"
              onClick={() => setIncludeDiagnostics((v) => !v)}
              className="mt-0.5 h-5 w-5 shrink-0 rounded-md border flex items-center justify-center transition"
              style={includeDiagnostics
                ? { borderColor: "#5b6550", background: "rgba(91,101,80,0.20)" }
                : { borderColor: "#eadccf", background: "#f7f1e8" }
              }
            >
              {includeDiagnostics && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "#5b6550" }} />}
            </button>
            <div>
              <p className="text-xs font-medium text-white/70">Include diagnostic information</p>
              <p className="text-[10px] text-white/35 mt-0.5 leading-relaxed">
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
      )}

      {/* Privacy reassurance */}
      <div className="flex items-start gap-2.5 px-2">
        <ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "#5b6550" }} />
        <p className="text-[10px] text-white/30 leading-relaxed">
          Your message is sent securely and associated with your account. We never receive your password or Dexcom credentials through this form.
        </p>
      </div>
    </div>
  );
}