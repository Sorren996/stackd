import { useState } from "react";
import { motion } from "framer-motion";
import IobAtAGlance from "./IobAtAGlance";
import MealReviewAtAGlance from "./MealReviewAtAGlance";
import StackedMealCards from "./StackedMealCards";
import CardErrorBoundary from "@/components/CardErrorBoundary";

const TABS = [
  { id: "iob", label: "Insulin on Board" },
  { id: "meal", label: "Meal Review" },
];

const TAB_ORDER = TABS.map((t) => t.id);

/**
 * "Right Now" — the at-a-glance combined view.
 * Eyebrow + title, a two-tab segmented control with a sliding active
 * indicator, and tab content that slides in from the correct side.
 *
 * Meal Review: when 2+ meals are still in their response window, renders one
 * full card per meal (most recent first) via StackedMealCards. Otherwise
 * renders the single-meal review exactly as before.
 */
export default function RightNowView({
  totalUnits,
  breakdown,
  basalRegimenStatus,
  mealInsight,
  activeMeals,
  monitoringStatus,
  glucoseTrend,
  onEditDose,
  onDeleteDose,
  onResolve,
  onAddLog,
  glucoseReadings,
}) {
  const [tab, setTab] = useState("iob");
  const selectTab = (id) => { if (id !== tab) setTab(id); };
  const activeIndex = TAB_ORDER.indexOf(tab);
  const hasStack = Array.isArray(activeMeals) && activeMeals.length >= 2;

  return (
    <div className="relative">
      {/* Eyebrow + title */}
      <div className="px-1 pt-1">
        <span className="section-label mt-2" style={{ color: "#fcf8ef" }}>
          At a Glance
        </span>
        <h1 className="hdr mt-2" style={{ color: "#f7f1e8" }}>
          Right <em>Now</em>
        </h1>
      </div>

      {/* Tab switcher — pill segmented control with a sliding copper indicator */}
      <div className="mt-3 px-1">
        <div className="inline-flex w-full rounded-full p-1" style={{ background: "#f0e8db" }}>
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                className="relative flex-1 rounded-full px-4 py-2 text-center text-[12px] font-semibold transition-colors"
                style={{
                  color: active ? "#f7f1e8" : "#6b6153",
                }}
                aria-pressed={active}
              >
                {active && (
                  <motion.span
                    layoutId="rightnow-tab-indicator"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "#9c5228", zIndex: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    initial={false}
                    aria-hidden
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content: slides in from the direction of the incoming tab. */}
      <div className="mt-4">
          <motion.div
            key={tab}
            initial={{ opacity: 0, x: activeIndex === 0 ? -24 : 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.28, ease: [0.32, 0.72, 0.25, 1] }}
          >
            {tab === "iob" ? (
              <CardErrorBoundary>
                <IobAtAGlance
                  totalUnits={totalUnits}
                  breakdown={breakdown}
                  basalRegimenStatus={basalRegimenStatus}
                  onEditDose={onEditDose}
                  onDeleteDose={onDeleteDose}
                />
              </CardErrorBoundary>
            ) : hasStack ? (
              <CardErrorBoundary>
                <StackedMealCards
                  meals={activeMeals}
                  monitoringStatus={monitoringStatus}
                  glucoseTrend={glucoseTrend}
                  onResolve={onResolve}
                  glucoseReadings={glucoseReadings}
                />
              </CardErrorBoundary>
            ) : (
              <CardErrorBoundary>
                <MealReviewAtAGlance
                  mealInsight={mealInsight}
                  monitoringStatus={monitoringStatus}
                  glucoseTrend={glucoseTrend}
                  onResolve={onResolve}
                  glucoseReadings={glucoseReadings}
                />
              </CardErrorBoundary>
            )}
          </motion.div>
      </div>
    </div>
  );
}