import { useState } from "react";
import BalanceSpectrum from "./BalanceSpectrum";
import DailyBalanceDetailSheet from "./DailyBalanceDetailSheet";
import { RANGE_NEUTRAL_LABEL, getRangeSummaryQualifier } from "@/lib/dailyBalanceState";

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
  loading = false,
  unavailable = false,
  coverage = ''
}) {
  const [open, setOpen] = useState(false);
  const qualifier = getRangeSummaryQualifier(percentage);
  const hasData = percentage != null && Number.isFinite(percentage);
  const displayValue = hasData ? `${Math.floor(percentage)}%` : "--";

  return (
    <>
      <button
        type="button"
        onClick={() => hasData && setOpen(true)}
        className="mt-6 block w-full text-left"
        aria-label="Open time in your comfort zone detail">
        
        <div className="section-label">{RANGE_NEUTRAL_LABEL}</div>

        <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1 px-1">
          <span
            className="tabular-nums"
            style={{
              color: "#3a2f28",
              fontSize: isGathering ? 22 : 26,
              fontWeight: 300,
              letterSpacing: "-0.01em",
              lineHeight: 1.1
            }}>
            
            {displayValue}
          </span>
          {hasData && !isGathering && qualifier &&
          <span className="text-sm font-medium leading-snug" style={{ color: "#7a6b5d" }}>
              {qualifier}
            </span>
          }
          {isGathering &&
          <span className="text-sm font-medium" style={{ color: "#7a6b5d" }}>
              {hasData ? 'Saved picture so far' : loading ? 'Loading today’s saved history…' : unavailable ? 'Saved history unavailable' : 'Waiting for more readings today'}
            </span>
          }
        </div>

        {hasData && !isGathering &&
        <p className="mt-1 px-1 text-[11px]" style={{ color: "#746959" }}>
            So far today
          </p>
        }

        {hasData && coverage && <p className="mt-2 px-1 text-xs text-muted-foreground hidden">{coverage}</p>}
        {hasData &&
        <div className="mt-3 px-1">
            <BalanceSpectrum percentage={percentage} />
          </div>
        }

        {breakdown &&
        <div className="mt-3 grid grid-cols-3 items-baseline gap-x-1.5 px-1 text-[11px] leading-tight" style={{ color: "#7a6b5d" }}>
            <span className="flex min-w-0 items-baseline gap-1">
              <span className="inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: "#5f8460" }} />
              <span className="min-w-0 break-words">{breakdown.inRange} in range</span>
            </span>
            <span className="flex min-w-0 items-baseline gap-1">
              <span className="inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: "#d9a441" }} />
              <span className="min-w-0 break-words">{breakdown.above} above</span>
            </span>
            <span className="flex min-w-0 items-baseline gap-1">
              <span className="inline-block h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full" style={{ background: "#d98a78" }} />
              <span className="min-w-0 break-words">{breakdown.below} below</span>
            </span>
          </div>
        }
      </button>

      <DailyBalanceDetailSheet
        open={open && hasData}
        onClose={() => setOpen(false)}
        coverage={coverage}
        percentage={percentage}
        breakdown={breakdown}
        readings={readings}
        targetLow={targetLow}
        targetHigh={targetHigh} />
      
    </>);

}