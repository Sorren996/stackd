import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CloudDownload,
  ChevronDown,
  Clock,
  Smartphone,
  Wifi,
  RefreshCw,
  CloudOff,
} from "lucide-react";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

const ESTIMATED_SYNC_MS = 3 * 60 * 60 * 1000; // 3 hours

const TROUBLESHOOTING_TIPS = [
  {
    Icon: Smartphone,
    title: "Check your Dexcom app or receiver",
    description: "Make sure it's turned on and within range of your sensor.",
  },
  {
    Icon: Wifi,
    title: "Verify cloud sharing is active",
    description:
      "Open your Dexcom app and look for the cloud upload icon — readings need to reach the cloud first.",
  },
  {
    Icon: Clock,
    title: "New sensor warm-up",
    description:
      "If you just started a sensor, it needs 15–30 minutes before readings begin flowing.",
  },
  {
    Icon: RefreshCw,
    title: "Give it a gentle nudge",
    description:
      "Open your Dexcom app to refresh the connection — sometimes the cloud needs a little encouragement.",
  },
  {
    Icon: CloudOff,
    title: "Reconnect if needed",
    description:
      "If readings still haven't appeared after a while, try disconnecting and reconnecting your glucose source.",
  },
];

export default function DexcomSyncStatus() {
  const { connected, connection } = useDexcomConnection();
  const [showHelp, setShowHelp] = useState(false);

  const { data: latestDexcom = [] } = useQuery({
    queryKey: ["latest-dexcom-glucose"],
    queryFn: () => base44.entities.GlucoseReading.filter({ source: { $in: ["dexcom", "dexcom_share"] } }, "-recorded_at", 1),
    enabled: connected,
    staleTime: 60 * 1000,
  });

  const hasDexcomData = latestDexcom.length > 0;

  if (!connected || !connection) return null;
  if (hasDexcomData) return null;

  const connectedAt = connection.connected_at || connection.created_date;
  const connectedTime = connectedAt ? new Date(connectedAt).getTime() : Date.now();
  const elapsedMs = Date.now() - connectedTime;
  const elapsedHours = Math.floor(elapsedMs / (60 * 60 * 1000));
  const elapsedMinutes = Math.floor((elapsedMs % (60 * 60 * 1000)) / (60 * 1000));
  const isOverdue = elapsedMs > ESTIMATED_SYNC_MS;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-teal-500/15 px-4 py-3"
      style={{
        background:
          "linear-gradient(145deg, rgba(91,168,138,0.06), rgba(91,163,184,0.03))",
        backdropFilter: "blur(4px)",
      }}
    >
      <div className="flex items-start gap-3">
        <motion.div
          animate={{ opacity: [0.35, 1, 0.35] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="mt-0.5"
        >
          <CloudDownload className="h-4 w-4 text-teal-300/80" />
        </motion.div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-teal-200/90">
            {isOverdue
              ? "Taking a little longer than expected"
              : "Connecting to your glucose source"}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-white/40">
            {isOverdue
              ? "It's been over 3 hours. Let's make sure everything is set up correctly."
              : "This usually takes 1–3 hours as your readings gently flow in from the cloud."}
          </p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Clock className="h-2.5 w-2.5 text-white/25" />
            <span className="text-[10px] text-white/30">
              {elapsedHours > 0
                ? `${elapsedHours}h ${elapsedMinutes}m`
                : `${elapsedMinutes}m`}{" "}
              since connection
            </span>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isOverdue && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <button
              type="button"
              onClick={() => setShowHelp((v) => !v)}
              className="mt-3 flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left transition hover:bg-white/5"
              style={{
                background: "rgba(255,255,255,0.03)",
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <span className="text-[11px] font-medium text-white/55">
                Troubleshooting tips
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 text-white/40 transition-transform duration-200 ${
                  showHelp ? "rotate-180" : ""
                }`}
              />
            </button>
            <AnimatePresence>
              {showHelp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-2 space-y-2.5">
                    {TROUBLESHOOTING_TIPS.map((tip, idx) => {
                      const Icon = tip.Icon;
                      return (
                        <div key={idx} className="flex items-start gap-2.5">
                          <div
                            className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border"
                            style={{
                              background: "rgba(255,255,255,0.03)",
                              borderColor: "rgba(255,255,255,0.08)",
                            }}
                          >
                            <Icon className="h-3 w-3 text-teal-300/60" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-medium text-white/60">
                              {tip.title}
                            </p>
                            <p className="mt-0.5 text-[10px] leading-relaxed text-white/35">
                              {tip.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}