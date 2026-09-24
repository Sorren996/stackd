import { useState, useMemo } from "react";
import { ChevronRight } from "lucide-react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import MealResponseCurve from "./MealResponseCurve";
import { generateMealGlucoseResponse, analyzeGlucoseResponse } from "@/lib/mealGlucoseResponse";
import MealEditOverlay from "@/components/insulin/MealEditOverlay";
import { getCarbAbsorptionAt } from "@/lib/carbAbsorption";

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
  if (!Number.isFinite(min) || min <= 0) return "—";
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

export default function MealReviewAtAGlance({ mealInsight, monitoringStatus, glucoseTrend, onResolve, glucoseReadings }) {
  const [showEdit, setShowEdit] = useState(false);
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

  if (!mealInsight) return null;

  // No active meal
  if (!d || d.noActiveMeal) {
    return (
      <DashboardCard className="p-4">
        <p className="text-[13px]" style={{ color: PALETTE.muted }}>No meal to review yet — log nourishment to open a window.</p>
      </DashboardCard>
    );
  }

  // Setup needed
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

  const reviewWindowEnd = d.reviewWindowEnd || (mealTime + 4 * 3600 * 1000);
  const windowRemaining = reviewWindowEnd - now;

  // Absorption
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

  // Glucose response
  const glucoseNow = Number.isFinite(d.latestGlucoseValue) ? d.latestGlucoseValue : d.windowEndGlucoseValue;
  const glucoseAtStart = d.glucoseValue;
  const peakOutcome = d.peakOutcome;
  const peakOutcomeTime = d.peakOutcomeTime;
  const trendArrow = glucoseTrend?.icon ? TREND_ARROW[glucoseTrend.icon] : null;
  const trendLabel = glucoseTrend?.label || "steady";

  const predictedPeakMinAgo = mealResponse.peakTime && mealResponse.peakTime <= now
    ? Math.round((now - mealResponse.peakTime) / 60000)
    : null;
  const absorptionCaption = predictedPeakMinAgo != null
    ? (absorptionPct >= 80 ? "gliding down" : `Peaked ${predictedPeakMinAgo}m ago`)
    : (mealResponse.hasDelayedRise ? "Rising — a lingering wave may follow" : "Absorption underway");

  // Glucose response descriptive line — incorporates second-rise detection
  let glucoseLine = "A steady journey so far.";
  if (Number.isFinite(glucoseNow) && Number.isFinite(glucoseAtStart)) {
    const delta = Math.round(glucoseNow - glucoseAtStart);
    if (glucoseAnalysis.secondRise) {
      glucoseLine = "A second gentle climb appeared — your body is working through the lingering energy from this meal.";
    } else if (Number.isFinite(peakOutcome) && peakOutcome > glucoseAtStart + 15) {
      const rise = Math.round(peakOutcome - glucoseAtStart);
      glucoseLine = `Rose ${rise} points, then settled back`;
    } else if (delta > 15) {
      glucoseLine = `Climbing gently — up ${delta} points so far`;
    } else if (delta < -15) {
      glucoseLine = `A steady descent — down ${Math.abs(delta)} points`;
    } else if (Math.abs(delta) <= 15) {
      if (mealResponse.hasDelayedRise) {
        glucoseLine = "A steady journey — no second climb so far, keeping a gentle eye out for a delayed wave.";
      } else {
        glucoseLine = "A steady journey — no second climb so far.";
      }
    }
  }

  // Slow-digesting banner
  const slowBanner = monitoringStatus?.isActive;

  return (
    <div className="space-y-3">
      {/* 1. Gentle awareness banner for slow-digesting meals */}
      {slowBanner && (
        <DashboardCard className="px-4 py-3">
          <p className="text-[13px] font-semibold leading-snug" style={{ color: PALETTE.ink }}>
            This meal digests slowly
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
            Fat and protein stretch the window — glucose may arrive in a gentle, lingering wave.
          </p>
        </DashboardCard>
      )}

      {/* 2. The meal card */}
      <DashboardCard className="p-4">
        <div className="section-label">The Meal</div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="anchor" style={{ fontSize: 34 }}>{Math.round(totalCarbs)}</span>
          <span className="text-[15px] font-light" style={{ color: PALETTE.muted }}>g · Nourishment in review</span>
        </div>

        <p className="mt-2 text-[12px]" style={{ color: PALETTE.faint }}>
          {formatCountdown(windowRemaining)}
        </p>

        {/* Meal items as ledger rows */}
        <div className="mt-3 space-y-2">
          {carbEntries.map((entry) => {
            const name = entry.food_name || entry.name || "Food";
            const detail = entry.absorption_profile
              ? entry.absorption_profile.charAt(0).toUpperCase() + entry.absorption_profile.slice(1)
              : "";
            return (
              <button
                key={entry.id || name}
                type="button"
                onClick={() => setShowEdit(true)}
                className="flex w-full items-baseline gap-2 text-left transition hover:opacity-70"
              >
                <span className="min-w-0 flex-1">
                  <span className="text-[13px] font-medium" style={{ color: PALETTE.ink }}>{name}</span>
                  {detail && <span className="text-[11px]" style={{ color: PALETTE.faint }}> · {detail}</span>}
                </span>
                <span className="overflow-hidden">
                  <span className="dotted-leader block" />
                </span>
                <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.muted }}>
                  {Math.round(entry.carbs)} g
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={() => setShowEdit(true)}
          className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium transition hover:opacity-70"
          style={{ color: PALETTE.faint }}
        >
          tap an item to edit
          <ChevronRight className="h-3 w-3" />
        </button>
      </DashboardCard>

      {/* 3. Absorption card */}
      <DashboardCard className="p-4">
        <div className="section-label">Absorption</div>

        <div className="mt-3 flex items-baseline gap-2">
          <span className="anchor" style={{ fontSize: 34 }}>{Math.round(absorptionPct)}</span>
          <span className="text-[15px] font-light" style={{ color: PALETTE.muted }}>% processed · {gPerHour.toFixed(1)} g/hour</span>
        </div>

        <div className="mt-3">
          <MealResponseCurve response={mealResponse} now={now} />
        </div>

        <p className="mt-1.5 text-[12px]" style={{ color: PALETTE.muted }}>
          {absorptionCaption}
        </p>
      </DashboardCard>

      {/* 4. Glucose response card */}
      <DashboardCard className="p-4">
        <div className="section-label">Glucose Response</div>

        <div className="mt-3 flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className="anchor" style={{ fontSize: 30 }}>
              {Number.isFinite(glucoseNow) ? Math.round(glucoseNow) : "—"}
            </span>
            <span className="text-[12px]" style={{ color: PALETTE.muted }}>mg/dL now</span>
            {trendArrow && <span style={{ color: PALETTE.muted }}>{trendArrow}</span>}
          </div>
          {Number.isFinite(peakOutcome) && (
            <div className="text-right">
              <span className="text-[12px]" style={{ color: PALETTE.faint }}>peak so far</span>
              <span className="ml-1.5 text-[15px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
                {Math.round(peakOutcome)}
              </span>
            </div>
          )}
        </div>

        <div className="mt-3">
          <span className="text-[12px] leading-relaxed" style={{ color: PALETTE.ink }}>
            {glucoseLine}
          </span>
        </div>

        {/* Enhanced metrics — plain text, no decorative chrome */}
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
      </DashboardCard>

      {showEdit && (
        <MealEditOverlay entries={carbEntries} onClose={() => setShowEdit(false)} />
      )}
    </div>
  );
}