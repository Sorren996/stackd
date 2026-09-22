import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Clock, ChevronDown, ChevronUp } from "lucide-react";

const RESCUE_COLOR = "#8a6db8";
const PALETTE = {
  green: "#5b6550",
  amber: "#af751b",
  muted: "#8a7f70",
  bolus: "#5ba3b8",
};

const TREND_ARROW = {
  "double_up": "⇈",
  up: "↑",
  "up-right": "↗",
  right: "→",
  "down-right": "↘",
  down: "↓",
  "double_down": "⇊",
};

function roundUnits(v) {
  return Math.round(Number(v) || 0);
}

function formatElapsed(ms) {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

function SectionLabel({ children }) {
  return <p className="stackd-section-label">{children}</p>;
}

/**
 * Similar Meals — fetches historical MealResponseAnalysis records with
 * similar carbohydrate amounts and shows how they actually behaved.
 * Observational only; never produces a dosing recommendation.
 */
function useSimilarMeals(mealCarbs, enabled) {
  return useQuery({
    queryKey: ["similar-meals", mealCarbs],
    queryFn: async () => {
      const records = await base44.entities.MealResponseAnalysis.list("-meal_time", 100);
      if (!Array.isArray(records) || !mealCarbs) return [];
      const tolerance = Math.max(10, mealCarbs * 0.2);
      return records
        .filter(
          (r) =>
            r.analysis_status === "complete" &&
            Number.isFinite(r.carbs_logged) &&
            Number.isFinite(r.peak_glucose) &&
            Math.abs(r.carbs_logged - mealCarbs) <= tolerance
        )
        .slice(0, 5);
    },
    enabled: enabled && mealCarbs > 0,
    staleTime: 5 * 60 * 1000,
  });
}

function SimilarMealsSection({ mealCarbs }) {
  const { data: similarMeals } = useSimilarMeals(mealCarbs, true);
  const meals = similarMeals || [];

  if (meals.length < 1) return null;

  const peaks = meals.map((m) => Number(m.peak_glucose)).filter(Number.isFinite);
  const timesToPeak = meals
    .map((m) => {
      if (!m.peak_time || !m.meal_time) return null;
      return (new Date(m.peak_time).getTime() - new Date(m.meal_time).getTime()) / 60000;
    })
    .filter(Number.isFinite);

  const avgPeak = peaks.length ? Math.round(peaks.reduce((s, p) => s + p, 0) / peaks.length) : null;
  const avgTimeToPeak = timesToPeak.length
    ? formatElapsed((timesToPeak.reduce((s, t) => s + t, 0) / timesToPeak.length) * 60000)
    : null;

  return (
    <section>
      <SectionLabel>Similar Meals</SectionLabel>
      <p className="mt-1 text-[11px] text-white/45">
        <span className="text-white/55">{meals.length} previous meal{meals.length === 1 ? "" : "s"}</span>
        {avgPeak && <> · Avg peak {avgPeak} mg/dL</>}
        {avgTimeToPeak && <> · Avg to peak {avgTimeToPeak}</>}
      </p>
      <div className="mt-1.5 space-y-1">
        {meals.slice(0, 3).map((m) => {
          const timeToPeak =
            m.peak_time && m.meal_time
              ? formatElapsed(new Date(m.peak_time).getTime() - new Date(m.meal_time).getTime())
              : null;
          return (
            <div key={m.id} className="flex items-center justify-between text-[11px] text-white/40">
              <span>{Math.round(m.carbs_logged)}g carbs</span>
              <span>Peak {Math.round(m.peak_glucose)} mg/dL</span>
              {timeToPeak && <span>{timeToPeak} to peak</span>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function HowCalculatedSection({ d }) {
  const [open, setOpen] = useState(false);

  const mealCarbs = Math.round(d.meal?.carbs || 0);
  const gramsPerUnit = d.gramsPerUnit;
  const mealUnits = roundUnits(d.expectedMealUnits);
  const hasCorrection = d.correctionGlucoseAvailable && d.correctionUnitsNeeded > 0.01;
  const correctionUnits = roundUnits(d.correctionUnitsNeeded);
  const totalEstimate = roundUnits(d.grossDoseEstimate);
  const glucoseAtStart = Math.round(d.correctionGlucoseValue || 0);
  const target = Math.round(d.correctionTargetGlucose || 0);
  const sensitivity = d.insulinSensitivityMgDlPerUnit;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-[11px] font-medium text-white/40 transition hover:text-white/60"
      >
        How is this calculated?
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-1.5 space-y-0.5 pl-3 text-[11px] leading-relaxed text-white/45">
          <p>{mealCarbs}g meal carbs</p>
          {Number.isFinite(gramsPerUnit) && gramsPerUnit > 0 && (
            <p>÷ {Number(gramsPerUnit.toFixed(1))}g per unit (your carb ratio)</p>
          )}
          <p>= {mealUnits}u meal insulin</p>
          {hasCorrection && (
            <>
              <p className="pt-1">{glucoseAtStart} mg/dL at meal start</p>
              <p>− {target} mg/dL target</p>
              {Number.isFinite(sensitivity) && sensitivity > 0 && (
                <p>÷ {Math.round(sensitivity)} mg/dL per unit (your sensitivity)</p>
              )}
              <p>= {correctionUnits}u correction</p>
            </>
          )}
          <p className="pt-1.5 font-semibold text-white/65">
            {mealUnits}u + {hasCorrection ? `${correctionUnits}u` : "0u"} = {totalEstimate}u estimated bolus
          </p>
          <p className="pt-1 text-[10px] text-white/30">
            Estimate only — not a dosing recommendation. Rescue carbs excluded.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Meal Review — a clear, human-readable analysis of the meal.
 * Focuses exclusively on the meal, glucose response, and BOLUS insulin.
 * Basal insulin is never shown here — it belongs in the IOB experience.
 * All insulin values are displayed as whole units.
 */
export default function MealReviewContent({ mealInsight, monitoringStatus, glucoseTrend, onResolve }) {
  if (!mealInsight) return null;

  const d = mealInsight.details;
  const trendArrow = glucoseTrend?.icon ? TREND_ARROW[glucoseTrend.icon] : null;
  const trendColor = glucoseTrend?.color || PALETTE.muted;

  // ── NO ACTIVE MEAL ──────────────────────────────────────────────
  if (!d || d.noActiveMeal) {
    return (
      <div className="p-1">
        <p className="text-sm text-white/40">No meal to review yet.</p>
      </div>
    );
  }

  // ── SETUP STATE ────────────────────────────────────────────────
  if (!d.meal) {
    const needsSetup = mealInsight.value === "Setup needed";
    return (
      <div className="space-y-2 p-1">
        <SectionLabel>Meal Review</SectionLabel>
        <p className="text-sm font-semibold text-white/75">{mealInsight.value}</p>
        <p className="text-[11px] leading-relaxed text-white/40">
          {needsSetup
            ? "Add your insulin-to-carb ratio and sensitivity in Settings to see meal balance."
            : "Log a meal to open a review window."}
        </p>
      </div>
    );
  }

  // ── ACTIVE MEAL ────────────────────────────────────────────────
  const mealCarbs = Math.round(d.meal?.carbs || 0);
  const rescueCarbs = d.rescueCarbs || 0;
  const bolusTaken = roundUnits(d.loggedTotalUnits || 0);
  const bolusEstimated = roundUnits(d.grossDoseEstimate || 0);
  const bolusActive = roundUnits(d.bolusIOB || 0);
  const peakOutcome = d.peakOutcome;
  const peakOutcomeTime = d.peakOutcomeTime;
  const mealTime = d.meal?.time;
  const glucoseNow = Number.isFinite(d.latestGlucoseValue) ? d.latestGlucoseValue : d.windowEndGlucoseValue;
  const hasCurrentGlucose = Number.isFinite(glucoseNow);
  const glucoseAtStart = d.glucoseValue;
  const hasStartingGlucose = Number.isFinite(glucoseAtStart);

  const elapsedMs = Number.isFinite(mealTime) ? Date.now() - mealTime : null;
  const peakAfterMs =
    Number.isFinite(peakOutcomeTime) && Number.isFinite(mealTime) ? peakOutcomeTime - mealTime : null;
  const peakRise =
    Number.isFinite(peakOutcome) && hasStartingGlucose ? peakOutcome - glucoseAtStart : null;

  return (
    <div className="space-y-4 p-1 pb-6">
      <SectionLabel>Meal Review</SectionLabel>

      {/* ROW 1 — Glucose Summary: Current | Peak */}
      {(hasCurrentGlucose || Number.isFinite(peakOutcome)) && (
        <div className="grid grid-cols-2 gap-6">
          {hasCurrentGlucose && (
            <div>
              <SectionLabel>Current Glucose</SectionLabel>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white">{Math.round(glucoseNow)}</span>
                <span className="text-[11px] text-white/40">mg/dL</span>
                {trendArrow && (
                  <span className="ml-0.5 text-lg font-bold" style={{ color: trendColor }}>
                    {trendArrow}
                  </span>
                )}
              </div>
              {elapsedMs !== null && (
                <p className="mt-0.5 text-[11px] text-white/40">{formatElapsed(elapsedMs)} since meal</p>
              )}
            </div>
          )}
          {Number.isFinite(peakOutcome) && (
            <div>
              <SectionLabel>Peak Since Meal</SectionLabel>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold text-white">{Math.round(peakOutcome)}</span>
                <span className="text-[11px] text-white/40">mg/dL</span>
              </div>
              {(peakAfterMs !== null || (peakRise !== null && peakRise > 0)) && (
                <p className="mt-0.5 text-[11px] text-white/40">
                  {peakAfterMs !== null && `${formatElapsed(peakAfterMs)} after meal`}
                  {peakAfterMs !== null && peakRise !== null && peakRise > 0 && " · "}
                  {peakRise !== null && peakRise > 0 && (
                    <span style={{ color: PALETTE.amber }}>+{Math.round(peakRise)} mg/dL from starting</span>
                  )}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ROW 2 — Meal + Bolus Insulin */}
      <div className="grid grid-cols-2 gap-6">
        <div>
          <SectionLabel>This Meal</SectionLabel>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{mealCarbs}g</span>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Meal Carbs</span>
          </div>
          {rescueCarbs > 0 && (
            <>
              <div className="mt-0.5 flex items-baseline gap-2">
                <span className="text-lg font-bold" style={{ color: RESCUE_COLOR }}>+{rescueCarbs}g</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: `${RESCUE_COLOR}99` }}>Rescue</span>
              </div>
              <p className="mt-0.5 text-[10px] text-white/30">Excluded from insulin estimation.</p>
            </>
          )}
        </div>
        <div>
          <SectionLabel>Bolus Insulin</SectionLabel>
          <div className="mt-1 flex items-start gap-6">
            <div>
              <p className="text-2xl font-bold leading-none text-white">{bolusTaken}u</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">Taken</p>
            </div>
            {bolusEstimated > 0 && (
              <div>
                <p className="text-2xl font-bold leading-none" style={{ color: PALETTE.bolus }}>{bolusEstimated}u</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/40">Estimated</p>
              </div>
            )}
          </div>
          <div className="mt-1.5">
            <HowCalculatedSection d={d} />
          </div>
        </div>
      </div>

      {/* ROW 3 — Bolus Active + Meal Outcome */}
      {(bolusActive > 0 || (hasStartingGlucose && Number.isFinite(peakOutcome) && hasCurrentGlucose)) && (
        <div className="grid grid-cols-2 gap-6">
          {bolusActive > 0 && (
            <div>
              <SectionLabel>Bolus Active</SectionLabel>
              <p className="mt-1 text-2xl font-bold leading-none text-white">{bolusActive}u</p>
              <p className="mt-0.5 text-[10px] text-white/40">Still active from meal/correction boluses</p>
            </div>
          )}
          {hasStartingGlucose && Number.isFinite(peakOutcome) && hasCurrentGlucose && (
            <div>
              <SectionLabel>Meal Outcome</SectionLabel>
              <div className="mt-1.5 flex items-center justify-between gap-1.5">
                <div className="text-center">
                  <p className="text-base font-bold text-white">{Math.round(glucoseAtStart)}</p>
                  <p className="text-[9px] text-white/40">Starting</p>
                </div>
                <span className="text-white/20">→</span>
                <div className="text-center">
                  <p className="text-base font-bold text-white">{Math.round(peakOutcome)}</p>
                  <p className="text-[9px] text-white/40">Peak</p>
                </div>
                <span className="text-white/20">→</span>
                <div className="text-center">
                  <p className="text-base font-bold text-white">{Math.round(glucoseNow)}</p>
                  <p className="text-[9px] text-white/40">Current</p>
                </div>
              </div>
              <div className="mt-1.5 space-y-0.5">
                {peakAfterMs !== null && (
                  <p className="text-[11px] text-white/40">{formatElapsed(peakAfterMs)} · Time to peak</p>
                )}
                {elapsedMs !== null && (
                  <p className="text-[11px] text-white/40">{formatElapsed(elapsedMs)} · Since meal</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Similar Meals — open text, no borders */}
      <SimilarMealsSection mealCarbs={mealCarbs} />

      {/* High protein/fat monitoring notice — open text, amber accent */}
      {monitoringStatus?.isActive && (
        <div>
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400/80" />
            <p className="text-[11px] font-semibold text-amber-400/90">Delayed meal response possible</p>
          </div>
          <p className="mt-0.5 pl-5 text-[10px] leading-relaxed text-white/40">
            Continue monitoring through{" "}
            <span className="font-medium text-amber-400/70">
              {new Date(monitoringStatus.endTime).toLocaleTimeString([], {
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          </p>
        </div>
      )}

      {/* Mark as Resolved — minimal text action */}
      {d.mealStillUnderReview && onResolve && (
        <button
          type="button"
          onClick={onResolve}
          className="flex w-full items-center justify-center gap-2 py-2 text-[12px] font-semibold transition hover:brightness-110"
          style={{ color: PALETTE.green }}
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
          Mark as Resolved
        </button>
      )}
    </div>
  );
}