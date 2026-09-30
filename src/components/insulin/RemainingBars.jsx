// Horizontal remaining-unit bars, each scaled to its own logged amount.
//
// Each bar is self-relative: the full bar width represents that dose's logged
// amount (muted extent), and the filled copper accent represents the estimated
// remaining units as a fraction of that dose's logged amount. No shared axis
// — every dose is scaled independently. A compact percentage label sits at
// the right end of each bar.

const ACCENT = "#9c5228"; // copper — estimated remaining units
const MUTED_EXTENT = "rgba(156, 82, 40, 0.20)"; // faded copper — logged amount

/** Compact legend tying bar colors to their meaning. */
export function RemainingLegend() {
  return (
    <div className="flex items-center gap-3 text-[9px] leading-none" style={{ color: "#746959" }}>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: ACCENT }} />
        Estimated remaining
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: MUTED_EXTENT }} />
        Logged amount
      </span>
    </div>
  );
}

/**
 * A single self-relative horizontal bar.
 * Full bar width = logged amount (muted track). Copper fill width =
 * remaining ÷ logged. A percentage label appears at the right end.
 */
export default function RemainingBar({ logged, remaining }) {
  const loggedVal = Math.max(0, Number(logged) || 0);
  const remainingVal = Math.max(0, Number(remaining) || 0);
  const pct = loggedVal > 0 ? Math.min(100, Math.round((remainingVal / loggedVal) * 100)) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="relative h-2 flex-1 rounded-full overflow-hidden" style={{ background: MUTED_EXTENT }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${pct}%`, background: ACCENT }}
        />
      </div>
      <span
        className="text-[9px] font-medium tabular-nums leading-none"
        style={{ color: "#746959", minWidth: "26px", textAlign: "right" }}
      >
        {pct}%
      </span>
    </div>
  );
}