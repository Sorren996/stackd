import DashboardCard from "@/components/dashboard/DashboardCard";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  sage: "#4d5742",
  copper: "#9c5228",
  hairline: "#eadccf",
};

/**
 * Estimated Support — a gentle, wellness-worded preview of the support
 * this meal might invite, based on the user's own insulin plan (I:C ratio
 * and insulin sensitivity). This is an estimate for review only — the
 * decision always stays with the user.
 *
 * Values come from the existing meal-alignment calculation in
 * ActiveInsulinBanner (expectedMealUnits, correctionUnitsNeeded,
 * grossDoseEstimate, ISF, correction target, I:C).
 */
export default function EstimatedSupportCard({ details }) {
  if (!details) return null;

  const d = details;
  const hasPlan = Number.isFinite(d.insulinSensitivityMgDlPerUnit)
    && d.insulinSensitivityMgDlPerUnit > 0
    && Number.isFinite(d.mealInsulinUnitsPer5g)
    && d.mealInsulinUnitsPer5g > 0;

  if (!hasPlan) return null;

  // Rescue carbs are never part of the meal carb total used for estimates —
  // the meal grouping already filters them out, so d.meal.carbs is safe.
  const carbs = d.meal?.carbs ?? 0;
  const mealUnits = Number.isFinite(d.expectedMealUnits) ? d.expectedMealUnits : 0;
  const correctionUnits = Number.isFinite(d.correctionUnitsNeeded) && d.correctionUnitsNeeded > 0
    ? d.correctionUnitsNeeded
    : 0;
  const totalUnits = Number.isFinite(d.grossDoseEstimate) ? d.grossDoseEstimate : 0;

  // Use insulin currently active on board (IOB), not what was originally
  // logged. IOB decays over time, so this reflects the support still
  // working in your body right now.
  const activeIob = Number.isFinite(d.bolusIOB) && d.bolusIOB > 0 ? d.bolusIOB : 0;

  const gramsPerUnit = 5 / d.mealInsulinUnitsPer5g;
  const ratioLabel = `1 : ${Math.round(gramsPerUnit)}`;
  const isfLabel = Math.round(d.insulinSensitivityMgDlPerUnit);
  const targetLabel = Math.round(d.correctionTargetGlucose);

  const showCorrection = correctionUnits > 0.01;
  // What's still gently needed = full preview minus insulin already active.
  const remaining = Math.max(0, totalUnits - activeIob);

  return (
    <DashboardCard className="p-4">
      <div className="section-label">Estimated Support</div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="anchor" style={{ fontSize: 34 }}>{totalUnits.toFixed(1)}</span>
        <span className="text-[15px] font-light" style={{ color: PALETTE.muted }}>u · a gentle preview</span>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: PALETTE.faint }}>
        Based on your plan — <span className="font-serif-italic" style={{ color: PALETTE.ink }}>a starting point, not a instruction.</span>
      </p>

      {/* Breakdown */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px]" style={{ color: PALETTE.faint }}>Nourishment support</span>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
            {mealUnits.toFixed(1)} u
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px]" style={{ color: PALETTE.faint }}>for {Math.round(carbs)} g · {ratioLabel}</span>
          <span className="text-[11px] tabular-nums" style={{ color: PALETTE.faint }}>
            {ratioLabel} g/u
          </span>
        </div>
        {showCorrection && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px]" style={{ color: PALETTE.faint }}>
              Alignment support · target {targetLabel}
            </span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.copper }}>
              +{correctionUnits.toFixed(1)} u
            </span>
          </div>
        )}
        {activeIob > 0.01 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px]" style={{ color: PALETTE.faint }}>Active on board</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.sage }}>
              {activeIob.toFixed(1)} u
            </span>
          </div>
        )}
        {activeIob > 0.01 && remaining > 0.01 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px]" style={{ color: PALETTE.faint }}>Still gently needed</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
              {remaining.toFixed(1)} u
            </span>
          </div>
        )}
      </div>

      {/* Plan reference */}
      <div className="mt-3 flex items-baseline justify-between border-t pt-2.5" style={{ borderColor: PALETTE.hairline }}>
        <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>
          Your plan
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: PALETTE.muted }}>
          I:C {ratioLabel} · ISF 1:{isfLabel} · target {targetLabel}
        </span>
      </div>
    </DashboardCard>
  );
}