// Problem section visual — shows the scattered information a person juggles
// before a dose (glucose, IOB, carbs, settings, history, range), then
// transitions to Stackd bringing the relevant pieces together into one
// clean review. Restrained composition, not an infographic of boxes.
import { motion } from "framer-motion";
import { Check } from "lucide-react";

const SCATTERED = [
  { text: "142 mg/dL", rotate: -3 },
  { text: "3u on board", rotate: 2 },
  { text: "45g carbs", rotate: -1 },
  { text: "1:10 IC ratio", rotate: 4 },
  { text: "Last dose 3h ago", rotate: -2 },
  { text: "Target 80–180", rotate: 1 },
];

export default function ProblemVisual() {
  return (
    <div className="mt-10 space-y-8">
      {/* Scattered pieces */}
      <div className="flex flex-wrap justify-center gap-2.5">
        {SCATTERED.map((piece, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: i * 0.05 }}
            className="rounded-full px-3.5 py-2 text-xs font-medium text-white/55"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              transform: `rotate(${piece.rotate}deg)`,
            }}
          >
            {piece.text}
          </motion.span>
        ))}
      </div>

      {/* Convergence arrow */}
      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4, delay: 0.3 }}
        className="flex justify-center"
      >
        <div className="flex flex-col items-center gap-1">
          <div className="h-8 w-px bg-white/15" />
          <div className="h-2 w-2 rounded-full bg-white/20" />
        </div>
      </motion.div>

      {/* Converged result */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="mx-auto max-w-sm rounded-2xl p-5"
        style={{
          background: "linear-gradient(165deg, rgba(54,168,138,0.08), rgba(46,140,116,0.04))",
          border: "1px solid rgba(54,168,138,0.18)",
          boxShadow: "0 12px 40px rgba(54,168,138,0.08)",
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
            style={{ background: "rgba(54,168,138,0.15)", border: "1px solid rgba(54,168,138,0.30)" }}
          >
            <Check className="h-4 w-4" style={{ color: "#5ba88a" }} strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">One review</p>
            <p className="mt-0.5 text-xs text-white/50">The relevant pieces, together</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}