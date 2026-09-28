import { useState } from "react";
import { ChevronDown } from "lucide-react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import MiniActivitySparkline from "./MiniActivitySparkline";
import { getDoseTimingInfo, isBasalInsulinType } from "@/lib/insulinPharmacology";

const PALETTE = {
  ink: "#3f3830",
  muted: "#8a7f70",
  faint: "#746959",
  copper: "#9c5228",
  beige: "#e4dccf",
  track: "rgba(63,56,48,0.06)",
  hairline: "#eadccf",
};

function fmtUnits(u) {
  const n = Number(u);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function formatRemaining(min) {
  if (!Number.isFinite(min) || min <= 0) return null;
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/**
 * Active Support: a calm, sentence-first summary of what insulin is working
 * right now vs what the user's plan suggested. The card does the math for the
 * reader: a plain-English sentence, a two-segment bar, an expandable breakdown,
 * and per-dose activity rows. Describes, never prescribes.
 */
export default function EstimatedSupportCard({ details }) {
  const [showMath, setShowMath] = useState(false);

  if (!details) return null;

  const d = details;
  const hasPlan = Number.isFinite(d.insulinSensitivityMgDlPerUnit)
    && d.insulinSensitivityMgDlPerUnit > 0
    && Number.isFinite(d.mealInsulinUnitsPer5g)
    && d.mealInsulinUnitsPer5g > 0;

  if (!hasPlan) return null;

  // ---- Values ----
  const carbs = d.meal?.carbs ?? 0;
  const foodUnits = Number.isFinite(d.expectedMealUnits) ? d.expectedMealUnits : 0;
  const correctionUnits = Number.isFinite(d.correctionUnitsNeeded) && d.correctionUnitsNeeded > 0
    ? d.correctionUnitsNeeded
    : 0;
  const suggested = foodUnits + correctionUnits;
  const taken = Number.isFinite(d.loggedTotalUnits) ? d.loggedTotalUnits : 0;
  const activeNow = Number.isFinite(d.activeIOB) ? d.activeIOB : (Number.isFinite(d.bolusIOB) ? d.bolusIOB : 0);
  const difference = taken - suggested;
  const absDiff = Math.abs(difference);

  const gramsPerUnit = Number.isFinite(d.gramsPerUnit) ? d.gramsPerUnit : 5 / d.mealInsulinUnitsPer5g;
  const ratioLabel = `1:${gramsPerUnit.toFixed(1)}`;
  const isfLabel = Math.round(d.insulinSensitivityMgDlPerUnit);
  const targetLabel = Math.round(d.correctionTargetGlucose);

  // ---- Correction line ----
  const correctionAvailable = Number.isFinite(d.correctionGlucoseValue);
  const startingGlucose = correctionAvailable ? Math.round(d.correctionGlucoseValue) : null;
  const targetLow = d.targetLow ?? 70;
  const targetHigh = d.targetHigh ?? 180;

  let correctionLabel;
  let correctionValue;
  if (!correctionAvailable) {
    correctionLabel = "Correction, no reading";
    correctionValue = "-";
  } else if (correctionUnits > 0.01) {
    correctionLabel = `Correction, start ${startingGlucose} / target ${targetLabel}`;
    correctionValue = `${correctionUnits.toFixed(1)}u`;
  } else {
    const inRange = startingGlucose >= targetLow && startingGlucose <= targetHigh;
    correctionLabel = `Correction, ${inRange ? "in range" : "out of range"} at dose time`;
    correctionValue = "0u";
  }

  // ---- Sentence ----
  const takenStr = `${fmtUnits(taken)}u`;
  const suggestedStr = `${suggested.toFixed(1)}u`;
  const diffStr = `${absDiff.toFixed(1)}u`;

  let sentence;
  if (absDiff < 0.05) {
    sentence = (
      <>
        You took <strong className="font-bold">{takenStr}</strong> for this meal. That matches your plan.
      </>
    );
  } else if (difference > 0) {
    sentence = (
      <>
        You took <strong className="font-bold">{takenStr}</strong> for this meal. Your plan suggested{" "}
        <strong className="font-bold">{suggestedStr}</strong>, so that's{" "}
        <strong className="font-bold">{diffStr} more.</strong>
      </>
    );
  } else {
    sentence = (
      <>
        You took <strong className="font-bold">{takenStr}</strong> for this meal. Your plan suggested{" "}
        <strong className="font-bold">{suggestedStr}</strong>, so that's{" "}
        <strong className="font-bold">{diffStr} less.</strong>
      </>
    );
  }

  // ---- Bar widths (computed from exact values) ----
  const maxVal = Math.max(suggested, taken, 0.1);
  const suggestedPct = (suggested / maxVal) * 100;
  const extraPct = difference > 0.05 ? (absDiff / maxVal) * 100 : 0;
  const takenPct = (taken / maxVal) * 100;

  // ---- Active doses ----
  const now = Date.now();
  const activeDoses = (d.bolusIOBBreakdown || []).filter(
    (dose) => !isBasalInsulinType(dose.type) && dose.iob > 0.01
  );

  // ---- Rescue carbs ----
  const rescueGrams = Number.isFinite(d.rescueCarbs) && d.rescueCarbs > 0 ? Math.round(d.rescueCarbs) : 0;

  return (
    <DashboardCard className="p-4">
      {/* 1. HERO */}
      <div className="section-label">Active Support</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="anchor" style={{ fontSize: 34 }}>{activeNow.toFixed(1)}</span>
        <span className="text-[15px] font-light" style={{ color: PALETTE.muted }}>u active now</span>
      </div>

      {/* 2. SENTENCE */}
      <p className="mt-3 text-[13px] leading-relaxed" style={{ color: PALETTE.ink }}>
        {sentence}
      </p>

      {/* 3. PROGRESS BAR */}
      <div
        className="mt-3 flex h-3.5 w-full overflow-hidden rounded-full"
        style={{ background: PALETTE.track }}
      >
        {difference >= 0 ? (
          <>
            <div style={{ width: `${suggestedPct}%`, background: PALETTE.beige }} />
            {extraPct > 0 && (
              <div style={{ width: `${extraPct}%`, background: PALETTE.copper }} />
            )}
          </>
        ) : (
          <div style={{ width: `${takenPct}%`, background: PALETTE.beige }} />
        )}
      </div>

      {/* 4. LEGEND */}
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: PALETTE.beige }} />
          <span className="text-[11px]" style={{ color: PALETTE.muted }}>
            Your plan suggested, {suggested.toFixed(1)}u
          </span>
        </div>
        {difference > 0.05 && (
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: PALETTE.copper }} />
            <span className="text-[11px]" style={{ color: PALETTE.muted }}>
              The extra you took, {absDiff.toFixed(1)}u
            </span>
          </div>
        )}
      </div>

      {/* 5. THE MATH (accordion) */}
      <button
        type="button"
        onClick={() => setShowMath((s) => !s)}
        className="mt-4 flex w-full items-center justify-between"
        style={{ paddingBottom: 0, borderBottom: "none" }}
      >
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: PALETTE.faint }}
        >
          The Math
        </span>
        <ChevronDown
          size={14}
          style={{
            color: PALETTE.faint,
            transform: showMath ? "rotate(180deg)" : "none",
            transition: "transform 200ms",
          }}
        />
      </button>
      {showMath && (
        <div className="mt-2 space-y-1.5">
          <div className="flex items-baseline">
            <span className="text-[12px]" style={{ color: PALETTE.muted }}>
              Food, {Math.round(carbs)}g at {ratioLabel}
            </span>
            <span className="mx-2 flex-1 dotted-leader" />
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
              {foodUnits.toFixed(1)}u
            </span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[12px]" style={{ color: PALETTE.muted }}>{correctionLabel}</span>
            <span className="mx-2 flex-1 dotted-leader" />
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
              {correctionValue}
            </span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[12px]" style={{ color: PALETTE.muted }}>You took</span>
            <span className="mx-2 flex-1 dotted-leader" />
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
              {taken.toFixed(1)}u
            </span>
          </div>
          <div className="flex items-baseline">
            <span className="text-[12px]" style={{ color: PALETTE.muted }}>Active now</span>
            <span className="mx-2 flex-1 dotted-leader" />
            <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
              {activeNow.toFixed(1)}u
            </span>
          </div>
        </div>
      )}

      {/* 6. ACTIVE DOSES */}
      {activeDoses.length > 0 && (
        <div className="mt-4">
          <div className="section-label" style={{ marginTop: 0 }}>Active Doses</div>
          <div className="mt-2 space-y-2.5">
            {activeDoses.map((dose) => {
              const doseObj = {
                insulin_type: dose.type,
                units: dose.units,
                administered_at: new Date(dose.time).toISOString(),
              };
              const timing = getDoseTimingInfo(doseObj, now);
              const remaining = formatRemaining(timing.remainingMin);
              const shortName = dose.type?.split(" ")[0] || "Insulin";
              return (
                <div key={dose.id} className="flex items-center gap-2.5">
                  <span className="shrink-0" style={{ color: PALETTE.copper }}>
                    <MiniActivitySparkline dose={dose} now={now} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-semibold" style={{ color: PALETTE.ink }}>
                      {shortName}, {fmtUnits(dose.units)}u dose
                    </span>
                    <span className="block text-[11px]" style={{ color: PALETTE.muted }}>
                      {dose.iob < 1.0 ? "Less than 1u left" : `${fmtUnits(dose.iob)}u left`}
                    </span>
                  </div>
                  {remaining && (
                    <span className="shrink-0 text-[10px] tabular-nums" style={{ color: PALETTE.faint }}>
                      clears in {remaining}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rescue carbs note */}
      {rescueGrams > 0 && (
        <p className="mt-3 text-[11px] leading-relaxed" style={{ color: PALETTE.faint }}>
          {rescueGrams}g rescue carbs logged (not part of the math).
        </p>
      )}

      {/* YOUR PLAN footer */}
      <div
        className="mt-3 flex items-baseline justify-between border-t pt-2.5"
        style={{ borderColor: PALETTE.hairline }}
      >
        <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>
          Your plan
        </span>
        <span className="text-[11px] tabular-nums" style={{ color: PALETTE.muted }}>
          I:C {ratioLabel}, ISF 1:{isfLabel}, target {targetLabel}
        </span>
      </div>
    </DashboardCard>
  );
}