import LedgerLine from "./LedgerLine";
import { MR, SERIF_ITALIC, SECTION_HEAD } from "./mealReviewTheme";

/**
 * Card 2, section A — "Your dose".
 *
 * The same figures the card already computes, set as a statement: what the
 * food worked out to, what the correction added, a rule, then the plan's total
 * against what was actually taken. No bars, no status pill — the difference is
 * carried by one short sentence underneath.
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
    <section>
      <div style={SECTION_HEAD}>Your dose</div>

      {!show ? (
        <p className="mt-2" style={{ ...SERIF_ITALIC, fontSize: 13, lineHeight: 1.6, color: MR.sec }}>
          {neutralLabel}
        </p>
      ) : (
        <>
          <div className="mt-3 space-y-1.5">
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
          <p className="mt-1" style={{ fontSize: 11, lineHeight: 1.6, color: MR.sec }}>
            Only ever your own plan's math. The dose is always yours.
          </p>
        </>
      )}
    </section>
  );
}