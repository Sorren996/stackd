import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import MealReviewCard from "@/components/mealreview/MealReviewCard";
import MealReviewHero from "@/components/mealreview/MealReviewHero";
import TimelineCard from "@/components/mealreview/TimelineCard";
import DosePlanCard from "@/components/mealreview/DosePlanCard";
import { MR } from "@/components/mealreview/mealReviewTheme";
import { base44 } from "@/api/base44Client";
import { generateMealGlucoseResponse, analyzeGlucoseResponse } from "@/lib/mealGlucoseResponse";
import MealEditOverlay from "@/components/insulin/MealEditOverlay";
import { getCarbAbsorptionAt, getMealWindowMinutes, deriveDualWaveBlend, getAbsorptionModel } from "@/lib/carbAbsorption";
import { reconcileMealNarrative } from "@/lib/mealNarrativeReconciler";
import { useMealModelResolution, entrySpeedFactorFromResolution, hasLearnedTimingFromResolution, learnedTimingCaptionFromResolution, deriveSpeedClass } from "@/hooks/useMealModelResolution";
import { getDoseTimingInfo, isBasalInsulinType } from "@/lib/insulinPharmacology";
import { formatIOBValue, IOB_FLOOR } from "@/lib/iobModel";
import { formatGlucose, glucoseUnitLabel } from "@/lib/glucoseUnits";
import { formatReadingAge } from "@/lib/glucoseStaleness";

const TREND_PHRASE = {
  "Rising quickly": "rising quickly",
  "Rising": "rising",
  "Slowly rising": "easing up",
  "Stable": "steady",
  "Slowly falling": "easing down",
  "Falling": "falling",
  "Falling quickly": "falling quickly",
};

// Period-of-day word for the card heading, using the same clock boundaries as
// src/lib/mealSlot.js (morning 5-11, afternoon 11-17, evening 17-21). It names
// the hour the window started at, never the meal itself; late night falls back
// to the neutral heading.
function periodLabel(time) {
  if (!Number.isFinite(time)) return null;
  const hour = new Date(time).getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 11 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  return null;
}

// The headline counts the meals actually being reviewed and says whether that
// story is still running. It never calls one meal two, or a finished window
// unfolding.
const COUNT_WORDS = { 2: "Two", 3: "Three", 4: "Four" };

function headlineForCount(count, ongoing) {
  if (count > 1) {
    const word = COUNT_WORDS[count] || String(count);
    return ongoing
      ? { text: `${word} meals. One unfolding story.`, italic: "unfolding story" }
      : { text: `${word} meals, one story settled.`, italic: "settled" };
  }
  return ongoing
    ? { text: "One meal, still unfolding.", italic: "still unfolding" }
    : { text: "One meal, now settled.", italic: "now settled" };
}

// The warm version of the peak-timing comparison. The exact minutes stay in
// the "See how we guessed" disclosure, unchanged.
function comparisonFor(timing, fallback) {
  if (timing === "earlier") return "We guessed a later peak. This meal moved faster than we thought.";
  if (timing === "later") return "We guessed an earlier peak. This meal moved slower than we thought.";
  if (timing === "in_line") return fallback;
  return null;
}

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

