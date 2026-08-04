import { motion } from "framer-motion";
import { Leaf, MessageCircle } from "lucide-react";

// Renders a CoachInsight as an inline chat-style message inside the scrollable
// conversation. When `acknowledged` is false it shows "Talk about this" and
// "Dismiss insight" actions; once acknowledged it reads as a normal past
// message with no actions (it is a message, not a closable modal).
export default function InsightMessage({ insight, onTalkAbout, onDismiss, acknowledged }) {
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
        className="max-w-[88%] rounded-2xl border p-3"
        style={{
          background: "linear-gradient(145deg, rgba(251,191,36,0.07), rgba(91,168,138,0.04))",
          borderColor: "rgba(251,191,36,0.18)",
        }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300/70">
          Wellness note
        </span>
        <p className="mt-1 text-sm font-semibold text-white">{insight.title}</p>
        <p className="mt-1 text-sm leading-relaxed text-white/70">
          {insight.summary || insight.message}
        </p>
        {!acknowledged && (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {onTalkAbout && (
              <button
                type="button"
                onClick={() => onTalkAbout(insight)}
                className="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium text-white transition hover:bg-white/5"
                style={{
                  background: "linear-gradient(145deg, rgba(91,168,138,0.18), rgba(91,163,184,0.1))",
                  borderColor: "rgba(91,168,138,0.25)",
                }}
              >
                <MessageCircle className="h-3.5 w-3.5 text-teal-300/80" />
                Talk about this
              </button>
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={() => onDismiss(insight)}
                className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-white/55 transition hover:text-white/80"
              >
                Dismiss insight
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}