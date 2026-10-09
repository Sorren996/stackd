import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import DashboardCard from "@/components/dashboard/DashboardCard";
import AbsorptionProgressCurve from "./AbsorptionProgressCurve";
import MealReviewChart from "./MealReviewChart";
import MealCollapsibleRow from "./MealCollapsibleRow";
import SwipeableRow from "@/components/SwipeableRow";
import { base44 } from "@/api/base44Client";
import { generateMealGlucoseResponse, analyzeGlucoseResponse } from "@/lib/mealGlucoseResponse";
import MealEditOverlay from "@/components/insulin/MealEditOverlay";
import { getCarbAbsorptionAt, getMealWindowMinutes, getMealPeakMinutes } from "@/lib/carbAbsorption";
import { useMealModelResolution, entrySpeedFactorFromResolution, hasLearnedTimingFromResolution, learnedTimingCaptionFromResolution, deriveSpeedClass } from "@/hooks/useMealModelResolution";
import { getDoseTimingInfo, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { formatIOBValue, IOB_FLOOR } from "@/lib/iobModel";
import { formatGlucose, formatGlucoseDelta, glucoseUnitLabel } from "@/lib/glucoseUnits";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  green: "#4d5742",
  amber: "#8a5a12",
  red: "#9c3f2e",
  copper: "#9c5228",
  beige: "#e4dccf",
  track: "rgba(63,56,48,0.08)",
  hairline: "#eadccf",
  canvas: "#f7f1e8",
  card: "#fdf9f2",
};

