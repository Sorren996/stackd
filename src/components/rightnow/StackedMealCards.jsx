import { useState } from "react";
import { motion } from "framer-motion";
import MealReviewAtAGlance from "./MealReviewAtAGlance";

// On-teal text colors — WCAG AA against the #4c6770 page background.
const ON_TEAL_INK = "#f7f1e8"; // 5.47:1 — primary text on teal
const ON_TEAL_MUTED = "#e8dfd2"; // 4.65:1 — secondary text on teal

const PALETTE = {
  copper: "#9c5228",
  cream: "#fdf9f2",
  hairline: "#eadccf",
  ink: "#3f3830",
  faint: "#746959",
  sage: "#4d5742",
};

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Fraction of the meal's response window still remaining (1 = just started,
// 0 = window closed). Drives the faint progress ring on each chip.
function getRemainingFraction(meal, now) {
  const d = meal?.insight?.details;
  const mealTime = meal?.mealTime ?? d?.meal?.time;
  const reviewWindowEnd = d?.reviewWindowEnd;
  if (!Number.isFinite(mealTime) || !Number.isFinite(reviewWindowEnd)) return 0;
  const total = reviewWindowEnd - mealTime;
  const remaining = reviewWindowEnd - now;
  if (total <= 0) return 0;
  return Math.max(0, Math.min(1, remaining / total));
}

function ProgressRing({ fraction, selected }) {
  const size = 14;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = c * fraction;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={selected ? ON_TEAL_MUTED : PALETTE.hairline}
        strokeWidth={stroke}
        opacity={0.6}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={selected ? ON_TEAL_INK : PALETTE.sage}
        strokeWidth={stroke}
        strokeDasharray={`${dash} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

/**
 * Stacked Meal Cards — Chip Switcher variant.
 *
 * A horizontal scrollable chip bar across the top; each chip is one active
 * meal (name · time · carbs) with a faint progress ring showing that meal's
 * remaining response window. The selected chip fills copper; below it the
 * selected meal's full Meal Review card renders. Tapping a chip jumps to
 * that meal.
 *
 * Used only when 2+ meals are still within their glucose-response window.
 *
 * Copy rule: describes, never prescribes.
 */
export default function StackedMealCards({
  meals,
  monitoringStatus,
  glucoseTrend,
  onResolve,
  glucoseReadings,
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  if (!Array.isArray(meals) || meals.length < 2) return null;

  // Clamp the selection if meals shifted (e.g. one left its window).
  const safeIndex = Math.min(selectedIndex, meals.length - 1);
  const selectedMeal = meals[safeIndex];
  const now = Date.now();

  return (
    <div className="space-y-4">
      {/* Chip bar — one chip per active meal, horizontally scrollable */}
      <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1">
        {meals.map((meal, i) => {
          const selected = i === safeIndex;
          const name = meal?.name || "Meal";
          const time = formatClock(meal?.mealTime);
          const carbs = Math.round(meal?.carbs ?? 0);
          const fraction = getRemainingFraction(meal, now);
          return (
            <button
              key={(meal?.group && meal?.group?.mealTime) || `chip-${i}`}
              type="button"
              onClick={() => setSelectedIndex(i)}
              className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 transition-colors"
              style={{
                background: selected ? PALETTE.copper : PALETTE.cream,
                border: `1px solid ${selected ? PALETTE.copper : PALETTE.hairline}`,
                color: selected ? ON_TEAL_INK : PALETTE.ink,
                boxShadow: selected ? "0 4px 14px rgba(156,82,40,0.25)" : "none",
              }}
              aria-pressed={selected}
            >
              <ProgressRing fraction={fraction} selected={selected} />
              <span className="max-w-[120px] truncate text-[12px] font-semibold">
                {name}
              </span>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: selected ? ON_TEAL_MUTED : PALETTE.faint }}
              >
                {time ? `${time} · ` : ""}
                {carbs}g
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected meal — full card, cross-fades with a soft rise on switch */}
      <motion.div
        key={(selectedMeal?.group && selectedMeal?.group?.mealTime) || `meal-${safeIndex}`}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0.25, 1] }}
      >
        <MealReviewAtAGlance
          mealInsight={selectedMeal?.insight}
          monitoringStatus={monitoringStatus}
          glucoseTrend={glucoseTrend}
          onResolve={onResolve}
          glucoseReadings={glucoseReadings}
        />
      </motion.div>
    </div>
  );
}