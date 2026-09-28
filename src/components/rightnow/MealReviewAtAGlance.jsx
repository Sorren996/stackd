import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import DashboardCard from "@/components/dashboard/DashboardCard";
import AbsorptionProgressCurve from "./AbsorptionProgressCurve";
import MealGlucoseTrace from "./MealGlucoseTrace";
import SwipeableRow from "@/components/SwipeableRow";
import { base44 } from "@/api/base44Client";
import { generateMealGlucoseResponse, analyzeGlucoseResponse } from "@/lib/mealGlucoseResponse";
import MealEditOverlay from "@/components/insulin/MealEditOverlay";
import EstimatedSupportCard from "./EstimatedSupportCard";
import { getCarbAbsorptionAt, getMealWindowMinutes, getMealPeakMinutes } from "@/lib/carbAbsorption";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  green: "#4d5742",
  amber: "#8a5a12",
  hairline: "#eadccf",
};

const TREND_ARROW = {
  "double_up": "⇈", up: "↑", "up-right": "↗", right: "→",
  "down-right": "↘", down: "↓", "double_down": "⇊",
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

function formatCountdown(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return "Window closed";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m remaining in window`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${r}m remaining in window`;
}

function mealChipFor(time) {
  const hour = new Date(time).getHours();
  if (hour < 10) return "Breakfast";
  if (hour < 14) return "Lunch";
  if (hour < 17) return "Snack";
  if (hour < 21) return "Dinner";
  return "Evening";
}

export default function MealReviewAtAGlance({ mealInsight, monitoringStatus, glucoseTrend, onResolve, glucoseReadings }) {
  const [showEdit, setShowEdit] = useState(false);
  const [openEntryId, setOpenEntryId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const queryClient = useQueryClient();
  const now = Date.now();

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
    () => analyzeGlucoseResponse(glucoseReadings, mealTime, targetLow, targetHigh, now),
    [glucoseReadings, mealTime, targetLow, targetHigh, now]
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

  const mealFatGrams = carbEntries.reduce((s, e) => s + Number(e.fat_grams || 0), 0);
  const mealProteinGrams = carbEntries.reduce((s, e) => s + Number(e.protein_grams || 0), 0);
  const dynamicWindowMin = getMealWindowMinutes(mealFatGrams, mealProteinGrams);
  const dynamicWindowMs = dynamicWindowMin * 60 * 1000;
  const reviewWindowEnd = d.reviewWindowEnd || (mealTime + dynamicWindowMs);
  const windowRemaining = reviewWindowEnd - now;
  const minutesSinceMeal = (now - mealTime) / 60000;

  // Absorption — only meaningful once the meal has had time to begin digesting.
  let totalAbsorbed = 0;
  let totalRemaining = 0;
  let rateGPerMin = 0;
  carbEntries.forEach((entry) => {
    if (!entry || !Number.isFinite(entry.carbs)) return;
    const forCalc = (!entry.absorption_profile || entry.is_custom)
      ? { ...entry, absorption_profile: entry.absorption_profile || "medium", is_custom: false }
      : entry;
    const r = getCarbAbsorptionAt(forCalc, now);
    totalAbsorbed += r.absorbedGrams || 0;
    totalRemaining += r.remainingGrams || 0;
    rateGPerMin += r.absorptionRateGPerMin || 0;
  });
  const totalCarbs = totalAbsorbed + totalRemaining;
  const absorptionPct = totalCarbs > 0 ? Math.min(100, (totalAbsorbed / totalCarbs) * 100) : 0;
  const gPerHour = rateGPerMin * 60;
  const tooEarlyToRead = minutesSinceMeal < 15;

  // Bolus support for this meal (basal excluded upstream).
  const bolusSupport = Number.isFinite(d.loggedTotalUnits) ? d.loggedTotalUnits : null;

  // Glucose response
  const glucoseNow = Number.isFinite(d.latestGlucoseValue) ? d.latestGlucoseValue : d.windowEndGlucoseValue;
  const glucoseAtStart = d.glucoseValue;
  const peakOutcome = d.peakOutcome;
  const trendArrow = glucoseTrend?.icon ? TREND_ARROW[glucoseTrend.icon] : null;

  const absorptionPeakTime = mealTime + getMealPeakMinutes(mealFatGrams, mealProteinGrams, dynamicWindowMin) * 60000;
  const peakPassed = absorptionPeakTime <= now;
  const peakMinAgo = peakPassed ? Math.round((now - absorptionPeakTime) / 60000) : null;
  const absorptionCaption = peakPassed
    ? (absorptionPct >= 85 ? "Nearly complete" : `Absorption peaked ${peakMinAgo}m ago`)
    : (absorptionPct < 5 ? "Just starting to absorb" : "Rising toward peak");

  // Glucose response descriptive line
  let glucoseLine = "Steady so far.";
  if (Number.isFinite(glucoseNow) && Number.isFinite(glucoseAtStart)) {
    const delta = Math.round(glucoseNow - glucoseAtStart);
    if (glucoseAnalysis.secondRise) {
      glucoseLine = "A second gentle climb appeared. The lingering energy from this meal is still working through.";
    } else if (Number.isFinite(peakOutcome) && peakOutcome > glucoseAtStart + 15) {
      const rise = Math.round(peakOutcome - glucoseAtStart);
      glucoseLine = `Rose ${rise} points, then settled back.`;
    } else if (delta > 15) {
      glucoseLine = `Climbing gently, up ${delta} points so far.`;
    } else if (delta < -15) {
      glucoseLine = `A steady descent, down ${Math.abs(delta)} points.`;
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
  const rose = Number.isFinite(peakOutcome) && Number.isFinite(glucoseAtStart)
    ? Math.round(peakOutcome - glucoseAtStart)
    : null;
  const didRise = rose != null && rose > 0;
  const outcomeValue = Number.isFinite(peakOutcome) ? Math.round(peakOutcome)
    : Number.isFinite(glucoseNow) ? Math.round(glucoseNow)
    : null;
  const changeValue = (didRise ? "+" : "") + (rose != null ? rose : (Number.isFinite(glucoseNow) && Number.isFinite(glucoseAtStart) ? Math.round(glucoseNow - glucoseAtStart) : ""));

  const slowBanner = monitoringStatus?.isActive;
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
      {/* Gentle awareness banner for slow-digesting meals */}
      {slowBanner && (
        <DashboardCard className="px-4 py-3">
          <p className="text-[13px] font-semibold leading-snug" style={{ color: PALETTE.ink }}>
            This meal digests slowly
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
            Fat and protein stretch the window. Glucose may arrive in a gentle, lingering wave.
          </p>
        </DashboardCard>
      )}

      {/* The meal card — identity, inputs, outcome, insight, actions */}
      <DashboardCard className="p-4">
        {/* 1. IDENTITY */}
        <div className="flex items-baseline justify-between gap-2">
          <div className="min-w-0 flex items-baseline gap-2">
            <span className="text-[15px] font-semibold truncate" style={{ color: PALETTE.ink }}>{mealName}</span>
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ background: "rgba(175,117,27,0.10)", color: PALETTE.amber }}>
              {mealChipFor(mealTime)}
            </span>
          </div>
          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: PALETTE.faint }}>{formatClock(mealTime)}</span>
        </div>

        {/* 2. INPUTS */}
        <div className="mt-3 flex items-baseline gap-5">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-light tabular-nums" style={{ color: PALETTE.ink }}>{Math.round(totalCarbs)}</span>
            <span className="text-[12px]" style={{ color: PALETTE.muted }}>g carbs</span>
          </div>
          {bolusSupport != null && bolusSupport > 0 && (
            <div className="flex items-baseline gap-1.5">
              <span className="text-[22px] font-light tabular-nums" style={{ color: PALETTE.ink }}>{bolusSupport % 1 === 0 ? bolusSupport : bolusSupport.toFixed(1)}</span>
              <span className="text-[12px]" style={{ color: PALETTE.muted }}>u support</span>
            </div>
          )}
          <span className="ml-auto text-[11px]" style={{ color: PALETTE.faint }}>{formatCountdown(windowRemaining)}</span>
        </div>

        {/* 3. OUTCOME — the hero */}
        <div className="mt-4">
          <div className="section-label">Glucose Response</div>

          <div className="mt-2 flex items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>Before</span>
              <span className="text-[18px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                {Number.isFinite(glucoseAtStart) ? Math.round(glucoseAtStart) : "-"}
              </span>
            </div>
            {outcomeValue != null && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>{didRise ? "Peak" : "End"}</span>
                <span className="text-[18px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>{outcomeValue}</span>
              </div>
            )}
            {changeValue !== "" && (
              <div className="flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-wider" style={{ color: PALETTE.faint }}>{didRise ? "Rise" : "Change"}</span>
                <span className="text-[15px] font-semibold tabular-nums" style={{ color: didRise ? PALETTE.amber : PALETTE.green }}>{changeValue}</span>
              </div>
            )}
          </div>

          <MealGlucoseTrace
            glucoseReadings={glucoseReadings}
            mealTime={mealTime}
            reviewWindowEnd={reviewWindowEnd}
            now={now}
            targetLow={targetLow}
            targetHigh={targetHigh}
          />

          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: PALETTE.ink }}>
            {glucoseLine}
          </p>

          {/* Outcome assessment — descriptive, never prescriptive */}
          {d.outcomeAssessment && (
            <div className="mt-2 rounded-[12px] px-3 py-2" style={{ background: "#f7f1e8" }}>
              <p className="text-[12px] font-semibold leading-snug" style={{ color: d.outcomeAssessment.color }}>
                {d.outcomeAssessment.label}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
                {d.outcomeAssessment.message}
              </p>
            </div>
          )}

          {/* Enhanced metrics */}
          <div className="mt-3 space-y-1.5">
            {glucoseAnalysis.timeToPeakMin != null && (
              <div className="flex items-baseline justify-between">
                <span className="text-[11px]" style={{ color: PALETTE.faint }}>Time to peak</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
                  {glucoseAnalysis.timeToPeakMin} min
                </span>
              </div>
            )}
            {glucoseAnalysis.deltaFromBaseline != null && (
              <div className="flex items-baseline justify-between">
                <span className="text-[11px]" style={{ color: PALETTE.faint }}>Rise from pre-meal</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
                  {glucoseAnalysis.deltaFromBaseline > 0 ? "+" : ""}{glucoseAnalysis.deltaFromBaseline} mg/dL
                </span>
              </div>
            )}
            {glucoseAnalysis.timeInRangePct != null && (
              <div className="flex items-baseline justify-between">
                <span className="text-[11px]" style={{ color: PALETTE.faint }}>Time in range</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
                  {glucoseAnalysis.timeInRangePct}%
                </span>
              </div>
            )}
            {glucoseAnalysis.backInRangeMin != null ? (
              <div className="flex items-baseline justify-between">
                <span className="text-[11px]" style={{ color: PALETTE.faint }}>Back to range after</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
                  {formatDuration(glucoseAnalysis.backInRangeMin)}
                </span>
              </div>
            ) : glucoseAnalysis.elevatedDurationMin > 0 && (
              <div className="flex items-baseline justify-between">
                <span className="text-[11px]" style={{ color: PALETTE.faint }}>Still elevated</span>
                <span className="text-[12px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
                  {formatDuration(glucoseAnalysis.elevatedDurationMin)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4. INSIGHT — absorption (only once meaningful) + active support */}
        <div className="mt-4">
          <div className="section-label">Absorption</div>
          {tooEarlyToRead ? (
            <p className="mt-2 text-[13px]" style={{ color: PALETTE.muted }}>Too early to read</p>
          ) : (
            <>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-[22px] font-light tabular-nums" style={{ color: PALETTE.ink }}>{Math.round(absorptionPct)}</span>
                <span className="text-[13px] font-light" style={{ color: PALETTE.muted }}>% processed, {gPerHour.toFixed(1)} g/hour</span>
              </div>
              <p className="text-[11px]" style={{ color: PALETTE.faint }}>
                {Math.round(totalAbsorbed)} of {Math.round(totalCarbs)} g absorbed
              </p>
              <div className="mt-2">
                <AbsorptionProgressCurve entries={carbEntries} mealTime={mealTime} now={now} />
              </div>
              <p className="mt-1.5 text-[12px]" style={{ color: PALETTE.muted }}>
                {absorptionCaption}
              </p>
            </>
          )}
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
              const detail = entry.absorption_profile
                ? entry.absorption_profile.charAt(0).toUpperCase() + entry.absorption_profile.slice(1)
                : "";
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
                  itemLabel={name}
                >
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
                </SwipeableRow>
              );
            })}
          </div>

          {d.mealStillUnderReview && onResolve && (
            <button
              type="button"
              onClick={onResolve}
              className="mt-3 text-[12px] font-semibold transition hover:opacity-70"
              style={{ color: PALETTE.green }}
            >
              Mark as resolved
            </button>
          )}
        </div>
      </DashboardCard>

      {showEdit && (
        <MealEditOverlay entries={carbEntries} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}