import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

// Small clickable spike indicator rendered just below the time axis on the
// ActivityGraph. Untagged spikes pulse gently in amber to invite reflection;
// tagged spikes settle into a calm teal.
export default function SpikeMarker({ x, taggedCause, onTag, chartHeight }) {
  const top = chartHeight + 6;

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: x, top, transform: "translateX(-50%)" }}
    >
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTag();
        }}
        whileTap={{ scale: 0.85 }}
        aria-label={taggedCause ? `Spike tagged: ${taggedCause}` : "Reflect on this glucose rise"}
        className="pointer-events-auto flex h-5 w-5 items-center justify-center rounded-full transition hover:brightness-125"
        style={{
          background: taggedCause
            ? "linear-gradient(145deg, rgba(91,168,138,0.5), rgba(91,163,184,0.3))"
            : "linear-gradient(145deg, rgba(251,191,36,0.5), rgba(251,191,36,0.2))",
          border: `1px solid ${taggedCause ? "rgba(91,168,138,0.5)" : "rgba(251,191,36,0.55)"}`,
          boxShadow: taggedCause
            ? "0 2px 10px rgba(91,168,138,0.25), inset 0 1px 1px rgba(255,255,255,0.15)"
            : "0 0 12px rgba(251,191,36,0.4), inset 0 1px 1px rgba(255,255,255,0.15)",
        }}
        animate={
          taggedCause
            ? { scale: 1 }
            : { scale: [1, 1.15, 1] }
        }
        transition={
          taggedCause
            ? { duration: 0.2 }
            : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
        }
      >
        <TrendingUp className="h-3 w-3 text-white/90" />
      </motion.button>
    </div>
  );
}