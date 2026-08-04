import { motion } from "framer-motion";
import { Leaf, MessageCircle } from "lucide-react";

// Renders a CoachInsight as an inline chat-style message. While unread it uses
// an amber highlight with "Talk about this" / "Dismiss insight" actions. Once
// acknowledged (any interaction) it turns to a neutral, read-only message —
// no buttons, no amber — and the conversation flows underneath it.
export default function InsightMessage({ insight, onTalkAbout, onDismiss, acknowledged }) {
  const accent = acknowledged
    ? {
        avatarBg: "radial-gradient(circle, rgba(91,168,138,0.2) 0%, rgba(91,163,184,0.06) 70%, transparent 100%)",
        leafClass: "text-teal-300/80",
        labelClass: "text-white/40",
        bubbleBg: "linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
        bubbleBorder: "rgba(255,255,255,0.1)",
      }
    : {
        avatarBg: "radial-gradient(circle, rgba(251,191,36,0.22) 0%, transparent 70%)",
        leafClass: "text-amber-300/90",
        labelClass: "text-amber-300/70",
        bubbleBg: "linear-gradient(145deg, rgba(251,191,36,0.07), rgba(91,168,138,0.04))",
        bubbleBorder: "rgba(251,191,36,0.18)",
      };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      className="flex items-start gap-2.5"
    >
      <div
        className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: accent.avatarBg }}
      >
        <Leaf className={`h-3.5 w-3.5 ${accent.leafClass}`} />
      </div>
      <div
        className="max-w-[88%] rounded-2xl border p-3 transition-colors duration-300"
        style={{ background: accent.bubbleBg, borderColor: accent.bubbleBorder }}
      >
        <span className={`text-[10px] font-bold uppercase tracking-wider ${accent.labelClass}`}>
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