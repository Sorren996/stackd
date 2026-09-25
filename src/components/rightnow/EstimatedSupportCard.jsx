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
 * Active Support — reports what insulin is working right now (active IOB),
 * alongside the point-in-time reference (expected food + correction) captured
 * at the moment of the dose.
 *
 * The expected total is a snapshot. It does not grow as insulin decays, and
 * falling active insulin is never framed as a shortfall or a reason to dose
 * more. The card describes what is active and what was referenced, nothing more.
 *
 * Active IOB uses the biexponential per-bolus curves (summed), not total dosed.
 * Rescue carbs appear only as an informational note and never enter the math.
 */
export default function EstimatedSupportCard({ details }) {
  if (!details) return null;

  const d = details;
  const hasPlan = Number.isFinite(d.insulinSensitivityMgDlPerUnit)
    && d.insulinSensitivityMgDlPerUnit > 0
    && Number.isFinite(d.mealInsulinUnitsPer5g)
    && d.mealInsulinUnitsPer5g > 0;

  if (!hasPlan) return null;

  const carbs = d.meal?.carbs ?? 0;
  const foodUnits = Number.isFinite(d.expectedMealUnits) ? d.expectedMealUnits : 0;
  const correctionTarget = d.correctionTargetGlucose;
  const isf = d.insulinSensitivityMgDlPerUnit;
  const correctionAvailable = Number.isFinite(d.correctionGlucoseValue);
  const correctionUnits = Number.isFinite(d.correctionUnitsNeeded) && d.correctionUnitsNeeded > 0
    ? d.correctionUnitsNeeded
    : 0;
  const startingGlucose = Number.isFinite(d.correctionGlucoseValue) ? Math.round(d.correctionGlucoseValue) : null;
  const expectedTotal = foodUnits + correctionUnits;
  const activeNow = Number.isFinite(d.activeIOB) ? d.activeIOB : (Number.isFinite(d.bolusIOB) ? d.bolusIOB : 0);

  const gramsPerUnit = Number.isFinite(d.gramsPerUnit) ? d.gramsPerUnit : 5 / d.mealInsulinUnitsPer5g;
  const ratioLabel = `1:${Math.round(gramsPerUnit)}`;
  const isfLabel = Math.round(isf);
  const targetLabel = Math.round(correctionTarget);
  const rescueGrams = Number.isFinite(d.rescueCarbs) && d.rescueCarbs > 0 ? Math.round(d.rescueCarbs) : 0;

  let correctionLine;
  if (!correctionAvailable) {
    correctionLine = { label: "Correction", value: "—", note: "no reading" };
  } else if (correctionUnits > 0.01) {
    correctionLine = {
      label: `Correction · start ${startingGlucose} / target ${targetLabel}`,
      value: `+${correctionUnits.toFixed(1)}`,
      note: null,
    };
  } else {
    correctionLine = { label: "Correction", value: "0", note: "in range" };
  }

  return (
    <DashboardCard className="p-4">
      <div className="section-label">Active Support</div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="anchor" style={{ fontSize: 34 }}>{activeNow.toFixed(1)}</span>
        <span className="text-[15px] font-light" style={{ color: PALETTE.muted }}>u · active now</span>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: PALETTE.faint }}>
        {expectedTotal.toFixed(1)}u was the reference at the time.
      </p>

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

        <div className="flex items-baseline justify-between">
          <span className="text-[11px]" style={{ color: PALETTE.faint }}>Active now</span>
          <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
            {activeNow.toFixed(1)} u
          </span>
        </div>
      </div>

      {rescueGrams > 0 && (
        <p className="mt-2.5 text-[11px] leading-relaxed" style={{ color: PALETTE.faint }}>
          {rescueGrams}g rescue carbs logged (not part of the math).
        </p>
      )}

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