import { motion } from "framer-motion";
import { ArrowUp } from "lucide-react";

// Small clickable spike indicator rendered just below the time axis.
// Untagged spikes pulse gently in amber; tagged spikes settle into teal.
export default function SpikeMarker({ x, handled, onTag, chartHeight }) {
  const top = chartHeight + 4;
  const color = handled ? "rgba(91,168,138,0.7)" : "rgba(251,191,36,0.7)";

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
        className="pointer-events-auto flex h-4 w-4 items-center justify-center transition hover:brightness-125"
        animate={
          handled
            ? { scale: 1 }
            : { scale: [1, 1.2, 1] }
        }
        transition={
          handled
            ? { duration: 0.2 }
            : { duration: 2.2, repeat: Infinity, ease: "easeInOut" }
        }
      >
        <ArrowUp className="h-3.5 w-3.5" style={{ color }} strokeWidth={2.5} />
      </motion.button>
    </div>
  );
}