export default function MealReviewAtAGlance({
  mealInsight,
  monitoringStatus,
  glucoseTrend,
  onResolve,
  glucoseReadings,
  hideIdentity = false,
  sharedMeals = null,
  sharedWindow = null,
  onSelectMeal = null,
}) {
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
      <MealReviewCard className="my-4">
        <div className="space-y-1 px-6 py-5">
          <p style={{ fontSize: 14, fontWeight: 600, color: MR.ink }}>Meal review is gathering</p>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: MR.sec }}>
            Once your most recent nourishment and support are in, the review opens here.
          </p>
        </div>
      </MealReviewCard>
    );
  }

  if (!d || d.noActiveMeal) {
    return (
      <MealReviewCard className="my-4">
        <p className="px-6 py-5" style={{ fontSize: 13, color: MR.sec }}>
          No meal to review yet. Log nourishment to open a window.
        </p>
      </MealReviewCard>
    );
  }

  if (!d.meal) {
    return (
      <MealReviewCard className="my-4">
        <div className="space-y-1 px-6 py-5">
          <p style={{ fontSize: 14, fontWeight: 600, color: MR.ink }}>{mealInsight.value}</p>
          <p style={{ fontSize: 12, lineHeight: 1.6, color: MR.sec }}>
            Add your insulin-to-carb ratio and sensitivity in Settings to see meal balance.
          </p>
        </div>
      </MealReviewCard>
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

  // For dual-wave (high-fat/protein) meals, the glucose peak arrives at the
  // SECOND wave, not the first. Using the first-wave peak as the "estimated
  // peak" makes the reconciliation miss huge (e.g. est 40m vs actual 222m).
  // The second-wave peak is much closer, so the estimation miss shrinks for
  // such meals. The first-wave peak is still used for the "first wave passed"
  // caption check.
  const absorptionModelResult = (() => {
    const entry = carbEntries[0];
    if (!entry) return { peakMin: 60, secondPeakMin: null };
    const forCalc = !entry.absorption_profile || entry.is_custom
      ? { ...entry, absorption_profile: entry.absorption_profile || "medium", is_custom: false, dual_wave: entry.dual_wave }
      : entry;
    return getAbsorptionModel(forCalc, absorptionOpts);
  })();
  const firstWavePeakMin = absorptionModelResult.peakMin;
  const estimatedPeakMin = absorptionModelResult.secondPeakMin || absorptionModelResult.peakMin;
  const absorptionPeakTime = mealTime + firstWavePeakMin * 60000;
  const isDualWaveMeal = (carbEntries[0]?.dual_wave || deriveSpeedClass(carbEntries[0]) === "high_fat");
  const firstWavePassed = absorptionPeakTime <= now;
  const peakMinAgo = firstWavePassed ? Math.round((now - absorptionPeakTime) / 60000) : null;
  // ---- Glucose reference values needed by the reconciler ----
  const glucoseAtStart = d.glucoseValue;
  const peakOutcome = d.peakOutcome;
  const hasPostMealReading = (glucoseReadings || []).some((r) => new Date(r.recorded_at).getTime() > mealTime);
  const waitingForReadings = !hasPostMealReading && windowRemaining > 0;

  // ---- Per-meal delayed-rise check (no global flag leak) ----
  // Check the CURRENT meal's carbEntries, not the global monitoringStatus.
  const mealHasDelayedRise = carbEntries.length > 0 && carbEntries.some((e) => deriveDualWaveBlend(e) >= 0.5);

  // ---- Insulin taken (needed by verdict.hasInsulinDose) ----
  const taken = Number.isFinite(d.loggedTotalUnits) ? d.loggedTotalUnits : 0;
  const hasInsulinDose = taken > 0;
  const settingsConfirmed = localStorage.getItem("settings_confirmed") === "true";

  // ---- Meal narrative reconciler (single source of truth) ----
  // Every meal-card summary string derives from ONE verdict object, never
  // from the latest reading alone. The reconciler takes the full window
  // (start, peak, max rise, curve shape, doses, elapsed) and returns a
  // verdict. This eliminates contradictions like "Steady through the
  // window" next to a +49 mg/dL rise, or "Absorption nearly complete" next
  // to "100% processed / 75 of 75 g absorbed".
  //
  // ORDERING INVARIANT: verdict (and its absorptionStatus) MUST be computed
  // before absorptionCaption, because the caption string reads verdict
  // fields in the past-peak branches. If the caption is hoisted above the
  // verdict call, the past-peak path throws a TDZ ReferenceError and the
  // CardErrorBoundary renders its fallback. Do not reorder.
  const maxRise = Number.isFinite(glucoseAnalysis.deltaFromBaseline)
    ? glucoseAnalysis.deltaFromBaseline
    : (Number.isFinite(peakOutcome) && Number.isFinite(glucoseAtStart)
      ? peakOutcome - glucoseAtStart
      : 0);

  const verdict = reconcileMealNarrative({
    waitingForReadings,
    secondRise: glucoseAnalysis.secondRise,
    mealHasDelayedRise,
    phase: glucoseAnalysis.phase,
    validPeak: glucoseAnalysis.validPeak,
    startGlucose: glucoseAtStart,
    peakGlucose: peakOutcome,
    peakTime: d.peakOutcomeTime,
    mealTime,
    maxRise,
    isDualWave: isDualWaveMeal,
    targetHigh,
    hasInsulinDose,
    settingsConfirmed,
    absorbedGrams: totalAbsorbed,
    totalCarbs,
    absorptionPct,
    estimatedPeakMin,
    glucoseAnalysis,
  });

  const insightLine = verdict.glucoseVerdict;
  const reconciliation = verdict.reconciliation;

  // Absorption caption from the reconciler's status tier. The reconciler
  // handles the terminal case (>= 99% AND absorbed == total → "complete")
  // and keeps "nearly complete" ONLY for 90-98%. The first-wave caption
  // (peaked X min ago) is appended when the first wave has passed but
  // absorption isn't terminal yet. verdict is declared above this IIFE so
  // the past-peak branches resolve without a TDZ ReferenceError.
  const absorptionCaption = (() => {
    if (firstWavePassed && absorptionPct < 99) {
      if (isDualWaveMeal && glucoseAnalysis.secondRise) {
        return `${verdict.absorptionStatus}. First wave peaked ${peakMinAgo}m ago, a second wave appeared.`;
      }
      if (isDualWaveMeal) {
        return `${verdict.absorptionStatus}. First wave peaked ${peakMinAgo}m ago, watching for a second.`;
      }
      return `${verdict.absorptionStatus}. Absorption peaked ${peakMinAgo}m ago.`;
    }
    if (!firstWavePassed && absorptionPct < 5) {
      return "Just starting to absorb";
    }
    if (!firstWavePassed) {
      return isDualWaveMeal ? "Rising through the first wave" : "Rising toward peak";
    }
    return verdict.absorptionStatus;
  })();

  // ---- Glucose now + trend (display values) ----
  const glucoseNow = Number.isFinite(d.latestGlucoseValue) ? d.latestGlucoseValue
    : (Number.isFinite(d.windowEndGlucoseValue) ? d.windowEndGlucoseValue : d.glucoseValue);
  const trendPhrase = glucoseTrend?.label ? (TREND_PHRASE[glucoseTrend.label] || glucoseTrend.label.toLowerCase()) : null;

  // ---- Insulin / math (display values) ----
  const activeNow = Number.isFinite(d.activeIOB) ? d.activeIOB : (Number.isFinite(d.bolusIOB) ? d.bolusIOB : 0);
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

  const correctionAvailable = Number.isFinite(d.correctionGlucoseValue);
  const startingGlucose = correctionAvailable ? formatGlucose(d.correctionGlucoseValue) : null;
  const correctionInRange = correctionAvailable && startingGlucose >= targetLow && startingGlucose <= targetHigh;
  let correctionLabel;
  let correctionValue;
  if (!correctionAvailable) {
    correctionLabel = "Correction, no reading";
    correctionValue = "-";
  } else if (correctionUnits > 0.01) {
    correctionLabel = `Correction, start ${startingGlucose} / target ${targetLabel} ${unitLabel}`;
    correctionValue = `${correctionUnits.toFixed(1)}u`;
  } else {
    correctionLabel = `Correction, ${correctionInRange ? "in range" : "out of range"} at dose time`;
    correctionValue = "0u";
  }

  const activeDoses = (d.bolusIOBBreakdown || []).filter(
    (dose) => !isBasalInsulinType(dose.type) && dose.iob > IOB_FLOOR
  );

  const rescueGrams = Number.isFinite(d.rescueCarbs) && d.rescueCarbs > 0 ? Math.round(d.rescueCarbs) : 0;
  const rescueEntries = Array.isArray(d.rescueCarbEntries) ? d.rescueCarbEntries : [];

  const mealName = d.meal?.food_name || d.meal?.name || "Meal";

  // ---- Presentation values (display only, nothing recalculated) ----
  // The meal's own logged doses, drawn softly under the glucose curve.
  const mealDoses = Array.isArray(d.mealGroup?.doses) ? d.mealGroup.doses : [];

  // The window actually drawn: one meal's own review window, or the shared
  // span of every meal still being reviewed.
  const chartFrom = Number.isFinite(sharedWindow?.from) ? sharedWindow.from : mealTime;
  const chartTo = Number.isFinite(sharedWindow?.to) ? sharedWindow.to : reviewWindowEnd;

  const mealsUnderReview = Array.isArray(sharedMeals) && sharedMeals.length > 1 ? sharedMeals : null;
  const mealCount = mealsUnderReview?.length || 1;

  // "Still running" reads only existing fields: the represented review windows
  // and the resolved flag. Nothing new is classified.
  const ongoing = mealsUnderReview
    ? mealsUnderReview.some(
        (m) => m.underReview !== false && Number.isFinite(m.reviewWindowEnd) && m.reviewWindowEnd > now
      )
    : d.mealStillUnderReview !== false && windowRemaining > 0;

  const headline = headlineForCount(mealCount, ongoing);
  const period = periodLabel(chartFrom);

  const rangeWord = !Number.isFinite(glucoseNow)
    ? null
    : glucoseNow > targetHigh
      ? "above your range"
      : glucoseNow < targetLow
        ? "below your range"
        : "within your range";

  // One factual sentence. A single meal keeps the reconciler's own summary; a
  // shared timeline describes only what is true of the whole window (where the
  // reading sits against the configured range, and its current trend), so no
  // rise is ever attributed to one meal.
  const singleSentence =
    verdict.glucoseVerdictKey === "steady" || verdict.glucoseVerdictKey === "steady_multi"
      ? `Your sugar moved ${Math.round(maxRise)} points and stayed close to where it started.`
      : insightLine;
  const heroSentence = mealsUnderReview
    ? rangeWord
      ? `Glucose is ${rangeWord}${trendPhrase ? ` and ${trendPhrase} now` : " right now"}.`
      : insightLine
    : singleSentence;

  // The compact reading line under the sentence: the same current reading,
  // the same trend label, and the age of the reading it came from.
  const latestReadingTime = (Array.isArray(glucoseReadings) ? glucoseReadings : []).reduce((best, reading) => {
    const t = new Date(reading?.recorded_at).getTime();
    if (!Number.isFinite(t) || t > now) return best;
    return best == null || t > best ? t : best;
  }, null);

  const heroReading = Number.isFinite(glucoseNow)
    ? {
        value: formatGlucose(glucoseNow),
        unit: unitLabel,
        trend: trendPhrase,
        freshness: latestReadingTime != null ? formatReadingAge(latestReadingTime) : null,
      }
    : null;

  const showWindowStats = !waitingForReadings && glucoseAnalysis.timeInRangePct != null;
  const returnLabel = glucoseAnalysis.backInRangeMin != null ? "Back in range" : "Still elevated";
  const returnValue =
    glucoseAnalysis.backInRangeMin != null
      ? formatDuration(glucoseAnalysis.backInRangeMin)
      : glucoseAnalysis.elevatedDurationMin > 0
        ? formatDuration(glucoseAnalysis.elevatedDurationMin)
        : "-";
  const returnAside = glucoseAnalysis.backInRangeMin != null ? "after eating" : null;

  const comparison = comparisonFor(verdict.reconciliationTiming, reconciliation);

  const recovery = returnAside
    ? `${returnValue} back in range, ${returnAside}`
    : returnValue && returnValue !== "-"
      ? `${returnLabel.toLowerCase()} after ${returnValue}`
      : null;

  // A shared timeline's statistics are only printed when they describe the
  // window they sit under. With several meals on one chart the per-meal figures
  // stay with that meal's own details instead of being relabelled as shared.
  const scopedStats =
    mealsUnderReview && showWindowStats
      ? `${mealName}: ${glucoseAnalysis.timeInRangePct}% in range since you ate${recovery ? `, ${recovery}` : ""}.`
      : null;

  // On a shared timeline the chart's markers belong to the whole window, so
  // this meal's own observed summary and its start/peak values are stated
  // here, explicitly scoped to that meal.
  const numbersTail = [
    Number.isFinite(glucoseAtStart) ? `Started ${formatGlucose(glucoseAtStart)}` : null,
    Number.isFinite(glucoseAnalysis.timeToPeakMin) && Number.isFinite(peakOutcome)
      ? `peaked ${formatGlucose(peakOutcome)} after ${Math.round(glucoseAnalysis.timeToPeakMin)} min`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
  const verdictAlreadyQuotesNumbers =
    verdict.glucoseVerdictKey === "rose_high" || verdict.glucoseVerdictKey === "rose_high_multi";
  const scopedNumbers = mealsUnderReview
    ? `${mealName}: ${insightLine}${!verdictAlreadyQuotesNumbers && numbersTail ? ` ${numbersTail}.` : ""}`
    : null;

  // The remaining review window, kept from the meal selector but stated as the
  // estimate it is, inside the meal's own details.
  const windowLeft = windowRemaining > 0 ? formatRemaining(windowRemaining) : null;
  const windowLeftLabel = windowLeft
    ? mealsUnderReview
      ? `${mealName} review window closes in ${windowLeft}.`
      : `Review window closes in ${windowLeft}.`
    : null;

  const mealRows = mealsUnderReview
    ? mealsUnderReview.map((m, index) => ({
        key: m.key || `meal-${index}`,
        index,
        name: m.name,
        time: formatClock(m.mealTime),
        carbs: Math.round(m.carbs ?? 0),
        selected: Boolean(m.selected),
      }))
    : hideIdentity
      ? []
      : [
          {
            key: "meal",
            index: 0,
            name: mealName,
            time: formatClock(mealTime),
            carbs: Math.round(totalCarbs),
            selected: false,
          },
        ];

  const sharedNote = mealsUnderReview
    ? mealsUnderReview.length === 2
      ? "Both meals share this timeline."
      : `All ${mealsUnderReview.length} meals share this timeline.`
    : null;

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
    <div className="space-y-4 pb-6">
      <MealReviewHero
        eyebrow={period ? `Meal review · ${period}` : "Meal review"}
        headline={headline.text}
        headlineItalic={headline.italic}
        sentence={heroSentence}
        reading={heroReading}
      />

      <TimelineCard
        title={period ? `The ${period}, so far` : "The story so far"}
        titleAccent="so far"
        chartProps={{
          glucoseReadings,
          from: chartFrom,
          to: chartTo,
          now,
          targetLow,
          targetHigh,
          markers: mealsUnderReview
            ? mealsUnderReview.map((m) => ({ time: m.mealTime, name: m.name }))
            : [],
          startValue: mealsUnderReview ? (Number.isFinite(sharedWindow?.startValue) ? sharedWindow.startValue : null) : glucoseAtStart,
          peakValue: mealsUnderReview ? null : peakOutcome,
          timeToPeakMin: mealsUnderReview ? null : glucoseAnalysis.timeToPeakMin,
          allowHighest: Boolean(mealsUnderReview),
          peakMode: mealsUnderReview ? "highest" : "peak",
        }}
        statSentence={
          mealsUnderReview || !showWindowStats ? null : (
            <>
              <span className="tabular-nums" style={{ fontWeight: 600, color: MR.ink }}>
                {glucoseAnalysis.timeInRangePct}%
              </span>{" "}
              in range since you ate
              {recovery && (
                <>
                  <span style={{ color: MR.tan }}> · </span>
                  {recovery}
                </>
              )}
            </>
          )
        }
        meals={mealRows}
        onSelectMeal={mealsUnderReview ? onSelectMeal : null}
        sharedNote={sharedNote}
      />

      <DosePlanCard
        stillInPlay={{
          mealName,
          tooEarly: tooEarlyToRead,
          absorbed: Math.round(totalAbsorbed),
          total: Math.round(totalCarbs),
          progress: absorptionPct,
          comparison,
          aside: absorptionCaption,
          details: {
            pct: Math.round(absorptionPct),
            gPerHour: gPerHour.toFixed(1),
            reconciliation,
            learnedTiming,
            timingCaption,
            scopedStats,
            scopedNumbers,
            windowLeftLabel,
          },
          curve: {
            entries: carbEntries,
            mealTime,
            now,
            peakTime: absorptionPeakTime,
            opts: absorptionOpts,
          },
        }}
        insulin={{
          iob: activeNow.toFixed(1),
          children: (
            <div className="space-y-2.5">
              {activeDoses.length > 0 ? (
                activeDoses.map((dose) => {
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
                      <div className="min-w-0 flex-1">
                        <span style={{ fontSize: 13, fontWeight: 600, color: MR.ink }}>
                          {shortName}, {fmtUnits(dose.units)}u dose
                        </span>
                        <span className="block tabular-nums" style={{ fontSize: 11, color: MR.sec }}>
                          {formatIOBValue(dose.iob)}u left
                        </span>
                      </div>
                      {remaining && (
                        <span className="shrink-0 tabular-nums" style={{ fontSize: 10, color: MR.sec }}>
                          clears in {remaining}
                        </span>
                      )}
                    </div>
                  );
                })
              ) : (
                <p style={{ fontSize: 12, color: MR.sec }}>No bolus insulin active right now.</p>
              )}
              {Number.isFinite(d.priorActiveIOB) && d.priorActiveIOB > IOB_FLOOR && d.topPriorDose && (
                <p style={{ fontSize: 11, lineHeight: 1.5, color: MR.sec }}>
                  {d.priorActiveIOB.toFixed(1)}u still active from your {formatDoseClockTime(d.topPriorDose.time)} dose.
                </p>
              )}
            </div>
          ),
        }}
        dose={
          hasPlan
            ? {
                show: verdict.doseVerdict.show,
                neutralLabel: verdict.doseVerdict.neutralLabel,
                planned: suggested,
                taken,
                foodUnits,
                correctionValue,
                correctionLabel,
                correctionUnits,
                correctionAvailable,
                correctionInRange,
                carbs: Math.round(totalCarbs),
                ratioLabel,
                difference,
                absDiff,
                doses: mealDoses,
                from: mealTime,
                to: chartTo,
                now,
              }
            : null
        }
        footer={{
          entries: carbEntries,
          rescueEntries,
          openEntryId,
          onOpenChange: setOpenEntryId,
          onEditItems: setEditEntries,
          onDeleteEntry: handleDeleteEntry,
          planLine: hasPlan
            ? `I:C ${ratioLabel}, ISF 1:${isfLabel}, target ${targetLabel} ${unitLabel}`
            : null,
          rescueGrams,
        }}
      />

      {editEntries && <MealEditOverlay entries={editEntries} onClose={() => setEditEntries(null)} />}
    </div>
  );
}