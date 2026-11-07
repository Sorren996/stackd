import { useState } from "react";
import { ChevronLeft, Lock } from "lucide-react";
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
    <div>
      <div className="mb-1 flex items-center gap-1">
        <label className="text-[12px] font-semibold" style={{ color: INK }}>
          {label}
        </label>
        {info}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 rounded-2xl border px-4 py-3 text-sm focus:outline-none"
          style={{ background: CANVAS, borderColor: HAIRLINE, color: INK }}
        />
        {unit && (
          <span className="shrink-0 text-[12px]" style={{ color: TAUPE }}>
            {unit}
          </span>
        )}
      </div>
      {helper && (
        <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: FAINT }}>
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
    <div className="flex flex-col min-h-screen" style={{ background: CANVAS }}>
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),1rem)] pb-3"
        style={{ borderBottom: `1px solid ${HAIRLINE}` }}
      >
        <button
          onClick={onBack}
          aria-label="Back"
          className="flex h-11 w-11 items-center justify-center rounded-full"
          style={{ background: CREAM, border: `1px solid ${HAIRLINE}` }}
        >
          <ChevronLeft className="h-4 w-4" style={{ color: INK }} />
        </button>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: FAINT }}>
          Step 2 of 3
        </p>
      </div>

      {/* Title */}
      <div className="px-5 pt-6 pb-4">
        <h1 className="text-2xl font-bold leading-tight" style={{ color: INK }}>
          Your{" "}
          <em style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: 400 }}>
            prescribed
          </em>{" "}
          insulin settings
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: TAUPE }}>
          Use the settings from your care team. If you&rsquo;re unsure, you can skip this step.
        </p>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-5 space-y-5 pb-4">
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

      {/* Footer */}
      <div
        className="shrink-0 px-5 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] space-y-2.5"
        style={{ borderTop: `1px solid ${HAIRLINE}` }}
      >
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
      </div>
    </div>
  );
}