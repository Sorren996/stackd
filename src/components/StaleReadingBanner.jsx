import { motion, AnimatePresence } from "framer-motion";
import { CloudOff } from "lucide-react";

// Calm, supportive banner shown when a Dexcom-connected user's CGM stream
// has gone quiet. Replaces the old soft "this reading's a bit old" nudge
// and fades out automatically the moment fresh readings resume.
export default function StaleReadingBanner({ visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -6, height: 0 }}
          animate={{ opacity: 1, y: 0, height: "auto" }}
          exit={{ opacity: 0, y: -6, height: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="overflow-hidden"
        >
          <div
            className="mt-3 overflow-hidden rounded-2xl border px-4 py-3"
            style={{
              borderColor: "rgba(217,169,56,0.28)",
              background:
                "linear-gradient(145deg, rgba(217,169,56,0.07), rgba(217,169,56,0.02))",
              boxShadow:
                "0 0 24px rgba(217,169,56,0.12), inset 0 0 28px rgba(217,169,56,0.08)",
              backdropFilter: "blur(4px)",
            }}
          >
            <div className="flex items-start gap-3">
              <motion.div
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
                className="mt-0.5 shrink-0"
              >
                <CloudOff
                  className="h-4 w-4"
                  style={{ color: "rgba(217,169,56,0.85)" }}
                />
              </motion.div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-semibold"
                  style={{ color: "rgba(217,169,56,0.95)" }}
                >
                  No recent updates from your glucose source
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-white/55">
                  Check your Dexcom app for connectivity and follow their guidance
                  — we'll reconnect automatically the moment fresh readings
                  arrive.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}