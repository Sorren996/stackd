import { Lock } from "lucide-react";

const PALETTE = {
  faint: "#746959",
  lock: "#8a7f70",
};

/**
 * Automatic misalignment tracker for the Meal Review card.
 *
 * When Dexcom is connected, the app continuously compares the glucose
 * response against the expected meal + dose response and generates the
 * alignment heads-up and falling-too-fast caution automatically from live
 * data. Those notices surface through the existing outcome assessment, so
 * nothing extra is shown here while tracking is live.
 *
 * When Dexcom is not connected, misalignment tracking still runs in its
 * manual form from logged readings, and this shows the locked state for the
 * automatic version.
 */
export default function AlignmentTracker({ dexcomConnected, onConnectDexcom }) {
  if (dexcomConnected) return null;

  return (
    <button
      type="button"
      onClick={onConnectDexcom || undefined}
      className="mt-3 flex w-full items-center gap-2 rounded-[12px] px-3 py-2.5 text-left transition"
      style={{
        background: "#f7f1e8",
        cursor: onConnectDexcom ? "pointer" : "default",
      }}
    >
      <Lock size={13} strokeWidth={2} style={{ color: PALETTE.lock, flexShrink: 0 }} />
      <span className="text-[12px] leading-snug" style={{ color: PALETTE.faint }}>
        Connect Dexcom to track alignment automatically.
      </span>
    </button>
  );
}