const TREND_PHRASE = {
  "Rising quickly": "rising quickly",
  "Rising": "rising",
  "Slowly rising": "easing up",
  "Stable": "steady",
  "Slowly falling": "easing down",
  "Falling": "falling",
  "Falling quickly": "falling quickly",
};

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDuration(min) {
  if (!Number.isFinite(min) || min <= 0) return "-";
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function formatCountdownValue(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "Closed";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

function fmtUnits(u) {
  const n = Number(u);
  if (!Number.isFinite(n)) return "0";
  return n % 1 === 0 ? String(n) : n.toFixed(1);
}

function formatDoseClockTime(time) {
  if (!Number.isFinite(time)) return null;
  const d = new Date(time);
  const h = d.getHours();
  const m = d.getMinutes();
  const period = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")}${period}`;
}

function formatRemaining(min) {
  if (!Number.isFinite(min) || min <= 0) return null;
  const m = Math.round(min);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

export default function MealReviewAtAGlance({ mealInsight, monitoringStatus, glucoseTrend, onResolve, glucoseReadings, hideIdentity = false }) {
  const [editEntries, setEditEntries] = useState(null);
  const [openEntryId, setOpenEntryId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const queryClient = useQueryClient();
  const now = Date.now();
  const { resolution } = useMealModelResolution(Boolean(mealInsight));

  const d = mealInsight?.details;
  const mealTime = d?.meal?.time ?? now;
  const carbEntries = d?.mealGroup?.carbEntries || (d?.meal ? [d.meal] : []);
  const targetLow = d?.targetLow || 70;
  const targetHigh = d?.targetHigh || 180;

  const mealResponse = useMemo(
    () => generateMealGlucoseResponse(carbEntries, mealTime, now),
    [carbEntries, mealTime, now]
  );
  const glucoseAnalysis = useMemo(
    () => analyzeGlucoseResponse(glucoseReadings, mealTime, targetLow, targetHigh, now, d?.glucoseValue),
    [glucoseReadings, mealTime, targetLow, targetHigh, now, d?.glucoseValue]
  );

  useEffect(() => {
    if (openEntryId == null) return;
    const onPointerDown = (e) => {
      const openRow = document.querySelector(`[data-row-id="${openEntryId}"]`);
      if (openRow && openRow.contains(e.target)) return;
      setOpenEntryId(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [openEntryId]);

  if (!mealInsight) {
    return (
      <DashboardCard className="p-4 space-y-1">
        <p className="text-[14px] font-semibold" style={{ color: PALETTE.ink }}>Meal review is gathering</p>
        <p className="text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
          Once your most recent nourishment and support are in, the review opens here.
        </p>
      </DashboardCard>
    );
  }

  if (!d || d.noActiveMeal) {
    return (
      <DashboardCard className="p-4">
        <p className="text-[13px]" style={{ color: PALETTE.muted }}>No meal to review yet. Log nourishment to open a window.</p>
      </DashboardCard>
    );
  }

  if (!d.meal) {
    return (
      <DashboardCard className="p-4 space-y-1">
        <p className="text-[14px] font-semibold" style={{ color: PALETTE.ink }}>{mealInsight.value}</p>
        <p className="text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
          Add your insulin-to-carb ratio and sensitivity in Settings to see meal balance.
        </p>
      </DashboardCard>
    );
  }

  // ---- Window + absorption ----
  const mealFatGrams = carbEntries.reduce((s, e) => s + Number(e.fat_grams || 0), 0);
  const mealProteinGrams = carbEntries.reduce((s, e) => s + Number(e.protein_grams || 0), 0);
  const dynamicWindowMin = getMealWindowMinutes(mealFatGrams, mealProteinGrams);
  const dynamicWindowMs = dynamicWindowMin * 60 * 1000;
  const reviewWindowEnd = d.reviewWindowEnd || mealTime + dynamicWindowMs;
  const windowRemaining = reviewWindowEnd - now;
  const minutesSinceMeal = (now - mealTime) / 60000;

  const primarySpeedFactor = (() => {
    const withClass = carbEntries[0] ? { ...carbEntries[0], speed_class: carbEntries[0].speed_class || deriveSpeedClass(carbEntries[0]) } : null;
    return withClass ? entrySpeedFactorFromResolution(resolution, withClass) : null;
  })();
  const learnedTiming = Boolean(carbEntries.length) && hasLearnedTimingFromResolution(resolution, { speed_class: deriveSpeedClass(carbEntries[0]) });
  const timingCaption = carbEntries.length ? learnedTimingCaptionFromResolution(resolution, carbEntries[0]) : null;
  const absorptionOpts = primarySpeedFactor != null ? { speedFactor: primarySpeedFactor } : {};

  let totalAbsorbed = 0;
  let totalRemaining = 0;
  let rateGPerMin = 0;
  carbEntries.forEach((entry) => {
    if (!entry || !Number.isFinite(entry.carbs)) return;
    const forCalc = !entry.absorption_profile || entry.is_custom
      ? { ...entry, absorption_profile: entry.absorption_profile || "medium", is_custom: false, dual_wave: entry.dual_wave }
      : entry;
    const r = getCarbAbsorptionAt(forCalc, now, absorptionOpts);
    totalAbsorbed += r.absorbedGrams || 0;
    totalRemaining += r.remainingGrams || 0;
    rateGPerMin += r.absorptionRateGPerMin || 0;
  });
  const totalCarbs = totalAbsorbed + totalRemaining;
  const absorptionPct = totalCarbs > 0 ? Math.min(100, totalAbsorbed / totalCarbs * 100) : 0;
  const gPerHour = rateGPerMin * 60;
  const tooEarlyToRead = minutesSinceMeal < 15;

  const absorptionPeakMin = (() => {
    const entry = carbEntries[0];
    if (!entry) return 60;
    const forCalc = !entry.absorption_profile || entry.is_custom
      ? { ...entry, absorption_profile: entry.absorption_profile || "medium", is_custom: false, dual_wave: entry.dual_wave }
      : entry;
    return getCarbAbsorptionAt(forCalc, now, absorptionOpts).peakMin;
  })();
  const absorptionPeakTime = mealTime + absorptionPeakMin * 60000;
  const isDualWaveMeal = (carbEntries[0]?.dual_wave || deriveSpeedClass(carbEntries[0]) === "high_fat");
  const firstWavePassed = absorptionPeakTime <= now;
  const peakMinAgo = firstWavePassed ? Math.round((now - absorptionPeakTime) / 60000) : null;
  const absorptionCaption = firstWavePassed
    ? (absorptionPct >= 90 ? "Absorption nearly complete" : (isDualWaveMeal ? `First wave peaked ${peakMinAgo}m ago — a second wave may follow` : `Absorption peaked ${peakMinAgo}m ago`))
    : (absorptionPct < 5 ? "Just starting to absorb" : (isDualWaveMeal ? "Rising through the first wave" : "Rising toward peak"));

  // ---- Glucose now + trend ----
  const glucoseNow = Number.isFinite(d.latestGlucoseValue) ? d.latestGlucoseValue
    : (Number.isFinite(d.windowEndGlucoseValue) ? d.windowEndGlucoseValue : d.glucoseValue);
  const glucoseAtStart = d.glucoseValue;
  const peakOutcome = d.peakOutcome;
  const trendPhrase = glucoseTrend?.label ? (TREND_PHRASE[glucoseTrend.label] || glucoseTrend.label.toLowerCase()) : null;

  const hasPostMealReading = (glucoseReadings || []).some((r) => new Date(r.recorded_at).getTime() > mealTime);
  const waitingForReadings = !hasPostMealReading && windowRemaining > 0;

  // ---- Insulin / math ----
  const activeNow = Number.isFinite(d.activeIOB) ? d.activeIOB : (Number.isFinite(d.bolusIOB) ? d.bolusIOB : 0);
  const taken = Number.isFinite(d.loggedTotalUnits) ? d.loggedTotalUnits : 0;
  const hasPlan = Number.isFinite(d.insulinSensitivityMgDlPerUnit) && d.insulinSensitivityMgDlPerUnit > 0
    && Number.isFinite(d.mealInsulinUnitsPer5g) && d.mealInsulinUnitsPer5g > 0;
  const foodUnits = Number.isFinite(d.expectedMealUnits) ? d.expectedMealUnits : 0;
  const correctionUnits = Number.isFinite(d.correctionUnitsNeeded) && d.correctionUnitsNeeded > 0 ? d.correctionUnitsNeeded : 0;
  const suggested = foodUnits + correctionUnits;
  const difference = taken - suggested;
  const absDiff = Math.abs(difference);
  const gramsPerUnit = Number.isFinite(d.gramsPerUnit) ? d.gramsPerUnit : 5 / d.mealInsulinUnitsPer5g;
  const ratioLabel = `1:${gramsPerUnit.toFixed(1)}`;
  const isfLabel = Math.round(d.insulinSensitivityMgDlPerUnit);
  const targetLabel = formatGlucose(d.correctionTargetGlucose);
  const unitLabel = glucoseUnitLabel();
  const activeFraction = taken > 0 ? Math.max(0, Math.min(1, activeNow / taken)) : 0;

  const correctionAvailable = Number.isFinite(d.correctionGlucoseValue);
  const startingGlucose = correctionAvailable ? formatGlucose(d.correctionGlucoseValue) : null;
  let correctionLabel;
  let correctionValue;
  if (!correctionAvailable) {
    correctionLabel = "Correction, no reading";
    correctionValue = "-";
  } else if (correctionUnits > 0.01) {
    correctionLabel = `Correction, start ${startingGlucose} / target ${targetLabel} ${unitLabel}`;
    correctionValue = `${correctionUnits.toFixed(1)}u`;
  } else {
    const inRange = startingGlucose >= targetLow && startingGlucose <= targetHigh;
    correctionLabel = `Correction, ${inRange ? "in range" : "out of range"} at dose time`;
    correctionValue = "0u";
  }

  const activeDoses = (d.bolusIOBBreakdown || []).filter(
    (dose) => !isBasalInsulinType(dose.type) && dose.iob > IOB_FLOOR
  );

  const rescueGrams = Number.isFinite(d.rescueCarbs) && d.rescueCarbs > 0 ? Math.round(d.rescueCarbs) : 0;
  const rescueEntries = Array.isArray(d.rescueCarbEntries) ? d.rescueCarbEntries : [];

  // ---- One insight line (qualitative only — never restates a number) ----
  let insightLine = null;
  if (waitingForReadings) {
    insightLine = "Your glucose response isn't available yet — still watching.";
  } else if (glucoseAnalysis.secondRise) {
    insightLine = "A second gentle climb appeared after the first peak.";
  } else if (monitoringStatus?.isActive) {
    insightLine = "High in fat and protein — glucose may climb later in the window.";
  } else if (mealResponse.hasDelayedRise) {
    insightLine = "Watching for a possible delayed wave.";
  } else {
    insightLine = "Steady through the window so far.";
  }

  // ---- Reconciliation (narrative integrity: separate estimate from observation) ----
  // Only mention "from your history" when personalization is active (learnedTiming).
  // Only mention "two waves" when the model estimates a dual-wave curve (isDualWaveMeal).
  // Describe the glucose observation separately — never claim the trace "followed"
  // a two-wave pattern when only peak timing was compared.
  const reconciliation = !waitingForReadings && glucoseAnalysis.timeToPeakMin != null
    ? (() => {
        const source = learnedTiming ? "Estimated from your meal and history" : "Estimated from your meal";
        const estimatePart = isDualWaveMeal ? "the absorption curve rose in two waves" : "the absorption curve peaked";
        const timingDiff = glucoseAnalysis.timeToPeakMin - absorptionPeakMin;
        const obsPart = Math.abs(timingDiff) <= 40
          ? "Your glucose peaked in line with the estimation."
          : timingDiff < 0
            ? "Your glucose peaked ahead of the estimation."
            : "Your glucose peaked behind the estimation.";
        return `${source}: ${estimatePart}. ${obsPart}`;
      })()
    : null;

  const mealName = d.meal?.food_name || d.meal?.name || "Meal";

  const handleDeleteEntry = async (entry) => {
    if (!entry?.id || deletingId) return;
    setDeletingId(entry.id);
    try {
      await base44.entities.CarbEntry.delete(entry.id);
      queryClient.invalidateQueries({ queryKey: ["carb-entries"] });
      queryClient.invalidateQueries({ queryKey: ["carb-entries", "graph"] });
      queryClient.invalidateQueries({ queryKey: ["history-summary"] });
      toast.success("Item removed");
    } catch {
      toast.error("Unable to remove item. Please try again.");
    } finally {
      setDeletingId(null);
      setOpenEntryId(null);
    }
  };

  return (
    <div className="space-y-3">
      <DashboardCard className="p-4">
        {/* 1. Header — meal name + timestamp only */}
        {!hideIdentity && (
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate text-[15px] font-semibold" style={{ color: PALETTE.ink }}>{mealName}</span>
            <span className="shrink-0 text-[11px] tabular-nums" style={{ color: PALETTE.faint }}>{formatClock(mealTime)}</span>
          </div>
        )}

        {/* 2. Anchor row — glucose now (left) + active insulin (right) */}
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <span className="text-4xl font-bold tabular-nums leading-none" style={{ color: PALETTE.ink }}>
              {Number.isFinite(glucoseNow) ? formatGlucose(glucoseNow) : "-"}
            </span>
            <span className="mt-1 block text-[11px]" style={{ color: PALETTE.faint }}>
              {unitLabel} · now{trendPhrase ? ` · ${trendPhrase}` : ""}
            </span>
          </div>
          <div className="shrink-0 text-right">
            <span className="text-lg font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{activeNow.toFixed(1)}u</span>
            <span className="block text-[11px]" style={{ color: PALETTE.faint }}>active insulin</span>
          </div>
        </div>

        {/* 3. Glucose chart hero */}
        <MealReviewChart
          glucoseReadings={glucoseReadings}
          mealTime={mealTime}
          reviewWindowEnd={reviewWindowEnd}
          now={now}
          targetLow={targetLow}
          targetHigh={targetHigh}
          startValue={glucoseAtStart}
          peakValue={peakOutcome}
          timeToPeakMin={glucoseAnalysis.timeToPeakMin}
          deltaFromBaseline={glucoseAnalysis.deltaFromBaseline}
        />

        {/* 4. One insight line */}
        <div className="mt-3 rounded-[12px] px-3 py-2" style={{ background: PALETTE.canvas }}>
          <p className="text-[12px] leading-relaxed" style={{ color: PALETTE.ink }}>{insightLine}</p>
        </div>

        {/* 5. Collapsed rows */}
        <div className="mt-2">
          {/* Active insulin */}
          <MealCollapsibleRow
            label="Active insulin"
            preview={
              <div className="flex items-center gap-2">
                <span className="text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{activeNow.toFixed(1)}u</span>
                <span className="block h-1.5 w-16 overflow-hidden rounded-full" style={{ background: PALETTE.track }}>
                  <span className="block h-full rounded-full" style={{ width: `${activeFraction * 100}%`, background: PALETTE.copper }} />
                </span>
              </div>
            }
          >
            <div className="space-y-2.5">
              {activeDoses.length > 0 ? (
                activeDoses.map((dose) => {
                  const doseObj = { insulin_type: dose.type, units: dose.units, administered_at: new Date(dose.time).toISOString() };
                  const timing = getDoseTimingInfo(doseObj, now);
                  const remaining = formatRemaining(timing.remainingMin);
                  const shortName = dose.type?.split(" ")[0] || "Insulin";
                  return (
                    <div key={dose.id} className="flex items-center gap-2.5">
                      <div className="min-w-0 flex-1">
                        <span className="text-[13px] font-semibold" style={{ color: PALETTE.ink }}>{shortName}, {fmtUnits(dose.units)}u dose</span>
                        <span className="block text-[11px] tabular-nums" style={{ color: PALETTE.muted }}>{formatIOBValue(dose.iob)}u left</span>
                      </div>
                      {remaining && (
                        <span className="shrink-0 text-[10px] tabular-nums" style={{ color: PALETTE.faint }}>clears in {remaining}</span>
                      )}
                    </div>
                  );
                })
              ) : (
                <p className="text-[12px]" style={{ color: PALETTE.muted }}>No bolus insulin active right now.</p>
              )}
              {Number.isFinite(d.priorActiveIOB) && d.priorActiveIOB > IOB_FLOOR && d.topPriorDose && (
                <p className="text-[11px] leading-relaxed" style={{ color: PALETTE.faint }}>
                  {d.priorActiveIOB.toFixed(1)}u still active from your {formatDoseClockTime(d.topPriorDose.time)} dose.
                </p>
              )}
            </div>
          </MealCollapsibleRow>

          {/* Dose vs the math */}
          {hasPlan && (
            <MealCollapsibleRow
              label="Dose vs the math"
              preview={
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums"
                  style={
                    absDiff < 0.05
                      ? { background: "rgba(77,87,66,0.12)", color: PALETTE.green, border: `1px solid rgba(77,87,66,0.22)` }
                      : difference > 0
                        ? { background: "rgba(156,82,40,0.12)", color: PALETTE.copper, border: `1px solid rgba(156,82,40,0.22)` }
                        : { background: "rgba(77,87,66,0.12)", color: PALETTE.green, border: `1px solid rgba(77,87,66,0.22)` }
                  }
                >
                  {absDiff < 0.05 ? "lines up" : `${absDiff.toFixed(1)}u ${difference > 0 ? "over" : "under"}`}
                </span>
              }
            >
              <div className="space-y-1.5">
                <div className="flex items-baseline">
                  <span className="text-[12px]" style={{ color: PALETTE.muted }}>Food, {Math.round(totalCarbs)}g at {ratioLabel}</span>
                  <span className="mx-2 flex-1 dotted-leader" />
                  <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{foodUnits.toFixed(1)}u</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-[12px]" style={{ color: PALETTE.muted }}>{correctionLabel}</span>
                  <span className="mx-2 flex-1 dotted-leader" />
                  <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{correctionValue}</span>
                </div>
                <div className="flex items-baseline">
                  <span className="text-[12px]" style={{ color: PALETTE.muted }}>You took</span>
                  <span className="mx-2 flex-1 dotted-leader" />
                  <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{taken.toFixed(1)}u</span>
                </div>
                <p className="pt-1 text-[10px] leading-relaxed" style={{ color: PALETTE.faint }}>
                  Describes your plan's math. Not a dose recommendation.
                </p>
                <div className="flex items-baseline justify-between border-t pt-2" style={{ borderColor: PALETTE.hairline }}>
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>Your plan</span>
                  <span className="text-[11px] tabular-nums" style={{ color: PALETTE.muted }}>I:C {ratioLabel}, ISF 1:{isfLabel}, target {targetLabel} {unitLabel}</span>
                </div>
              </div>
            </MealCollapsibleRow>
          )}

          {/* Response & context */}
          <MealCollapsibleRow label="Response & context" preview={null}>
            <div className="space-y-3">
              {tooEarlyToRead ? (
                <p className="text-[12px]" style={{ color: PALETTE.muted }}>Too early to read absorption.</p>
              ) : (
                <>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-[22px] font-light tabular-nums" style={{ color: PALETTE.ink }}>{Math.round(absorptionPct)}</span>
                      <span className="text-[13px] font-light" style={{ color: PALETTE.muted }}>% processed, {gPerHour.toFixed(1)} g/hour</span>
                    </div>
                    <p className="text-[11px]" style={{ color: PALETTE.faint }}>{Math.round(totalAbsorbed)} of {Math.round(totalCarbs)} g absorbed</p>
                    <div className="mt-2">
                      <AbsorptionProgressCurve entries={carbEntries} mealTime={mealTime} now={now} peakTime={absorptionPeakTime} opts={absorptionOpts} />
                    </div>
                    {reconciliation && (
                      <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>{reconciliation}</p>
                    )}
                    {learnedTiming && timingCaption && (
                      <p className="mt-1 text-[11px] leading-relaxed" style={{ color: PALETTE.faint }}>{timingCaption} Your future estimates include this.</p>
                    )}
                    <p className="mt-1.5 text-[12px]" style={{ color: PALETTE.muted }}>{absorptionCaption}</p>
                  </div>
                </>
              )}

              {!waitingForReadings && glucoseAnalysis.timeInRangePct != null && (
                <div className="grid grid-cols-2 gap-3 border-t pt-3" style={{ borderColor: PALETTE.hairline }}>
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>Time in range</span>
                    <span className="text-[16px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{glucoseAnalysis.timeInRangePct}%</span>
                  </div>
                  <div>
                    <span className="block text-[9px] uppercase tracking-wider leading-tight" style={{ color: PALETTE.faint }}>
                      {glucoseAnalysis.backInRangeMin != null ? "Back to range" : "Still elevated"}
                    </span>
                    <span className="text-[16px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                      {glucoseAnalysis.backInRangeMin != null
                        ? formatDuration(glucoseAnalysis.backInRangeMin)
                        : glucoseAnalysis.elevatedDurationMin > 0
                          ? formatDuration(glucoseAnalysis.elevatedDurationMin)
                          : "-"}
                    </span>
                  </div>
                </div>
              )}

              {rescueGrams > 0 && (
                <p className="text-[11px] leading-relaxed" style={{ color: PALETTE.faint }}>{rescueGrams}g rescue carbs logged (not part of the math).</p>
              )}
            </div>
          </MealCollapsibleRow>
        </div>

        {/* 6. Items — swipe to edit or remove (carb entries + rescue carbs) */}
        <div className="mt-4">
          <div className="section-label">Items</div>
          <div className="mt-2 space-y-2">
            {carbEntries.map((entry) => {
              const name = entry.food_name || entry.name || "Food";
              const detail = entry.absorption_profile
                ? entry.absorption_profile.charAt(0).toUpperCase() + entry.absorption_profile.slice(1)
                : "";
              return (
                <SwipeableRow
                  key={entry.id || name}
                  rowId={entry.id}
                  isOpen={openEntryId === entry.id}
                  onOpenChange={(o) => setOpenEntryId(o ? entry.id : null)}
                  onEdit={() => setEditEntries(carbEntries)}
                  onDelete={() => handleDeleteEntry(entry)}
                  editLabel="Edit"
                  deleteLabel="Remove"
                  itemLabel={name}>
                  <div className="flex w-full items-baseline gap-2 text-left">
                    <span className="min-w-0 flex-1 break-words">
                      <span className="text-[13px] font-medium" style={{ color: PALETTE.ink }}>{name}</span>
                      {detail && <span className="text-[11px]" style={{ color: PALETTE.faint }}>, {detail}</span>}
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>{Math.round(entry.carbs)} g</span>
                  </div>
                </SwipeableRow>
              );
            })}
            {rescueEntries.map((entry) => {
              const name = entry.food_name || entry.name || "Rescue carbs";
              return (
                <SwipeableRow
                  key={entry.id || `rescue-${name}`}
                  rowId={entry.id}
                  isOpen={openEntryId === entry.id}
                  onOpenChange={(o) => setOpenEntryId(o ? entry.id : null)}
                  onEdit={() => setEditEntries(rescueEntries)}
                  onDelete={() => handleDeleteEntry(entry)}
                  editLabel="Edit"
                  deleteLabel="Remove"
                  itemLabel={name}>
                  <div className="flex w-full items-baseline gap-2 text-left">
                    <span className="flex min-w-0 flex-1 items-baseline gap-1.5 break-words">
                      <span className="text-[13px] font-medium" style={{ color: PALETTE.ink }}>{name}</span>
                      <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider" style={{ background: "rgba(156,63,46,0.14)", color: PALETTE.red, border: "1px solid rgba(156,63,46,0.22)" }}>Rescue</span>
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.red }}>{Math.round(entry.carbs)} g</span>
                  </div>
                </SwipeableRow>
              );
            })}
          </div>
        </div>
      </DashboardCard>

      {editEntries && <MealEditOverlay entries={editEntries} onClose={() => setEditEntries(null)} />}
    </div>
  );
}