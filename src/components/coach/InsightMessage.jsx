import { motion } from "framer-motion";
import { Leaf, MessageCircle, X } from "lucide-react";

// Renders an unread CoachInsight as an inline chat-style message inside the
// scrollable conversation area (not a modal/card above it). The user can scroll
// up to read previous messages without acknowledging. "Talk about this" sends
// the insight into the conversation and marks it read; "Dismiss" marks it
// dismissed — both clear the glow.
export default function InsightMessage({ insight, onTalkAbout, onDismiss }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex items-start gap-2.5"
    >
      <div
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: "radial-gradient(circle, rgba(251,191,36,0.22) 0%, transparent 70%)" }}
      >
        <Leaf className="h-3.5 w-3.5 text-amber-300/90" />
      </div>
      <div
        className="flex-1 rounded-2xl border p-3"
        style={{
          background: "linear-gradient(145deg, rgba(251,191,36,0.07), rgba(91,168,138,0.04))",
          borderColor: "rgba(251,191,36,0.18)",
        }}
      >
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/70">
            Wellness note
          </span>
          {onDismiss && (
            <button
              type="button"
              onClick={() => onDismiss(insight)}
              aria-label="Dismiss insight"
              className="flex h-6 w-6 items-center justify-center rounded-full text-white/35 transition hover:text-white/70"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="text-sm font-semibold text-white">{insight.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-white/70">
          {insight.summary || insight.message}
        </p>
        {onTalkAbout && (
          <button
            type="button"
            onClick={() => onTalkAbout(insight)}
            className="mt-2.5 flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/5"
            style={{
              background: "linear-gradient(145deg, rgba(91,168,138,0.18), rgba(91,163,184,0.1))",
              borderColor: "rgba(91,168,138,0.25)",
            }}
          >
            <MessageCircle className="h-3.5 w-3.5 text-teal-300/80" />
            Talk about this
          </button>
        )}
      </div>
    </motion.div>
  );
}