import DoseActivityChart from "./DoseActivityChart";
import LedgerLine from "./LedgerLine";
import { MR, SERIF_ITALIC } from "./mealReviewTheme";

/**
 * "Your dose and your plan" — the same figures the card already computes, set
 * as a statement: what the food worked out to, what the correction added, a
 * rule, then the plan's total against what was actually taken. The difference
 * is carried by one short sentence rather than a bar or a badge.
 *
 * The modeled dose curves that used to run under the glucose line live here,
 * on their own activity scale, so a dose shape is never read as a glucose
 * prediction.
 */
export default function DoseAndPlanSection({
  show,
  neutralLabel,
  planned,
  taken,
  foodUnits,
  correctionValue,
  correctionLabel,
  correctionUnits,
  correctionAvailable,
  correctionInRange,
  carbs,
  ratioLabel,
  difference,
  absDiff,
  doses = [],
  from,
  to,
  now,
}) {
  const verdict =
    absDiff < 0.05
      ? "Right on your plan"
      : difference > 0
        ? `${absDiff.toFixed(1)}u more than your plan`
        : `${absDiff.toFixed(1)}u less than your plan`;

  const foodLabel = `Food, ${carbs} g at ${ratioLabel}`;
  const correctionNote = !correctionAvailable
    ? "No reading at dose time"
    : correctionUnits > 0.01
      ? correctionLabel
      : `Correction, ${correctionInRange ? "in range" : "out of range"} at dose time`;

  return (
    <div>
      {!show ? (
        <p style={{ ...SERIF_ITALIC, fontSize: 13, lineHeight: 1.6, color: MR.sec }}>{neutralLabel}</p>
      ) : (
        <>
          <div className="space-y-1.5">
            <LedgerLine label={foodLabel} value={`${foodUnits.toFixed(1)}u`} />
            <LedgerLine label={correctionNote} value={correctionValue} />
          </div>

          <div className="my-2.5" style={{ borderTop: `1px solid ${MR.hairline}` }} />

          <div className="space-y-1.5">
            <LedgerLine label="Your plan's math" value={`${planned.toFixed(1)}u`} />
            <LedgerLine label="You took" value={`${taken.toFixed(1)}u`} strong tone={MR.rust} />
          </div>

          <p className="mt-3" style={{ ...SERIF_ITALIC, fontSize: 13, lineHeight: 1.6, color: MR.ink }}>
            {verdict}.
          </p>
        </>
      )}

      <div className="mt-3">
        <DoseActivityChart doses={doses} from={from} to={to} now={now} />
      </div>

      <p className="mt-3" style={{ fontSize: 11, lineHeight: 1.6, color: MR.sec }}>
        This just shows your plan's math. The dose is always yours.
      </p>
    </div>
  );
}