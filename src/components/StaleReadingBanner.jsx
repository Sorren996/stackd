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
              borderColor: "#eadccf",
              background: "#fdf9f2",
              boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)",
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
                  style={{ color: "#8a5a12" }}
                />
              </motion.div>
              <div className="min-w-0 flex-1">
                <p
                  className="text-xs font-semibold"
                  style={{ color: "#8a5a12" }}
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