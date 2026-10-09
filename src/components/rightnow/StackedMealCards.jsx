import { useState } from "react";
import { motion } from "framer-motion";
import MealReviewAtAGlance from "./MealReviewAtAGlance";

// On-teal text colors — WCAG AA against the #4c6770 page background.
const ON_TEAL_INK = "#f7f1e8"; // 5.47:1 — primary text on teal
const ON_TEAL_MUTED = "#e8dfd2"; // 4.65:1 — secondary text on teal

const PALETTE = {
  cream: "#fdf9f2",
  ink: "#3f3830",
  sec: "#6b6153",
};

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Readable "time left in window" label for each chip — replaces the tiny,
// hard-to-read progress ring with useful, legible info.
function formatRemaining(meal, now) {
  const d = meal?.insight?.details;
  const reviewWindowEnd = d?.reviewWindowEnd;
  if (!Number.isFinite(reviewWindowEnd)) return null;
  const ms = reviewWindowEnd - now;
  if (ms <= 0) return "Closed";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m left` : `${h}h left`;
}

/**
 * Stacked Meal Cards — Chip Switcher variant.
 *
 * A labeled sub-strip of meal chips across the top; each chip is one active
 * meal (name · time · carbs · time-left). The selected chip inverts to a
 * solid cream pill with ink text; below it the selected meal's full Meal
 * Review card renders. Tapping a chip jumps to that meal.
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
      {/* Sub-strip — label + chip row, framed as deliberate sub-navigation */}
      <div
        className="rounded-[16px] px-3 py-3"
        style={{
          background: "rgba(247,241,232,0.06)",
          border: "1px solid rgba(247,241,232,0.14)",
        }}
      >
        <div
          className="mb-2 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: ON_TEAL_MUTED }}
        >
          Active meals
        </div>
        <div className="no-scrollbar -mx-1 flex items-center gap-2 overflow-x-auto px-1">
          {meals.map((meal, i) => {
            const selected = i === safeIndex;
            const name = meal?.name || "Meal";
            const time = formatClock(meal?.mealTime);
            const carbs = Math.round(meal?.carbs ?? 0);
            const remaining = formatRemaining(meal, now);
            return (
              <button
                key={(meal?.group && meal?.group?.mealTime) || `chip-${i}`}
                type="button"
                onClick={() => setSelectedIndex(i)}
                className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 transition-colors"
                style={{
                  background: selected
                    ? PALETTE.cream
                    : "rgba(247,241,232,0.12)",
                  border: selected
                    ? `1px solid ${PALETTE.cream}`
                    : "1px solid rgba(247,241,232,0.22)",
                  color: selected ? PALETTE.ink : ON_TEAL_INK,
                  boxShadow: selected
                    ? "0 4px 14px rgba(0,0,0,0.18)"
                    : "none",
                }}
                aria-pressed={selected}
              >
                <span className="max-w-[110px] truncate text-[12px] font-semibold">
                  {name}
                </span>
                <span
                  className="text-[11px] tabular-nums"
                  style={{
                    color: selected ? PALETTE.sec : ON_TEAL_MUTED,
                  }}
                >
                  {time ? `${time} · ` : ""}
                  {carbs}g
                </span>
                {remaining && (
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{
                      color: selected ? PALETTE.ink : ON_TEAL_MUTED,
                      opacity: selected ? 0.7 : 0.85,
                    }}
                  >
                    · {remaining}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected meal — swipeable carousel card.
          Swipe left/right to move between meals; chips update as indicators. */}
      <motion.div
        key={(selectedMeal?.group && selectedMeal?.group?.mealTime) || `meal-${safeIndex}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.32, 0.72, 0.25, 1] }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.18}
        onDragEnd={(_, info) => {
          const SWIPE_THRESHOLD = 50;
          if (info.offset.x < -SWIPE_THRESHOLD && safeIndex < meals.length - 1) {
            setSelectedIndex(safeIndex + 1);
          } else if (info.offset.x > SWIPE_THRESHOLD && safeIndex > 0) {
            setSelectedIndex(safeIndex - 1);
          }
        }}
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