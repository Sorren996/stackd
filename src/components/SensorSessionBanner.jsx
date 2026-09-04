import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";
import { useSensorSession } from "@/hooks/useSensorSession";
import { isInGracePeriod, isFullyExpired } from "@/lib/sensorSession";

/**
 * Slim banner shown at the top of the Dashboard when the current CGM sensor
 * session has less than 24 hours of wear time left. It is sticky to the top
 * of the page (just under the header) so it stays planted while the page
 * scrolls. Tapping it opens Settings to log a new session start.
 */
export default function SensorSessionBanner() {
  const { showBanner, remainingMs } = useSensorSession();
  const grace = isInGracePeriod(remainingMs);
  const fullyExpired = isFullyExpired(remainingMs);

  const message = grace
    ? "Grace period — sensor may still read. Have your next one ready."
    : fullyExpired
      ? "Session ended — time to start your next sensor."
      : "Your sensor session is wrapping up soon — a good time to have your next one ready.";

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          key="sensor-session-banner"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="sticky top-14 z-40 flex justify-center px-4"
        >
          <Link
            to="/settings"
            className="flex w-full max-w-md items-center gap-2 rounded-2xl border px-4 py-2 backdrop-blur-md"
            style={{
              background: "linear-gradient(145deg, rgba(217,169,56,0.20), rgba(217,169,56,0.08))",
              borderColor: "rgba(217,169,56,0.38)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.16), 0 0 18px rgba(217,169,56,0.14)",
            }}
          >
            <Clock className="h-4 w-4 shrink-0" style={{ color: "rgba(230,190,110,0.95)" }} />
            <span className="text-xs font-medium leading-tight" style={{ color: "rgba(244,214,150,0.95)" }}>
              {message}
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}