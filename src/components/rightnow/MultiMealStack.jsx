import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MealReviewAtAGlance from "./MealReviewAtAGlance";
import MealStackChart from "./MealStackChart";
import PeekingMealTab from "./PeekingMealTab";
import DashboardCard from "@/components/dashboard/DashboardCard";

const SAGE = "#5b6550";
const COPPER = "#9c5228";
const INK = "#3f3830";
const TAUPE = "#746959";
const FAINT = "#746959";
const CREAM = "#fdf9f2";

function formatClock(time) {
  if (!Number.isFinite(time)) return "";
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function fmtIOB(u) {
  const n = Number(u);
  if (!Number.isFinite(n)) return "0.0";
  return n.toFixed(1);
}

/**
 * Multi-meal "Stack" Meal Review.
 *
 * When 2+ meals share overlapping bolus IOB windows, the Meal Review renders
 * as a stack: a window banner, one active meal card (the existing single-meal
 * review, unchanged), a shared IOB chart, and peeking tabs beneath that let
 * the user swap which meal is on top. Three or more meals cap at two peeking
 * tabs, then fold into a "+N more" chip.
 *
 * `meals` is sorted ascending by mealTime. The default active meal is the most
 * recent (last). Tapping a peeking tab swaps it to active — a state toggle,
 * not navigation.
 */
export default function MultiMealStack({
  meals,        // [{ group, insight, name, mealTime, carbs, units, perMealIOB, clearTime }]
  totalIOB,
  chartData,
  overlapContexts, // per-meal overlap context (or null)
  now,
  glucoseReadings,
  monitoringStatus,
  glucoseTrend,
  onResolve,
}) {
  // Default active = most recent meal (last in ascending order).
  const [activeIndex, setActiveIndex] = useState(meals.length - 1);
  const [showAll, setShowAll] = useState(false);

  const active = meals[activeIndex];
  const activeOverlap = overlapContexts?.[activeIndex] || null;

  // Peeking tabs: non-active meals, most recent first.
  const peekingMeals = useMemo(() => {
    const indices = meals
      .map((_, i) => i)
      .filter((i) => i !== activeIndex)
      .sort((a, b) => meals[b].mealTime - meals[a].mealTime);
    return indices.map((i) => ({ ...meals[i], originalIndex: i }));
  }, [meals, activeIndex]);

  const visiblePeeking = showAll ? peekingMeals : peekingMeals.slice(0, 2);
  const hiddenCount = peekingMeals.length - visiblePeeking.length;

  const handleSwap = (originalIndex) => {
    setActiveIndex(originalIndex);
    setShowAll(false);
  };

  // Per-meal IOB line for the active card
  const perMealIOBLine = active ? (
    <div className="mt-4">
      <div className="section-label" style={{ marginTop: 0 }}>On board from this meal</div>
      <p className="mt-2 text-[13px] leading-relaxed" style={{ color: INK }}>
        <span className="font-semibold tabular-nums">{fmtIOB(active.perMealIOB)}u</span>
        <span style={{ color: TAUPE }}> on board from this meal</span>
        {active.clearTime && (
          <span style={{ color: TAUPE }}> · clears about {formatClock(active.clearTime)}</span>
        )}
      </p>

      {/* Overlap insight */}
      {activeOverlap && (
        <p className="mt-2 text-[12px] leading-relaxed" style={{ color: TAUPE }}>
          <span style={{ color: INK, fontWeight: 600 }}>What happened: </span>
          at {formatClock(activeOverlap.activeMealTime)}, {fmtIOB(activeOverlap.earlierIOB)}u from the{" "}
          {activeOverlap.earlierMealName} meal was still active when this dose started.
        </p>
      )}

      {/* Shared IOB chart */}
      <div className="mt-4">
        <MealStackChart
          chartData={chartData}
          meals={{ activeIndex, all: meals.map((m) => ({ name: m.name })) }}
          now={now}
        />
      </div>
    </div>
  ) : null;

  return (
    <div className="space-y-3">
      {/* 1. Window banner — translucent sage-tinted rounded pill */}
      <div
        className="flex items-center gap-2 rounded-full px-4 py-2"
        style={{ background: "rgba(91,101,80,0.12)" }}
      >
        <span className="shrink-0 rounded-full" style={{ width: 8, height: 8, background: SAGE }} />
        <span className="text-[12px] font-semibold" style={{ color: INK }}>
          {meals.length} meals in this window
        </span>
        <span className="text-[12px]" style={{ color: TAUPE }}>
          · {fmtIOB(totalIOB)}u total on board · now {formatClock(now)}
        </span>
      </div>

      {/* 2. Active meal card — the existing single-meal review, unchanged */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0.25, 1] }}
        >
          <MealReviewAtAGlance
            mealInsight={active.insight}
            monitoringStatus={monitoringStatus}
            glucoseTrend={glucoseTrend}
            onResolve={onResolve}
            glucoseReadings={glucoseReadings}
            stackExtras={perMealIOBLine}
          />
        </motion.div>
      </AnimatePresence>

      {/* 3. Peeking tabs beneath the card */}
      <div className="relative space-y-2 pt-1">
        {visiblePeeking.map((meal) => (
          <PeekingMealTab
            key={meal.originalIndex}
            name={meal.name}
            mealTime={meal.mealTime}
            carbs={meal.carbs}
            units={meal.units}
            onClick={() => handleSwap(meal.originalIndex)}
            rotation={meal.originalIndex % 2 === 0 ? 1.2 : -1.2}
          />
        ))}

        {/* 4. "+N more" chip */}
        {hiddenCount > 0 && !showAll && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="flex w-full items-center gap-2 rounded-full px-4 py-2 text-left transition-transform active:scale-[0.99]"
            style={{ background: "rgba(116,105,89,0.10)" }}
            aria-label={`Show ${hiddenCount} more meals`}
          >
            <span className="text-[12px] font-semibold" style={{ color: TAUPE }}>
              +{hiddenCount} more
            </span>
            {peekingMeals.slice(2).map((m, i) => (
              <span key={i} className="text-[11px]" style={{ color: FAINT }}>
                · {m.name} · {formatClock(m.mealTime)}
              </span>
            ))}
          </button>
        )}
      </div>

      {/* Hint */}
      <p className="px-1 text-[10px] leading-relaxed" style={{ color: FAINT }}>
        ↑ tap the peeking tab to switch meals · swipe the card for Edit and Delete
      </p>
    </div>
  );
}