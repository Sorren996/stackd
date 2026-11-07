import { useState } from "react";
import { Lock } from "lucide-react";
import OnboardingShell from "@/components/onboarding/OnboardingShell";
import TermInfoButton from "@/components/doseplan/TermInfoButton";
import { DOSE_TERMS } from "@/lib/dosePlanCopy";

const INK = "#3f3830";
const COPPER = "#9c5228";
const CREAM = "#fdf9f2";
const CANVAS = "#f7f1e8";
const HAIRLINE = "#eadccf";
const FAINT = "#746959";
const TAUPE = "#6b6153";

function FieldInput({ label, value, onChange, unit, helper, info }) {
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-center gap-1">
        <label className="text-[12px] font-semibold" style={{ color: INK }}>
          {label}
        </label>
        {info}
      </div>
      {/* The input owns the row at its real width, and the unit sits BELOW it
          and wraps. A numeric input keeps an intrinsic width unless it is
          allowed to shrink, so a sibling `shrink-0` unit used to push the whole
          row past the right edge; `min-w-0` plus a full-width field is what
          actually fixes that. The unit is never truncated — every character is
          still on screen, just on its own line. */}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-2xl border px-4 py-3 text-sm focus:outline-none"
        style={{ background: CANVAS, borderColor: HAIRLINE, color: INK }}
      />
      {unit && (
        <p
          className="mt-1.5 text-[12px] leading-snug"
          style={{ color: TAUPE, overflowWrap: "break-word" }}
        >
          {unit}
        </p>
      )}
      {helper && (
        <p className="mt-1 text-[11px] leading-relaxed" style={{ color: FAINT }}>
          {helper}
        </p>
      )}
    </div>
  );
}

/**
 * Step 2 — prescribed insulin settings (optional, skippable).
 *
 * Everyday labels with the medical term in each explanation. Units match the
 * stored fields exactly: mg/dL per unit, units per 5 grams of carbs (never
 * grams per unit), and mg/dL for the correction target. Inputs start empty —
 * no seeded example value is ever presented as someone's prescribed plan.
 * Confirming sets settings_confirmed; skipping leaves the existing gate in
 * place, so dose calculations stay off.
 */
export default function DosePlanStep({ onConfirm, onSkip, onBack }) {
  const [sensitivity, setSensitivity] = useState("");
  const [carbRatio, setCarbRatio] = useState("");
  const [correctionTarget, setCorrectionTarget] = useState("");

  const canConfirm =
    Number(sensitivity) > 0 && Number(carbRatio) > 0 && Number(correctionTarget) > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({
      insulin_sensitivity_mgdl_per_unit: Number(sensitivity),
      meal_insulin_units_per_5g: Number(carbRatio),
      correction_target_glucose: Number(correctionTarget),
      settings_confirmed: true,
    });
  };

  return (
    <OnboardingShell
      stepLabel="Step 2 of 3"
      onBack={onBack}
      title={
        <>
          Your{" "}
          <em style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: 400 }}>
            prescribed
          </em>{" "}
          insulin settings
        </>
      }
      intro="Use the settings from your care team. If you&rsquo;re unsure, you can skip this step."
      footer={
        <>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className="w-full rounded-full py-3.5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40"
            style={{ background: INK, color: CREAM }}
          >
            Confirm my plan
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="w-full rounded-full py-3 text-sm font-medium transition"
            style={{ color: TAUPE }}
          >
            Skip for now
          </button>
        </>
      }
    >
      <div className="space-y-5">
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{ background: CREAM, border: `1px solid ${HAIRLINE}` }}
        >
          <FieldInput
            label={DOSE_TERMS.sensitivity.label}
            value={sensitivity}
            onChange={setSensitivity}
            unit={DOSE_TERMS.sensitivity.unit}
            helper={DOSE_TERMS.sensitivity.helper}
            info={<TermInfoButton termKey="sensitivity" />}
          />
          <FieldInput
            label={DOSE_TERMS.mealRatio.label}
            value={carbRatio}
            onChange={setCarbRatio}
            unit={DOSE_TERMS.mealRatio.unit}
            helper={DOSE_TERMS.mealRatio.helper}
            info={<TermInfoButton termKey="mealRatio" />}
          />
          <FieldInput
            label={DOSE_TERMS.correctionTarget.label}
            value={correctionTarget}
            onChange={setCorrectionTarget}
            unit={DOSE_TERMS.correctionTarget.unit}
            helper={DOSE_TERMS.correctionTarget.helper}
            info={<TermInfoButton termKey="correctionTarget" />}
          />
        </div>

        <div className="flex items-start gap-2 px-1">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: COPPER }} />
          <p className="text-[11px] leading-relaxed" style={{ color: FAINT }}>
            Only enter settings prescribed or confirmed by your healthcare professional. Dose
            calculations stay off until you confirm your settings.
          </p>
        </div>
      </div>
    </OnboardingShell>
  );
}