import { describeProjectionReason } from "@/lib/sharing/sharingCopy";

/**
 * The follower's insulin panel.
 *
 * An estimate that could not be worked out reads "Unavailable" — it is never
 * shown as 0.0 u, which would wrongly say no insulin is active. No dose
 * recommendations and no calculators appear here.
 */
export default function SharedInsulinPanel({ insulin, reason }) {
  if (!insulin) {
    return (
      <p className="text-sm" style={{ color: "#746959" }}>
        {describeProjectionReason(reason)}
      </p>
    );
  }

  const last = insulin.last_dose;
  const estimate = insulin.active_insulin;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm" style={{ color: "#3f3830" }}>
          Last dose in the last 24 hours
        </span>
        <span className="text-sm font-medium tabular-nums" style={{ color: "#3f3830" }}>
          {last ? `${last.units} u · ${last.insulin_type}` : "None logged"}
        </span>
      </div>

      <div className="flex items-baseline justify-between border-t pt-2" style={{ borderColor: "#eadccf" }}>
        <span className="text-sm" style={{ color: "#3f3830" }}>
          Estimated active rapid-acting
        </span>
        <span className="text-sm font-medium tabular-nums" style={{ color: estimate?.available ? "#3f3830" : "#746959" }}>
          {!estimate || !estimate.available
            ? "Unavailable"
            : estimate.isZero
              ? "None active"
              : `${estimate.value.toFixed(1)} u`}
        </span>
      </div>

      {!insulin.dose_math_available && (
        <p className="text-xs" style={{ color: "#746959" }}>
          Their insulin plan has not been confirmed in Stackd, so no active figure is shown.
        </p>
      )}

      <p className="text-xs" style={{ color: "#746959" }}>
        {insulin.doses?.length === 0
          ? "No doses were logged in the last 24 hours."
          : `${insulin.doses?.length || 0} dose(s) visible in the last 24 hours.`}
      </p>
    </div>
  );
}