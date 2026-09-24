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
 * this meal might invite, based on the user's own insulin plan.
 *
 * Calculation (netted, not just displayed alongside):
 *   carbs to cover  = meal-group carbs (rescue carbs already excluded
 *                     during meal grouping in ActiveInsulinBanner)
 *   food insulin    = carbs ÷ (5 / meal_insulin_units_per_5g)
 *   correction      = max(0, (current glucose − correction target) ÷ ISF)
 *                     only when current glucose is above target
 *   active on board = current IOB from meal-coverage doses (decays over time)
 *   total estimate  = max(0, food + correction − IOB)
 *
 * Rescue carbs are never part of the carb total — they only surface as a
 * note so the user can see they were gently set aside.
 *
 * Values come from the meal-alignment calculation in ActiveInsulinBanner
 * (expectedMealUnits, bolusIOB, latestGlucoseValue, rescueCarbs, etc.).
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

  // 2. Food insulin.
  const foodUnits = Number.isFinite(d.expectedMealUnits) ? d.expectedMealUnits : 0;

  // 3. Correction insulin — uses the most recent glucose reading.
  const currentGlucose = Number.isFinite(d.latestGlucoseValue)
    ? d.latestGlucoseValue
    : (Number.isFinite(d.correctionGlucoseValue) ? d.correctionGlucoseValue : d.windowEndGlucoseValue);
  const correctionTarget = d.correctionTargetGlucose;
  const isf = d.insulinSensitivityMgDlPerUnit;
  const glucoseAvailable = Number.isFinite(currentGlucose);
  const aboveTarget = glucoseAvailable && Number.isFinite(correctionTarget) && currentGlucose > correctionTarget;
  const correctionUnits = aboveTarget ? Math.max(0, (currentGlucose - correctionTarget) / isf) : 0;

  // 4. Active insulin on board (decaying IOB from meal-coverage doses).
  const iob = Number.isFinite(d.bolusIOB) && d.bolusIOB > 0 ? d.bolusIOB : 0;

  // 5. Total estimate — IOB is subtracted, never negative.
  const total = Math.max(0, foodUnits + correctionUnits - iob);

  // Plan reference labels
  const gramsPerUnit = Number.isFinite(d.gramsPerUnit) ? d.gramsPerUnit : 5 / d.mealInsulinUnitsPer5g;
  const ratioLabel = `1:${Math.round(gramsPerUnit)}`;
  const isfLabel = Math.round(isf);
  const targetLabel = Math.round(correctionTarget);

  // Rescue carbs logged within the window (already computed in details).
  const rescueGrams = Number.isFinite(d.rescueCarbs) && d.rescueCarbs > 0 ? Math.round(d.rescueCarbs) : 0;

  // Correction line content
  let correctionLine;
  if (!glucoseAvailable) {
    correctionLine = { label: "Correction", value: "—", note: "no reading" };
  } else if (aboveTarget && correctionUnits > 0.01) {
    correctionLine = {
      label: `Correction · ${Math.round(currentGlucose)} / target ${targetLabel}`,
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
        Based on your plan — <span className="font-serif-italic" style={{ color: PALETTE.ink }}>a starting point, not an instruction.</span>
      </p>

      {/* Breakdown — each component and its contribution */}
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

        {iob > 0.01 && (
          <div className="flex items-baseline justify-between">
            <span className="text-[11px]" style={{ color: PALETTE.faint }}>Active on board</span>
            <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
              −{iob.toFixed(1)} u
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