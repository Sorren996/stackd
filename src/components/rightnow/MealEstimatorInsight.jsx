import { IOB_FLOOR } from "@/lib/iobModel";
import { isBasalInsulinType } from "@/lib/insulinPharmacology";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  green: "#4d5742",
  amber: "#8a5a12",
  hairline: "#eadccf",
  canvas: "#f7f1e8",
};

/**
 * Meal Estimator — a secondary insight inside Meal Review.
 *
 * Shows how the user's own settings translate the logged carbs to an
 * estimated insulin figure. Retrospective only: it describes the math the
 * user's plan would produce for this meal. It never recommends, suggests,
 * or tells the user what to take — and there is no apply button.
 *
 * Bolus-only (basal insulin is never part of meal math). Honors the app-wide
 * IOB 0.49u floor: active dose rows below the floor are excluded.
 *
 * When a split-dose plan is associated with the meal, the estimator reflects
 * only the first (already-administered) portion plus any additional bolus
 * logged in the window — the follow-up portion is never counted until it's
 * actually logged.
 */
export default function MealEstimatorInsight({ details, splitPlan = null }) {
  const d = details;
  if (!d) return null;

  const hasPlan = Number.isFinite(d.insulinSensitivityMgDlPerUnit)
    && d.insulinSensitivityMgDlPerUnit > 0
    && Number.isFinite(d.mealInsulinUnitsPer5g)
    && d.mealInsulinUnitsPer5g > 0;
  if (!hasPlan) return null;

  const carbs = Math.round(d.meal?.carbs ?? 0);
  const gramsPerUnit = Number.isFinite(d.gramsPerUnit) ? d.gramsPerUnit : 5 / d.mealInsulinUnitsPer5g;
  const ratioLabel = `1:${gramsPerUnit.toFixed(1)}`;

  // Estimated meal insulin from the user's I:C setting.
  const estimatedMealUnits = Number.isFinite(d.expectedMealUnits) ? d.expectedMealUnits : carbs / gramsPerUnit;

  // Estimated correction from the user's ISF + target (0 if no reading).
  const correctionUnits = Number.isFinite(d.correctionUnitsNeeded) && d.correctionUnitsNeeded > 0
    ? d.correctionUnitsNeeded
    : 0;

  // Split-dose awareness: if a split plan exists, only the first administered
  // portion counts as "taken" toward the meal. The follow-up portion is
  // planned, not yet insulin on board — so it never contributes here.
  let takenUnits = Number.isFinite(d.loggedTotalUnits) ? d.loggedTotalUnits : 0;
  if (splitPlan && Number.isFinite(splitPlan.first_planned_units)) {
    // The first portion is what's actually been administered for the meal.
    // If a first dose log exists, use the real logged value; otherwise the
    // planned first portion is the best retrospective figure.
    takenUnits = takenUnits > 0 ? takenUnits : splitPlan.first_planned_units;
  }

  // Bolus-only: exclude any basal doses from the active breakdown.
  const activeBolusDoses = (d.bolusIOBBreakdown || []).filter(
    (dose) => !isBasalInsulinType(dose.type) && dose.iob > IOB_FLOOR
  );

  // The estimator line — attributes the math to the user's settings.
  // Never uses suggested/recommended/should/take.
  const mealUnitsStr = estimatedMealUnits.toFixed(1);
  const estimatorLine = (
    <>
      Your settings translate{" "}
      <span className="font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{carbs}g</span>{" "}
      to about{" "}
      <span className="font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{mealUnitsStr}u</span>{" "}
      (I:C {ratioLabel})
      {correctionUnits > 0.01 && (
        <>
          , plus{" "}
          <span className="font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{correctionUnits.toFixed(1)}u</span>{" "}
          from your correction math
        </>
      )}
      .
    </>
  );

  return (
    <div className="mt-4">
      <div className="section-label">Your plan's math</div>
      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: PALETTE.ink }}>
        {estimatorLine}
      </p>
      <p className="mt-1.5 text-[10px] leading-relaxed" style={{ color: PALETTE.faint }}>
        Describes your plan's math. Not a dose recommendation.
      </p>
    </div>
  );
}