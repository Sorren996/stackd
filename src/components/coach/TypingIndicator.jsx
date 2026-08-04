import { motion } from "framer-motion";
import { Leaf } from "lucide-react";

// Pinned-to-bottom typing indicator. Renders above the input bar so the
// user always sees that their message was received while the coach responds.
export default function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ duration: 0.2 }}
      className="flex items-center gap-2 px-1 pb-1.5 pt-2"
      aria-live="polite"
      aria-label="Coach is responding"
    >
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{ background: "radial-gradient(circle, rgba(91,168,138,0.22) 0%, rgba(91,163,184,0.06) 70%, transparent 100%)" }}
      >
        <motion.span
          animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <Leaf className="h-3.5 w-3.5 text-teal-300/80" />
        </motion.span>
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border px-3.5 py-2"
        style={{
          background: "linear-gradient(145deg, rgba(255,255,255,0.05), rgba(255,255,255,0.015))",
          borderColor: "rgba(255,255,255,0.10)",
        }}
      >
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="block h-1.5 w-1.5 rounded-full bg-teal-300/70"
            animate={{ opacity: [0.3, 0.9, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: i * 0.15 }}
          />
        ))}
        <span className="ml-1 text-[11px] font-medium text-white/45">Coach is reflecting…</span>
      </div>
    </motion.div>
  );
}