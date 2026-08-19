import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { HeartPulse, ChevronRight, AlertCircle } from "lucide-react";

// Warm, non-blocking invitation to connect a glucose source. Shows on the
// Dashboard when no Dexcom connection is active — whether the user has never
// connected, or a previous connection needs a little attention. Stale readings
// never disconnect the account; this only appears when there's genuinely no
// active connection.
export default function ConnectGlucoseSourcePrompt({ connection }) {
  const needsAttention =
    connection?.status === "error" || connection?.status === "disconnected";

  const title = needsAttention
    ? "Your glucose source needs a little attention"
    : "Bring your glucose story to life";
  const body = needsAttention
    ? "Let's reconnect your Dexcom account so your readings can flow in gently again."
    : "Connect your Dexcom account and your readings will flow in gently and automatically — no manual logging needed.";
  const cta = needsAttention
    ? "Reconnect your glucose source"
    : "Connect your glucose source";

  const accent = needsAttention
    ? {
        border: "rgba(217,169,56,0.28)",
        bg: "linear-gradient(145deg, rgba(217,169,56,0.06), rgba(217,169,56,0.02))",
        glow: "0 0 24px rgba(217,169,56,0.10), inset 0 0 28px rgba(217,169,56,0.06)",
        text: "rgba(217,169,56,0.95)",
        ctaBorder: "rgba(217,169,56,0.3)",
      }
    : {
        border: "rgba(91,168,138,0.22)",
        bg: "linear-gradient(145deg, rgba(91,168,138,0.06), rgba(91,163,184,0.03))",
        glow: "0 0 24px rgba(91,168,138,0.10), inset 0 0 28px rgba(91,168,138,0.05)",
        text: "rgba(91,168,138,0.95)",
        ctaBorder: "rgba(91,168,138,0.3)",
      };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="overflow-hidden rounded-2xl border px-4 py-3.5"
      style={{
        borderColor: accent.border,
        background: accent.bg,
        boxShadow: accent.glow,
        backdropFilter: "blur(4px)",
      }}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 shrink-0">
          {needsAttention ? (
            <AlertCircle className="h-4 w-4" style={{ color: accent.text }} />
          ) : (
            <HeartPulse className="h-4 w-4" style={{ color: accent.text }} />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold" style={{ color: accent.text }}>
            {title}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">{body}</p>
        </div>
      </div>
      <Link
        to="/settings/dexcom"
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold transition hover:bg-white/5"
        style={{
          borderColor: accent.ctaBorder,
          background: "rgba(255,255,255,0.03)",
          color: accent.text,
        }}
      >
        {cta}
        <ChevronRight className="h-3.5 w-3.5" />
      </Link>
    </motion.div>
  );
}