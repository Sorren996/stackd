import { Lock } from "lucide-react";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  sage: "#5b6550",
  lock: "#8a7f70",
};

/**
 * Automatic misalignment tracker for the Meal Review card.
 *
 * When Dexcom is connected, the app continuously compares the glucose
 * response against the expected meal + dose response and generates the
 * alignment heads-up and falling-too-fast caution automatically from live
 * data (those notices surface via the existing outcome assessment). This
 * component shows a small quiet line confirming automatic tracking is active.
 *
 * When Dexcom is not connected, misalignment tracking still runs in its
 * manual form from logged readings, and this component shows its locked
 * state for the automatic version.
 */
export default function AlignmentTracker({ dexcomConnected, outcomeAssessment, onConnectDexcom }) {
  // Connected — automatic tracking is live. The heads-up or caution itself
  // appears through the outcome notice; this just confirms the source.
  if (dexcomConnected) {
    return (
      <div className="mt-3 flex items-center gap-1.5 px-1">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ background: PALETTE.sage }}
        />
        <span className="text-[11px]" style={{ color: PALETTE.sage }}>
          Tracking alignment from live glucose.
        </span>
      </div>
    );
  }

  // Not connected — locked state for the automatic version.
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