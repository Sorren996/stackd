import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Clock } from "lucide-react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import AbsorptionProgressCurve from "./AbsorptionProgressCurve";
import MealGlucoseTrace from "./MealGlucoseTrace";
import SwipeableRow from "@/components/SwipeableRow";
import { base44 } from "@/api/base44Client";
import { generateMealGlucoseResponse, analyzeGlucoseResponse } from "@/lib/mealGlucoseResponse";
import MealEditOverlay from "@/components/insulin/MealEditOverlay";
import EstimatedSupportCard from "./EstimatedSupportCard";
import { getCarbAbsorptionAt, getMealWindowMinutes, getMealPeakMinutes } from "@/lib/carbAbsorption";
import { useAbsorptionAdjustments, entrySpeedFactor, hasLearnedTiming, learnedTimingCaption, deriveSpeedClass } from "@/lib/absorptionLearning";
import { getMealSlotLabel } from "@/lib/mealSlot";
import { formatGlucose, formatGlucoseDelta, formatGlucoseAbsDelta, glucoseUnitLabel, glucoseDeltaUnit, getGlucoseUnits } from "@/lib/glucoseUnits";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  green: "#4d5742",
  amber: "#8a5a12",
  hairline: "#eadccf"
};

const TREND_ARROW = {
  "double_up": "⇈", up: "↑", "up-right": "↗", right: "→",
  "down-right": "↘", down: "↓", "double_down": "⇊"
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



export default function MealReviewAtAGlance({ mealInsight, monitoringStatus, glucoseTrend, onResolve, glucoseReadings }) {
  const [showEdit, setShowEdit] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [openEntryId, setOpenEntryId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const queryClient = useQueryClient();
  const now = Date.now();
  const adjustmentsByClass = useAbsorptionAdjustments(Boolean(mealInsight));

  // Hooks must run unconditionally on every render, so compute them up front
  // with safe fallbacks derived from whatever is available before the early
  // returns below.
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
        <p className="text-[14px] font-semibold" style={{ color: PALETTE.ink }}>
          Meal review is gathering
        </p>
        <p className="text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
          Once your most recent nourishment and support are in, the review opens here.
        </p>
      </DashboardCard>);

  }

  if (!d || d.noActiveMeal) {
    return (
      <DashboardCard className="p-4">
        <p className="text-[13px]" style={{ color: PALETTE.muted }}>No meal to review yet. Log nourishment to open a window.</p>
      </DashboardCard>);

  }

  if (!d.meal) {
    return (
      <DashboardCard className="p-4 space-y-1">
        <p className="text-[14px] font-semibold" style={{ color: PALETTE.ink }}>{mealInsight.value}</p>
        <p className="text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
          Add your insulin-to-carb ratio and sensitivity in Settings to see meal balance.
        </p>
      </DashboardCard>);

  }

  const mealFatGrams = carbEntries.reduce((s, e) => s + Number(e.fat_grams || 0), 0);
  const mealProteinGrams = carbEntries.reduce((s, e) => s + Number(e.protein_grams || 0), 0);
  const dynamicWindowMin = getMealWindowMinutes(mealFatGrams, mealProteinGrams);
  const dynamicWindowMs = dynamicWindowMin * 60 * 1000;
  const reviewWindowEnd = d.reviewWindowEnd || mealTime + dynamicWindowMs;
  const windowRemaining = reviewWindowEnd - now;
  const minutesSinceMeal = (now - mealTime) / 60000;

  // Resolve the user's learned absorption-timing factor for this meal's class.
  // It only reshapes WHEN the (estimated) carbs arrive — never the total.
  const primarySpeedFactor = (() => {
    const withClass = carbEntries[0] ? { ...carbEntries[0], speed_class: carbEntries[0].speed_class || deriveSpeedClass(carbEntries[0]) } : null;
    return withClass ? entrySpeedFactor(adjustmentsByClass, withClass) : null;
  })();
  const learnedTiming = Boolean(carbEntries.length) && hasLearnedTiming(adjustmentsByClass, { speed_class: deriveSpeedClass(carbEntries[0]) });
  const timingCaption = carbEntries.length ? learnedTimingCaption(adjustmentsByClass, carbEntries[0]) : null;
  const absorptionOpts = primarySpeedFactor != null ? { speedFactor: primarySpeedFactor } : {};

  // Absorption — only meaningful once the meal has had time to begin digesting.
  let totalAbsorbed = 0;
  let totalRemaining = 0;
  let rateGPerMin = 0;
  carbEntries.forEach((entry) => {
    if (!entry || !Number.isFinite(entry.carbs)) return;
    const forCalc = !entry.absorption_profile || entry.is_custom ?
    { ...entry, absorption_profile: entry.absorption_profile || "medium", is_custom: false, dual_wave: entry.dual_wave } :
    entry;
    const r = getCarbAbsorptionAt(forCalc, now, absorptionOpts);
    totalAbsorbed += r.absorbedGrams || 0;
    totalRemaining += r.remainingGrams || 0;
    rateGPerMin += r.absorptionRateGPerMin || 0;
  });
  const totalCarbs = totalAbsorbed + totalRemaining;
  const absorptionPct = totalCarbs > 0 ? Math.min(100, totalAbsorbed / totalCarbs * 100) : 0;
  const gPerHour = rateGPerMin * 60;
  const tooEarlyToRead = minutesSinceMeal < 15;

  // Bolus support for this meal (basal excluded upstream).
  const bolusSupport = Number.isFinite(d.loggedTotalUnits) ? d.loggedTotalUnits : null;

  // Glucose response
  const glucoseNow = Number.isFinite(d.latestGlucoseValue) ? d.latestGlucoseValue : d.windowEndGlucoseValue;
  const glucoseAtStart = d.glucoseValue;
  const peakOutcome = d.peakOutcome;
  const trendArrow = glucoseTrend?.icon ? TREND_ARROW[glucoseTrend.icon] : null;

  const absorptionPeakMin = (() => {
    let p = getMealPeakMinutes(mealFatGrams, mealProteinGrams, dynamicWindowMin);
    if (primarySpeedFactor != null && Number.isFinite(primarySpeedFactor) && primarySpeedFactor > 0) {
      p = Math.max(20, Math.min(240, Math.round(p * primarySpeedFactor)));
    }
    return p;
  })();
  const absorptionPeakTime = mealTime + absorptionPeakMin * 60000;
  // Dual-wave meals have two estimated peaks (a quick first wave + a delayed
  // second wave); the caption stays estimate-framed and never prescribes.
  const isDualWaveMeal = (carbEntries[0]?.dual_wave || deriveSpeedClass(carbEntries[0]) === "high_fat");
  const firstWavePassed = absorptionPeakTime <= now;
  const peakMinAgo = firstWavePassed ? Math.round((now - absorptionPeakTime) / 60000) : null;
  const absorptionCaption = firstWavePassed ?
  (absorptionPct >= 90 ? "Absorption nearly complete" : (isDualWaveMeal ? `First wave peaked ${peakMinAgo}m ago — a second wave may follow` : `Absorption peaked ${peakMinAgo}m ago`)) :
  (absorptionPct < 5 ? "Just starting to absorb" : (isDualWaveMeal ? "Rising through the first wave" : "Rising toward peak"));

  // Glucose response descriptive line
  let glucoseLine = "Steady so far.";
  if (Number.isFinite(glucoseNow) && Number.isFinite(glucoseAtStart)) {
    const delta = Math.round(glucoseNow - glucoseAtStart);
    if (glucoseAnalysis.secondRise) {
      glucoseLine = "A second gentle climb appeared. The lingering energy from this meal is still working through.";
    } else if (Number.isFinite(peakOutcome) && peakOutcome > glucoseAtStart + 15) {
      const riseRaw = peakOutcome - glucoseAtStart;
      // Only say "settled back" when glucose has actually dropped meaningfully
      // below the peak. Otherwise describe the rise neutrally.
      const droppedBelowPeak = Number.isFinite(glucoseNow) && glucoseNow < peakOutcome - 15;
      glucoseLine = droppedBelowPeak ?
      `Rose ${formatGlucoseAbsDelta(riseRaw)} ${glucoseDeltaUnit()}, then settled back.` :
      `Rose ${formatGlucoseAbsDelta(riseRaw)} ${glucoseDeltaUnit()} so far, still near the peak.`;
    } else if (delta > 15) {
      glucoseLine = `Climbing gently, up ${formatGlucoseAbsDelta(delta)} ${glucoseDeltaUnit()} so far.`;
    } else if (delta < -15) {
      glucoseLine = `A steady descent, down ${formatGlucoseAbsDelta(delta)} ${glucoseDeltaUnit()}.`;
    } else if (Math.abs(delta) <= 15) {
      if (mealResponse.hasDelayedRise) {
        glucoseLine = "Steady so far. Watching for a possible delayed wave.";
      } else {
        glucoseLine = "Steady so far.";
      }
    }
  }

  // Outcome labels — when the post-meal max never exceeded the pre-meal value,
  // label as End / Change instead of Peak / Rise so the stats never contradict.
  const rawRose = Number.isFinite(peakOutcome) && Number.isFinite(glucoseAtStart) ?
  peakOutcome - glucoseAtStart :
  null;
  const didRise = rawRose != null && rawRose > 0;
  const outcomeValue = Number.isFinite(peakOutcome) ? formatGlucose(peakOutcome) :
  Number.isFinite(glucoseNow) ? formatGlucose(glucoseNow) :
  null;
  const changeValue = rawRose != null ? formatGlucoseDelta(rawRose) : (Number.isFinite(glucoseNow) && Number.isFinite(glucoseAtStart) ? formatGlucoseDelta(glucoseNow - glucoseAtStart) : "");

  // Insufficient post-meal readings — don't fabricate a "steady" conclusion
  // or dash-only metrics. Show one honest waiting state until readings arrive.
  const hasPostMealReading = (glucoseReadings || []).some((r) => new Date(r.recorded_at).getTime() > mealTime);
  const waitingForReadings = !hasPostMealReading && windowRemaining > 0;

  const mealName = d.meal?.food_name || d.meal?.name || "Meal";
  const combinedFoodName = carbEntries.map((e) => e?.food_name || e?.name || "").filter(Boolean).join(", ") || mealName;
  const slotLabel = getMealSlotLabel({
    time: mealTime,
    carbs: totalCarbs,
    fatGrams: mealFatGrams,
    proteinGrams: mealProteinGrams,
    foodName: combinedFoodName
  });

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
      {/* The meal card — identity, inputs, outcome, insight, actions */}
      <DashboardCard className="p-4">
        {/* 1. IDENTITY */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0 flex items-baseline gap-2">
            <span className="text-[15px] font-semibold truncate" style={{ color: PALETTE.ink }}>{mealName}</span>
            <span className="shrink-0 text-[8px] font-semibold uppercase tracking-wider" style={{ color: PALETTE.faint }}>
              {slotLabel}
            </span>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: PALETTE.faint }}>{formatClock(mealTime)}</span>
        </div>

        {/* 2. INPUTS — label-first stat tiles (small muted label above bold value) */}
        <div className="mt-3 flex items-end gap-5">
          <div>
            <span className="block text-[9px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>Carbs</span>
            <span className="text-[22px] font-semibold tabular-nums leading-tight" style={{ color: PALETTE.ink }}>{Math.round(totalCarbs)}g</span>
          </div>
          {bolusSupport != null && bolusSupport > 0 &&
          <div>
              <span className="block text-[9px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>Support</span>
              <span className="text-[22px] font-semibold tabular-nums leading-tight" style={{ color: PALETTE.ink }}>{bolusSupport % 1 === 0 ? bolusSupport : bolusSupport.toFixed(1)}u</span>
            </div>
          }
          <div className="ml-auto text-right">
            <span className="block text-[9px] uppercase tracking-wider leading-tight" style={{ color: PALETTE.faint }}>Remaining in window</span>
            <span className="text-[22px] font-semibold tabular-nums leading-tight" style={{ color: PALETTE.ink }}>{formatCountdownValue(windowRemaining)}</span>
          </div>
        </div>

        {/* 3. OUTCOME — the hero */}
        <div className="mt-4">
          <div className="section-label">Glucose Response</div>

          {waitingForReadings ? (
            <>
              <p className="mt-2 text-[13px] font-semibold" style={{ color: PALETTE.ink }}>
                Waiting for post-meal readings
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
                Your glucose response isn't available yet. We'll keep watching for the next {formatCountdownValue(windowRemaining)}.
              </p>
            </>
          ) : (
            <div className="mt-2 flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>Before</span>
                <span className="text-[18px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                  {Number.isFinite(glucoseAtStart) ? formatGlucose(glucoseAtStart) : "-"}
                </span>
              </div>
              {outcomeValue != null &&
              <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>{didRise ? "Peak" : "End"}</span>
                  <span className="text-[18px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{outcomeValue}</span>
                </div>
              }
              {changeValue !== "" &&
              <div className="flex items-baseline gap-1.5">
                  <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>{didRise ? "Rise" : "Change"}</span>
                  <span className="text-[15px] font-semibold tabular-nums" style={{ color: didRise ? PALETTE.amber : PALETTE.green }}>{changeValue}</span>
                </div>
              }
            </div>
          )}

          <MealGlucoseTrace
            glucoseReadings={glucoseReadings}
            mealTime={mealTime}
            reviewWindowEnd={reviewWindowEnd}
            now={now}
            targetLow={targetLow}
            targetHigh={targetHigh} />

          {!waitingForReadings &&
          <>
            <p className="mt-2 text-[12px] leading-relaxed" style={{ color: PALETTE.ink }}>
              {glucoseLine}
            </p>

            {/* High protein/fat monitoring notice */}
            {monitoringStatus?.isActive && (
              <div className="mt-3 flex items-start gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: PALETTE.amber }} />
                <p className="text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>
                  This meal is high in fat and protein, so glucose may rise more slowly at first, then climb later (3 to 8 hours after eating). Monitoring through{" "}
                  <span className="font-semibold" style={{ color: PALETTE.amber }}>
                    {new Date(monitoringStatus.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </span>
                  .
                </p>
              </div>
            )}

            {/* Outcome assessment — descriptive, never prescriptive */}
            {d.outcomeAssessment &&
            <div className="mt-2 rounded-[12px] px-3 py-2" style={{ background: "#f7f1e8" }}>
                <p className="text-[12px] font-semibold leading-snug" style={{ color: d.outcomeAssessment.color }}>
                  {d.outcomeAssessment.label}
                </p>
                <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
                  {d.outcomeAssessment.message}
                </p>
              </div>
            }

            {/* Response & context drill-down — detailed metrics on demand */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowContext((s) => !s)}
                className="flex w-full items-center justify-between"
              >
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: PALETTE.faint }}>
                  Response & context
                </span>
                <ChevronDown
                  size={14}
                  style={{ color: PALETTE.faint, transform: showContext ? "rotate(180deg)" : "none", transition: "transform 200ms" }}
                />
              </button>
              {showContext &&
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[9px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>Time to peak</span>
                  <span className="text-[16px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                    {glucoseAnalysis.timeToPeakMin != null ? formatDuration(glucoseAnalysis.timeToPeakMin) : "-"}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>Rise from pre-meal</span>
                  <span className="text-[16px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                    {glucoseAnalysis.deltaFromBaseline != null ? `${formatGlucoseDelta(glucoseAnalysis.deltaFromBaseline)} ${glucoseUnitLabel()}` : "-"}
                  </span>
                </div>
                <div>
                  <span className="block text-[9px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>Time in range</span>
                  <span className="text-[16px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                    {glucoseAnalysis.timeInRangePct != null ? `${glucoseAnalysis.timeInRangePct}%` : "-"}
                  </span>
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
              }
            </div>
          </>
          }
        </div>

        {/* 4. INSIGHT — absorption (only once meaningful) + active support */}
        <div className="mt-4">
          <div className="section-label">Absorption</div>
          {tooEarlyToRead ?
          <p className="mt-2 text-[13px]" style={{ color: PALETTE.muted }}>Too early to read</p> :

          <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[22px] font-light tabular-nums" style={{ color: PALETTE.ink }}>{Math.round(absorptionPct)}</span>
                <span className="text-[13px] font-light" style={{ color: PALETTE.muted }}>% processed, {gPerHour.toFixed(1)} g/hour</span>
              </div>
              <p className="text-[11px]" style={{ color: PALETTE.faint }}>
                {Math.round(totalAbsorbed)} of {Math.round(totalCarbs)} g absorbed
              </p>
              <div className="mt-2">
                <AbsorptionProgressCurve entries={carbEntries} mealTime={mealTime} now={now} peakTime={absorptionPeakTime} opts={absorptionOpts} />
              </div>

              {/* Reconciliation — two of three legs: estimated absorption vs the
                  actual Dexcom glucose trace. Describes what happened; never
                  prescribes. Always framed as an estimate from meal + history. */}
              {!waitingForReadings && glucoseAnalysis.timeToPeakMin != null && (
                <p className="mt-1.5 text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>
                  Estimated from your meal and history: the absorption curve{" "}
                  {isDualWaveMeal ? "rose in two waves — the glucose trace followed" : "peaked"}{" "}
                  <span className="font-serif-italic" style={{ color: PALETTE.ink }}>
                    {Math.abs(glucoseAnalysis.timeToPeakMin - absorptionPeakMin) <= 40
                      ? "closely"
                      : glucoseAnalysis.timeToPeakMin < absorptionPeakMin
                        ? "ahead"
                        : "behind"}
                  </span>{" "}
                  the <span className="font-serif-italic" style={{ color: PALETTE.ink }}>estimation</span>, with glucose peaking{" "}
                  <span className="font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{formatDuration(glucoseAnalysis.timeToPeakMin)}</span>{" "}
                  after you ate.
                </p>
              )}

              {/* Learned per-class timing — only when the user's own history
                  supports it. Estimate-framed, never a recommendation. */}
              {learnedTiming && timingCaption && (
                <p className="mt-1 text-[11px] leading-relaxed" style={{ color: PALETTE.faint }}>
                  {timingCaption} Your future estimates include this.
                </p>
              )}
              <p className="mt-1.5 text-[12px]" style={{ color: PALETTE.muted }}>
                {absorptionCaption}
              </p>
            </>
          }
        </div>

        <div className="mt-4">
          <EstimatedSupportCard details={d} />
        </div>

        {/* 5. ACTIONS — swipe to edit or remove */}
        <div className="mt-4">
          <div className="section-label">Items</div>
          <div className="mt-2 space-y-2">
            {carbEntries.map((entry) => {
              const name = entry.food_name || entry.name || "Food";
              const detail = entry.absorption_profile ?
              entry.absorption_profile.charAt(0).toUpperCase() + entry.absorption_profile.slice(1) :
              "";
              return (
                <SwipeableRow
                  key={entry.id || name}
                  rowId={entry.id}
                  isOpen={openEntryId === entry.id}
                  onOpenChange={(o) => setOpenEntryId(o ? entry.id : null)}
                  onEdit={() => setShowEdit(true)}
                  onDelete={() => handleDeleteEntry(entry)}
                  editLabel="Edit"
                  deleteLabel="Remove"
                  itemLabel={name}>
                  
                  <div className="flex w-full items-baseline gap-2 text-left">
                    <span className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium" style={{ color: PALETTE.ink }}>{name}</span>
                      {detail && <span className="text-[11px]" style={{ color: PALETTE.faint }}>, {detail}</span>}
                    </span>
                    <span className="overflow-hidden">
                      <span className="dotted-leader block" />
                    </span>
                    <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
                      {Math.round(entry.carbs)} g
                    </span>
                  </div>
                </SwipeableRow>);

            })}
          </div>

          








          
        </div>
      </DashboardCard>

      {showEdit &&
      <MealEditOverlay entries={carbEntries} onClose={() => setShowEdit(false)} />
      }
    </div>);

}