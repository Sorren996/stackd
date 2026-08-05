import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

// Small clickable spike indicator rendered just below the time axis on the
// ActivityGraph. Untagged spikes pulse gently in amber to invite reflection;
// tagged spikes settle into a calm teal.
export default function SpikeMarker({ x, handled, onTag, chartHeight }) {
  const top = chartHeight + 2;

  return (
    <div
      className="pointer-events-none absolute z-[15]"
      style={{ left: x, top, transform: "translateX(-50%)" }}
    >
      <motion.button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTag();
        }}
        whileTap={{ scale: 0.85 }}
        aria-label={handled ? "Spike reviewed" : "Reflect on this glucose rise"}
        className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full transition hover:brightness-125"
        style={{
          background: handled
            ? "linear-gradient(145deg, rgba(91,168,138,0.55), rgba(91,163,184,0.35))"
            : "linear-gradient(145deg, rgba(251,191,36,0.55), rgba(251,191,36,0.25))",
          border: `1px solid ${handled ? "rgba(91,168,138,0.55)" : "rgba(251,191,36,0.6)"}`,
          boxShadow: handled
            ? "0 2px 8px rgba(91,168,138,0.28), inset 0 1px 1px rgba(255,255,255,0.18)"
            : "0 0 8px rgba(251,191,36,0.4), inset 0 1px 1px rgba(255,255,255,0.18)",
        }}
        animate={
          handled
            ? { scale: 1 }
            : { scale: [1, 1.15, 1] }
        }
        transition={
          handled
            ? { duration: 0.2 }
            : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
        }
      >
        <TrendingUp className="h-3.5 w-3.5 text-white/90" />
      </motion.button>
    </div>
  );
}