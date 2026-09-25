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
 * Estimated Support — a gentle, wellness-worded SNAPSHOT of the support
 * this meal might invite, based on the user's own insulin plan.
 *
 * This is a snapshot, fixed at the moment insulin is logged — it does NOT
 * recompute as insulin activity decays. As insulin winds down over time the
 * number here stays put; it never climbs to suggest "more is now needed."
 *
 * Snapshot math (all values fixed, from the meal-alignment calculation in
 * ActiveInsulinBanner):
 *   food insulin       = meal carbs ÷ (5 / meal_insulin_units_per_5g)
 *   correction insulin = max(0, (glucose at meal − correction target) ÷ ISF)
 *                        only when glucose at meal was above target
 *   support committed  = insulin already logged for this meal (fixed)
 *   estimated total    = max(0, food + correction − support committed)
 *
 * Rescue carbs are never part of the carb total — they only surface as a
 * note so the user can see they were gently set aside.
 */
export default function EstimatedSupportCard({ details }) {
  if (!details) return null;

  const d = details;
  const hasPlan = Number.isFinite(d.insulinSensitivityMgDlPerUnit)
    && d.insulinSensitivityMgDlPerUnit > 0
    && Number.isFinite(d.mealInsulinUnitsPer5g)
    && d.mealInsulinUnitsPer5g > 0;

  if (!hasPlan) return null;

  // 1. Carbs to cover — meal-group total, rescue carbs already excluded.
  const carbs = d.meal?.carbs ?? 0;

  // 2. Food insulin (fixed).
  const foodUnits = Number.isFinite(d.expectedMealUnits) ? d.expectedMealUnits : 0;

  // 3. Correction insulin — snapshot using glucose at meal time.
  const correctionTarget = d.correctionTargetGlucose;
  const isf = d.insulinSensitivityMgDlPerUnit;
  const correctionAvailable = Number.isFinite(d.correctionGlucoseValue);
  const correctionUnits = Number.isFinite(d.correctionUnitsNeeded) && d.correctionUnitsNeeded > 0
    ? d.correctionUnitsNeeded
    : 0;
  const startingGlucose = Number.isFinite(d.correctionGlucoseValue) ? Math.round(d.correctionGlucoseValue) : null;

  // 4. Support already committed for this meal — fixed snapshot, not decaying IOB.
  const committedUnits = Number.isFinite(d.loggedTotalUnits) && d.loggedTotalUnits > 0
    ? d.loggedTotalUnits
    : 0;

  // 5. Estimated total — fixed snapshot, never negative.
  const total = Math.max(0, foodUnits + correctionUnits - committedUnits);

  // Plan reference labels
  const gramsPerUnit = Number.isFinite(d.gramsPerUnit) ? d.gramsPerUnit : 5 / d.mealInsulinUnitsPer5g;
  const ratioLabel = `1:${Math.round(gramsPerUnit)}`;
  const isfLabel = Math.round(isf);
  const targetLabel = Math.round(correctionTarget);

  // Rescue carbs logged within the window (already computed in details).
  const rescueGrams = Number.isFinite(d.rescueCarbs) && d.rescueCarbs > 0 ? Math.round(d.rescueCarbs) : 0;

  // Correction line content
  let correctionLine;
  if (!correctionAvailable) {
    correctionLine = { label: "Correction", value: "—", note: "no reading" };
  } else if (correctionUnits > 0.01) {
    correctionLine = {
      label: `Correction · starting ${startingGlucose} / target ${targetLabel}`,
      value: `+${correctionUnits.toFixed(1)}`,
      note: null,
    };
  } else {
    correctionLine = { label: "Correction", value: "0", note: "in range" };
  }

  return (
    <DashboardCard className="p-4">
      <div className="section-label">Estimated Support</div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="anchor" style={{ fontSize: 34 }}>{total.toFixed(1)}</span>
        <span className="text-[15px] font-light" style={{ color: PALETTE.muted }}>u · a gentle preview</span>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: PALETTE.faint }}>
        A snapshot of this meal — <span className="font-serif-italic" style={{ color: PALETTE.ink }}>a starting point, not an instruction.</span>
      </p>

      {/* Breakdown — each component and its contribution (all fixed) */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px]" style={{ color: PALETTE.faint }}>
            Food · {Math.round(carbs)}g · {ratioLabel}
          </span>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
            +{foodUnits.toFixed(1)} u
          </span>
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[11px]" style={{ color: PALETTE.faint }}>
            {correctionLine.label}
          </span>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
            {correctionLine.value} u{correctionLine.note ? ` · ${correctionLine.note}` : ""}
          </span>
        </div>

        {committedUnits > 0.01 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px]" style={{ color: PALETTE.faint }}>Support committed</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
              −{committedUnits.toFixed(1)} u
            </span>
          </div>
        )}
      </div>

      {/* Divider + netted total */}
      <div className="mt-3 flex items-baseline justify-between border-t pt-2.5" style={{ borderColor: PALETTE.hairline }}>
        <span className="text-[12px] font-semibold" style={{ color: PALETTE.ink }}>Estimated total</span>
        <span className="text-[16px] font-bold tabular-nums" style={{ color: PALETTE.ink }}>
          {total.toFixed(1)} u
        </span>
      </div>

      {/* Rescue carbs note — excluded from the math */}
      {rescueGrams > 0 && (
        <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: PALETTE.faint }}>
          {rescueGrams}g rescue carbs logged — <span className="font-serif-italic" style={{ color: PALETTE.ink }}>not included in this estimate.</span>
        </p>
      )}

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