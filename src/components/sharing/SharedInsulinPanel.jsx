import { ChevronRight } from "lucide-react";
import { computeSharedActiveInsulin, sharedBasalSummary } from "@/lib/sharing/followerInsulin";
import { describeProjectionReason } from "@/lib/sharing/sharingCopy";

const INK = "#3a2f28";
const MUTED = "#7a6b5d";
const ACCENT = "#a0522d";

/**
 * The follower's active-insulin hero.
 *
 * The headline figure is the estimated ACTIVE RAPID-ACTING total, produced by
 * the same validated model, against the same confirmed plan, that the patient's
 * own screen uses. It is deliberately not the latest logged dose and not a sum
 * of everything logged today: those record what was given, while this describes
 * what is still acting.
 *
 * Basal is shown separately, in the patient app's own coverage words, and is
 * never added to the rapid figure — the two are different things, and one
 * combined number would read as a single dose. Nothing here suggests a dose.
 */
export default function SharedInsulinPanel({ insulin, reason, onOpenDetail }) {
  if (!insulin) {
    return (
      <p className="text-sm" style={{ color: MUTED }}>
        {describeProjectionReason(reason)}
      </p>
    );
  }

  const now = Date.now();
  const estimate = computeSharedActiveInsulin(insulin.doses, now, {
    doseMathAvailable: insulin.dose_math_available === true,
  });
  // Basal sits behind the same plan gate: until their plan is confirmed,
  // nothing dose-derived is described at all.
  const basal = insulin.dose_math_available === true ? sharedBasalSummary(insulin.doses, now) : null;

  return (
    <button
      type="button"
      onClick={onOpenDetail}
      className="w-full text-left"
      aria-label="See what insulin is active now"
    >
      <span className="section-label block">Estimated active rapid-acting</span>

      <span className="flex items-baseline gap-1.5 pt-2">
        <span
          className="text-[30px] tabular-nums"
          style={{ color: estimate.available ? INK : MUTED, fontWeight: 300, lineHeight: 1.05, letterSpacing: "-0.02em" }}
        >
          {estimate.available ? (estimate.isZero ? "None" : estimate.value.toFixed(1)) : "Unavailable"}
        </span>
        {estimate.available && !estimate.isZero && (
          <span className="text-xs" style={{ color: MUTED }}>
            u
          </span>
        )}
        {estimate.available && estimate.isZero && (
          <span className="text-sm" style={{ color: MUTED }}>
            active
          </span>
        )}
      </span>

      {!estimate.available && (
        <span className="block pt-1 text-xs" style={{ color: MUTED }}>
          {describeProjectionReason(estimate.reason)}
        </span>
      )}

      {basal && (
        <span className="block pt-3 text-xs" style={{ color: INK }}>
          Basal active · {basal.label}
          {basal.insulin_type ? ` (${basal.insulin_type})` : ""}
        </span>
      )}

      <span className="block pt-3 text-[11px] leading-relaxed" style={{ color: MUTED }}>
        Worked out from the doses they have logged and the plan they have confirmed. A picture of what is active, not a
        dose suggestion.
      </span>

      <span className="flex items-center gap-1 pt-3 text-xs font-semibold" style={{ color: ACCENT }}>
        See what is active now
        <ChevronRight className="h-4 w-4" />
      </span>
    </button>
  );
}