import { Loader2, RotateCw } from "lucide-react";
import { CHECKING_COPY, REFRESH_ERROR_COPY } from "@/lib/glucoseRefresh/verification";

/**
 * One compact inline line under the current reading.
 *
 * Checking says only that the latest reading is being received — it never
 * claims anything about the sensor. The failure line keeps the last reading on
 * screen and offers the same manual refresh the app already has.
 */
export default function RefreshStatusLine({ mode, onRetry, retrying = false }) {
  if (mode !== "checking" && mode !== "error") return null;

  if (mode === "checking") {
    return (
      <p
        className="mt-2 flex items-center gap-1.5 text-[12px] leading-relaxed"
        style={{ color: "#4C6770" }}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden="true" />
        <span>{CHECKING_COPY}</span>
      </p>
    );
  }

  return (
    <p
      className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] leading-relaxed"
      style={{ color: "#9c3f2e" }}
      role="status"
      aria-live="polite"
    >
      <span>{REFRESH_ERROR_COPY}</span>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition hover:opacity-80 disabled:opacity-60"
        style={{ background: "#fdf9f2", border: "1px solid #9c3f2e", color: "#9c3f2e" }}
      >
        <RotateCw className={`h-3 w-3 ${retrying ? "animate-spin" : ""}`} aria-hidden="true" />
        Try again
      </button>
    </p>
  );
}