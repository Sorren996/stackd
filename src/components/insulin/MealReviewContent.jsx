import { useState } from "react";
import { CheckCircle2, Clock, ChevronDown } from "lucide-react";
import { getCarbAbsorptionAt } from "@/lib/carbAbsorption";
import MealProjectionChart from "./MealProjectionChart";
import MealEditOverlay from "./MealEditOverlay";

const RESCUE_COLOR = "#8a6db8";
const PALETTE = {
  green: "#4d5742",
  amber: "#8a5a12",
  muted: "#6b6153",
  ink: "#3f3830",
  faint: "#746959",
  hairline: "#eadccf",
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

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function mealLabel(mealTime) {
  if (!Number.isFinite(mealTime)) return "Meal";
  const h = new Date(mealTime).getHours();
  if (h < 10) return "Breakfast";
  if (h < 14) return "Lunch";
  if (h < 17) return "Snack";
  return "Dinner";
}

/**
 * Meal Review — editorial layout matching the approved mock.
 * Focal anchor is total carbs; absorption track, glucose line, projection
 * chart, and edit-items overlay. All existing data and logic preserved;
 * presentation only.
 */
export default function MealReviewContent({ mealInsight, monitoringStatus, glucoseTrend, onResolve }) {
  const [showEditItems, setShowEditItems] = useState(false);

  if (!mealInsight) return null;

  const d = mealInsight.details;
  const trendArrow = glucoseTrend?.icon ? TREND_ARROW[glucoseTrend.icon] : null;
  const trendLabel = glucoseTrend?.label || "steady";

  // ── NO ACTIVE MEAL ──────────────────────────────────────────────
  if (!d || d.noActiveMeal) {
    return (
      <div className="px-1 pt-2 pb-6">
        <p className="text-sm" style={{ color: PALETTE.muted }}>No meal to review yet.</p>
      </div>
    );
  }

  // ── SETUP STATE ────────────────────────────────────────────────
  if (!d.meal) {
    const needsSetup = mealInsight.value === "Setup needed";
    return (
      <div className="px-1 pt-2 pb-6 space-y-1">
        <p className="text-sm font-semibold" style={{ color: PALETTE.ink }}>{mealInsight.value}</p>
        <p className="text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>
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
  const mealTime = d.meal?.time;
  const glucoseNow = Number.isFinite(d.latestGlucoseValue) ? d.latestGlucoseValue : d.windowEndGlucoseValue;
  const glucoseAtStart = d.glucoseValue;
  const peakOutcome = d.peakOutcome;
  const peakOutcomeTime = d.peakOutcomeTime;
  const targetLow = d.targetLow || 70;
  const targetHigh = d.targetHigh || 180;
  const reviewWindowEnd = d.reviewWindowEnd || (mealTime + 4 * 3600 * 1000);

  // Compute absorption from carb entries
  const carbEntries = d.mealGroup?.carbEntries || (d.meal ? [d.meal] : []);
  const nowMs = Date.now();
  let totalAbsorbed = 0;
  let totalRemaining = 0;
  carbEntries.forEach((entry) => {
    if (!entry || !Number.isFinite(entry.carbs)) return;
    // For custom entries or entries without a validated absorption profile,
    // use a default "medium" profile so the absorption track still reflects
    // digestion timing.
    const entryForCalc = (!entry.absorption_profile || entry.is_custom)
      ? { ...entry, absorption_profile: entry.absorption_profile || "medium", is_custom: false }
      : entry;
    const result = getCarbAbsorptionAt(entryForCalc, nowMs);
    totalAbsorbed += result.absorbedGrams || 0;
    totalRemaining += result.remainingGrams || 0;
  });
  const totalCarbsAbs = totalAbsorbed + totalRemaining;
  const absorptionPct = totalCarbsAbs > 0 ? Math.min(100, (totalAbsorbed / totalCarbsAbs) * 100) : 0;
  const absorption = { absorbed: Math.round(totalAbsorbed), remaining: Math.round(totalRemaining), pct: absorptionPct };

  const foodList = carbEntries
    .map((e) => e?.food_name || e?.name)
    .filter(Boolean)
    .join(", ");

  const nowTime = formatClock(Date.now());
  const loggedTime = formatClock(mealTime);
  const mealName = mealLabel(mealTime);

  return (
    <div className="px-1 pt-2 pb-6">
      {/* Header */}
      <div className="flex items-baseline justify-between">
        <h3 className="hdr">Meal <em>review</em></h3>
        <span className="hdr-date">{nowTime}</span>
      </div>

      {/* Focal anchor — total carbs */}
      <div className="mt-4 flex items-baseline gap-2">
        <span className="anchor">{mealCarbs}</span>
        <span className="text-[22px] font-light" style={{ color: PALETTE.muted }}>g carbs</span>
      </div>

      {/* Meal metadata */}
      <div className="mt-1">
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: PALETTE.faint }}>
          {mealName}, LOGGED {loggedTime}
        </span>
      </div>
      {foodList && (
        <p className="mt-0.5 text-[13px]" style={{ color: PALETTE.muted }}>{foodList}</p>
      )}

      {/* Absorption track */}
      <div className="mt-4">
        <div className="relative h-[5px] w-full rounded-full" style={{ background: PALETTE.hairline }}>
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${absorption.pct}%`, background: PALETTE.ink, transition: "width 600ms ease-out" }}
          />
        </div>
        <div className="mt-1.5 flex items-baseline justify-between">
          <span className="text-[13px] font-semibold" style={{ color: PALETTE.ink }}>
            {absorption.absorbed} g absorbed
          </span>
          <span className="text-[13px]" style={{ color: PALETTE.faint }}>
            {absorption.remaining} g remaining
          </span>
        </div>
      </div>

      {/* Glucose line */}
      {Number.isFinite(glucoseNow) && (
        <div className="mt-4 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: PALETTE.green }} />
          <span className="text-[14px]" style={{ color: PALETTE.ink }}>
            {Math.round(glucoseNow)} mg/dL, {trendLabel}
          </span>
        </div>
      )}

      {/* "Where you're headed" section */}
      <div className="mt-6">
        <div className="sec">Where you're headed</div>
        <div className="rule" />
      </div>

      {/* Projection chart */}
      <div className="mt-3">
        <MealProjectionChart
          mealTime={mealTime}
          reviewWindowEnd={reviewWindowEnd}
          startingGlucose={glucoseAtStart}
          peakGlucose={peakOutcome}
          peakTime={peakOutcomeTime}
          currentGlucose={glucoseNow}
          targetLow={targetLow}
          targetHigh={targetHigh}
        />
      </div>

      {/* Annotation under chart */}
      <p className="mt-2 text-[12px] leading-relaxed" style={{ color: PALETTE.muted }}>
        {(() => {
          const absorbedStr = absorption.absorbed;
          const remainingStr = absorption.remaining;
          if (absorption.pct >= 90) {
            return <>Absorption nearly complete — <em className="font-serif-italic" style={{ color: PALETTE.ink }}>settling</em> toward your range.</>;
          }
          if (absorption.pct >= 50) {
            return <>{absorbedStr} g absorbed, {remainingStr} g still in play — <em className="font-serif-italic" style={{ color: PALETTE.ink }}>finding its balance</em>.</>;
          }
          return <>Absorption underway — <em className="font-serif-italic" style={{ color: PALETTE.ink }}>gently rising</em> as carbs take effect.</>;
        })()}
      </p>

      {/* High protein/fat monitoring notice */}
      {monitoringStatus?.isActive && (
        <div className="mt-3 flex items-start gap-1.5">
          <Clock className="h-3.5 w-3.5 shrink-0" style={{ color: PALETTE.amber }} />
          <p className="text-[11px] leading-relaxed" style={{ color: PALETTE.muted }}>
            Delayed meal response possible — monitoring through{" "}
            <span className="font-semibold" style={{ color: PALETTE.amber }}>
              {new Date(monitoringStatus.endTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </span>
          </p>
        </div>
      )}

      {/* Edit items pill trigger */}
      {carbEntries.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowEditItems(true)}
            className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition hover:opacity-70"
            style={{ borderColor: PALETTE.hairline, color: PALETTE.ink, background: "#fdf9f2" }}
          >
            Edit items
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Meal edit overlay — real edit form for all items in this meal */}
      {showEditItems && (
        <MealEditOverlay entries={carbEntries} onClose={() => setShowEditItems(false)} />
      )}

      {/* Mark as Resolved */}
      {d.mealStillUnderReview && onResolve && (
        <button
          type="button"
          onClick={onResolve}
          className="mt-4 flex w-full items-center justify-center gap-2 py-2 text-[12px] font-semibold transition hover:opacity-70"
          style={{ color: PALETTE.green }}
        >
          <CheckCircle2 className="h-4 w-4" strokeWidth={2.5} />
          Mark as Resolved
        </button>
      )}
    </div>
  );
}