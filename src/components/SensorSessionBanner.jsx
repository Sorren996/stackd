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
            className="flex w-full max-w-md items-center gap-2 rounded-2xl border px-4 py-2"
            style={{
              borderColor: "#eadccf",
              background: "#fdf9f2",
              boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)",
            }}
          >
            <Clock className="h-4 w-4 shrink-0" style={{ color: "#8a5a12" }} />
            <span className="text-xs font-medium leading-tight" style={{ color: "#8a5a12" }}>
              {message}
            </span>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}