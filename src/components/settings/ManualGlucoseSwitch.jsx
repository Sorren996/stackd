import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { cacheManualGlucoseEnabled } from "@/lib/manualGlucose";
import { disconnectDexcom } from "@/lib/dexcomDisconnect";
import DeleteConfirmDialog from "@/components/insulin/DeleteConfirmDialog";
import SectionCard from "@/components/editorial/SectionCard";

/**
 * The one hand-logging switch in the app. Sensor and hand-entered readings
 * can't share the same line, so it only reads as on while no CGM is feeding
 * the app, and switching it on while one is connected goes through the shared
 * disconnect path — never quietly.
 */
export default function ManualGlucoseSwitch() {
  const { settings, save, isSaving } = useUserSettings();
  const queryClient = useQueryClient();
  const { connected: dexcomConnected } = useDexcomConnection();
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const manualGlucoseEnabled =
    settings?.manual_glucose_logging_enabled !== false && !dexcomConnected;

  const setManualGlucose = (next) => {
    cacheManualGlucoseEnabled(next);
    save({ manual_glucose_logging_enabled: next });
  };

  const handleToggle = () => {
    if (isSaving || disconnecting) return;
    if (manualGlucoseEnabled) {
      setManualGlucose(false);
      return;
    }
    // Never quietly kill a working connection: confirm first.
    if (dexcomConnected) {
      setConfirmingDisconnect(true);
      return;
    }
    setManualGlucose(true);
  };

  const handleConfirmDisconnect = async () => {
    setDisconnecting(true);
    try {
      await disconnectDexcom(queryClient);
      setManualGlucose(true);
      setConfirmingDisconnect(false);
      toast.success("Dexcom is disconnected. Log readings by hand whenever you like.");
    } catch {
      toast.error("Something didn't go as expected. Please try again.");
      setConfirmingDisconnect(false);
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <>
      <SectionCard>
        <button
          type="button"
          onClick={handleToggle}
          disabled={isSaving || disconnecting}
          className="w-full flex items-center justify-between gap-4 text-left transition active:opacity-70"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: "#3f3830" }}>Log glucose by hand</p>
            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#746959" }}>
              Turn this on to log readings yourself.
            </p>
            {/* Stated quietly, before the toggle is touched, so the
                disconnect is never a surprise after the fact. */}
            {dexcomConnected && (
              <p className="text-xs mt-1.5 leading-relaxed" style={{ color: "#9c5228" }}>
                Your Dexcom G7 will disconnect, because sensor and hand-entered readings can't share the same line. Turning it back off won't reconnect it. You'll do that from Sensor.
              </p>
            )}
          </div>
          <span
            className="relative h-7 w-12 shrink-0 rounded-full border transition-colors"
            style={{
              background: manualGlucoseEnabled ? "#5b6550" : "rgba(63, 56, 48, 0.10)",
              borderColor: manualGlucoseEnabled ? "#5b6550" : "#eadccf",
            }}
          >
            <span
              className="absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full shadow-md transition-all"
              style={{ left: manualGlucoseEnabled ? "calc(100% - 22px)" : "2px", background: manualGlucoseEnabled ? "#fdf9f2" : "#f7f1e8" }}
            />
          </span>
        </button>
      </SectionCard>

      {confirmingDisconnect && (
        <DeleteConfirmDialog
          title="Disconnect Dexcom G7 and log by hand?"
          message="Your sensor readings already saved stay in your chart and journal. You can reconnect any time from Sensor."
          confirmLabel="Disconnect and log by hand"
          cancelLabel="Cancel"
          onCancel={() => setConfirmingDisconnect(false)}
          onConfirm={handleConfirmDisconnect}
        />
      )}
    </>
  );
}