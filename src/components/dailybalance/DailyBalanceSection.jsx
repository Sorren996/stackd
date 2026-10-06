import { useState } from "react";
import BalanceSpectrum from "./BalanceSpectrum";
import DailyBalanceDetailSheet from "./DailyBalanceDetailSheet";
import { getDailyBalanceState } from "@/lib/dailyBalanceState";

// Redesigned Daily Balance section for the home "Today" card.
//
// Preserves the existing Daily Balance value and time breakdown exactly —
// both are computed in ActiveInsulinBanner and passed in. This component only
// adds presentation: a state label, a calm balance spectrum, and a tap
// target that opens the Daily Balance detail sheet.
export default function DailyBalanceSection({
  percentage,
  breakdown,
  isGathering,
  readings,
  targetLow,
  targetHigh,
}) {
  const [open, setOpen] = useState(false);
  const state = getDailyBalanceState(percentage);
  const hasData = percentage != null && Number.isFinite(percentage);
  const displayValue = hasData ? `${Math.floor(percentage)}%` : "--";

  return (
    <>
      <button
        type="button"
        onClick={() => hasData && setOpen(true)}
        className="mt-6 block w-full text-left"
        aria-label="Open Daily Balance detail"
      >
        <div className="section-label">Daily Balance</div>

        <div className="mt-2 flex items-baseline gap-2 px-1">
          <span
            className="anchor-number"
            style={{
              color: "#3f3830",
              ...(isGathering ? { fontSize: 28, fontWeight: 400, opacity: 0.65 } : {}),
            }}
          >
            {displayValue}
          </span>
          {hasData && !isGathering && (
            <span className="text-sm font-medium" style={{ color: "#6b6153" }}>
              {state.label}
            </span>
          )}
          {isGathering && (
            <span className="text-sm font-medium" style={{ color: "#746959" }}>
              Still gathering today
            </span>
          )}
        </div>

        {hasData && (
          <div className="mt-3 px-1">
            <BalanceSpectrum percentage={percentage} />
          </div>
        )}

        {breakdown && (
          <div className="mt-3 px-1 text-xs" style={{ color: "#746959" }}>
            {breakdown.inRange} in range · {breakdown.above} above · {breakdown.below} below
          </div>
        )}
      </button>

      <DailyBalanceDetailSheet
        open={open}
        onClose={() => setOpen(false)}
        percentage={percentage}
        breakdown={breakdown}
        readings={readings}
        targetLow={targetLow}
        targetHigh={targetHigh}
      />
    </>
  );
}