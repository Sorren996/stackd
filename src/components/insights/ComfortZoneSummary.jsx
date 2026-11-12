import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";
import { RANGE_NEUTRAL_LABEL, getRangeSummaryQualifier } from "@/lib/dailyBalanceState";

/**
 * The headline comfort-zone figure.
 *
 * What it measures: the share of the period's real readings that sat inside
 * the user's configured comfort zone — the same count/denominator definition
 * this view has always used. It is not a duration-weighted time-in-range
 * figure, so the wording says "readings", never "time".
 *
 * Below / above use the identical reading set, bounds and denominator, so the
 * three values describe one population. Each is rounded for display, which is
 * why they can add up to 99 or 101 rather than exactly 100.
 */
export default function ComfortZoneSummary({
  percent,
  belowPercent,
  abovePercent,
  periodLabel,
  targetLow,
  targetHigh,
  coverage,
}) {
  const zone = `${formatGlucose(targetLow)}\u2013${formatGlucose(targetHigh)} ${glucoseUnitLabel()}`;
  const qualifier = getRangeSummaryQualifier(percent);

  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: "#746959" }}>
        {RANGE_NEUTRAL_LABEL}
      </p>

      {qualifier && (
        <p className="mt-1.5 font-serif-italic text-[17px] leading-snug" style={{ color: "#3f3830" }}>
          {qualifier}.
        </p>
      )}

      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="anchor-number" style={{ color: "#3a2f28" }}>
          {Math.round(percent)}%
        </span>
      </div>

      <p className="mt-1.5 text-[13px] font-medium leading-snug" style={{ color: "#3f3830" }}>
        of your readings
      </p>
      <p className="mt-1 text-[11px]" style={{ color: "#6b6153" }}>
        Over the past {periodLabel}
      </p>
      <p className="mt-0.5 text-[11px]" style={{ color: "#6b6153" }}>
        Your comfort zone: {zone}
      </p>

      <div
        className="mt-3 flex items-start justify-between gap-4 border-t pt-3"
        style={{ borderColor: "#e6dccd" }}
      >
        <div>
          <p className="text-[11px]" style={{ color: "#6b6153" }}>
            Below your zone
          </p>
          <p className="mt-0.5 text-[17px] font-medium tabular-nums" style={{ color: "#3f3830" }}>
            {Math.round(belowPercent)}%
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px]" style={{ color: "#6b6153" }}>
            Above your zone
          </p>
          <p className="mt-0.5 text-[17px] font-medium tabular-nums" style={{ color: "#3f3830" }}>
            {Math.round(abovePercent)}%
          </p>
        </div>
      </div>

      {coverage?.totalDays > 0 && (
        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "#746959" }}>
          Readings on {coverage.daysWithReadings} of {coverage.totalDays} days. Gaps are not counted.
          Percentages are rounded.
        </p>
      )}
    </div>
  );
}