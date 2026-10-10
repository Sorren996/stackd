import { useState } from "react";
import { ChevronLeft, Lock } from "lucide-react";

const INK = "#3f3830";
const COPPER = "#9c5228";
const CREAM = "#fdf9f2";
const CANVAS = "#f7f1e8";
const HAIRLINE = "#eadccf";
const FAINT = "#746959";
const TAUPE = "#6b6153";

function FieldInput({ label, value, onChange, placeholder, unit }) {
  return (
    <div>
      <label
        className="text-[10px] font-bold uppercase tracking-[0.16em] block mb-1.5"
        style={{ color: FAINT }}
      >
        {label}
      </label>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-2xl border px-4 py-3 text-sm focus:outline-none"
          style={{ background: CANVAS, borderColor: HAIRLINE, color: INK }}
        />
        {unit && (
          <span className="text-[12px] shrink-0" style={{ color: TAUPE }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Step 2 — Dose Plan (optional, skippable).
 * Presents insulin sensitivity, carb ratio, and correction target fields
 * with a "Confirm my plan" button and a "Skip for now" option. If skipped,
 * dose math stays paused per the existing settings_confirmed gate.
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
          className="flex h-9 w-9 items-center justify-center rounded-full"
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
        <h1 className="text-2xl font-bold" style={{ color: INK }}>
          Your{" "}
          <em style={{ fontFamily: "Georgia, serif", fontStyle: "italic", fontWeight: 400 }}>
            dose plan
          </em>
        </h1>
        <p className="mt-2 text-sm leading-relaxed" style={{ color: TAUPE }}>
          Enter your prescribed settings to unlock dose insights. You can skip and set this up later in
          Settings.
        </p>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-5 space-y-5 pb-4">
        <div
          className="rounded-2xl p-4 space-y-4"
          style={{ background: CREAM, border: `1px solid ${HAIRLINE}` }}
        >
          <FieldInput
            label="Insulin sensitivity"
            value={sensitivity}
            onChange={setSensitivity}
            placeholder="50"
            unit="mg/dL per U"
          />
          <FieldInput
            label="Carb ratio"
            value={carbRatio}
            onChange={setCarbRatio}
            placeholder="2.5"
            unit="U per 5g"
          />
          <FieldInput
            label="Correction target"
            value={correctionTarget}
            onChange={setCorrectionTarget}
            placeholder="110"
            unit="mg/dL"
          />
        </div>

        <div className="flex items-start gap-2 px-1">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: COPPER }} />
          <p className="text-[11px] leading-relaxed" style={{ color: FAINT }}>
            Only enter insulin settings prescribed or confirmed by your licensed healthcare
            professional. Dose math stays paused until you confirm.
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