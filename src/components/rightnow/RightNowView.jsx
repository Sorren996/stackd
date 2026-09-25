import { useState } from "react";
import { motion } from "framer-motion";
import IobAtAGlance from "./IobAtAGlance";
import MealReviewAtAGlance from "./MealReviewAtAGlance";
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
 */
export default function RightNowView({
  totalUnits,
  breakdown,
  basalRegimenStatus,
  mealInsight,
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

  return (
    <div className="relative">
      {/* Eyebrow + title */}
      <div className="px-1 pt-1">
        <span className="section-label mt-2" style={{ color: "#d8cec2", borderBottomColor: "#d8cec255" }}>
          At a Glance
        </span>
        <h1 className="hdr mt-2" style={{ color: "#f7f1e8" }}>
          Right <em style={{ color: "#eadccf" }}>Now</em>
        </h1>
      </div>

      {/* Segmented control — sliding active indicator */}
      <div className="mt-3 px-1">
        <div className="relative flex gap-1 rounded-full p-1" style={{ background: "#f0e8db" }}>
          {/* Sliding espresso pill */}
          <motion.div
            className="absolute inset-y-1 rounded-full"
            style={{ background: "#3f3830", width: "calc(50% - 4px)" }}
            animate={{ left: activeIndex === 0 ? 4 : "calc(50% + 0px)" }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          />
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                className="relative z-10 flex-1 rounded-full py-2 text-center text-[12px] font-semibold transition-colors"
                style={{ color: active ? "#f7f1e8" : "#6b6153" }}
                aria-pressed={active}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content: a simple keyed fade with no exit phase, so switching
          tabs can never leave the area blank waiting on an animation. */}
      <div className="mt-4">
          <motion.div
            key={tab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.15 }}
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