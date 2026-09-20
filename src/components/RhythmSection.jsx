import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import MealReviewContent from "@/components/insulin/MealReviewContent";
import InsulinOnBoardCard from "@/components/insulin/InsulinOnBoardCard";

const TABS = [
  { id: "meal", label: "Meal Review" },
  { id: "iob", label: "Insulin on Board" },
];

const EASE = [0.22, 1, 0.36, 1];

/**
 * Unified Dashboard section combining Meal Review and Insulin on Board
 * behind a segmented pill navigation. The control stays stationary while
 * the content slides horizontally between the two views — like switching
 * pages in a native iOS interface. All existing calculations, logic, and
 * data flow are preserved; this is purely a composition layer.
 */
export default function RhythmSection({
  mealInsight,
  highProteinFatStatus,
  glucoseTrend,
  onResolveMeal,
  totalUnits,
  breakdown,
  basalRegimenStatus,
}) {
  const [tab, setTab] = useState("meal");
  const [direction, setDirection] = useState(0);

  const handleTabChange = (newTab) => {
    if (newTab === tab) return;
    setDirection(newTab === "iob" ? 1 : -1);
    setTab(newTab);
  };

  return (
    <div>
      {/* Segmented navigation — subtle, integrated, not a heavy pill */}
      <div className="relative flex items-center gap-7">
        {TABS.map((t) => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => handleTabChange(t.id)}
              className="relative pb-1.5 text-[13px] font-semibold transition-colors duration-200"
              style={{ color: isActive ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.40)" }}
            >
              {t.label}
              {isActive && (
                <motion.div
                  layoutId="rhythm-tab-indicator"
                  className="absolute -bottom-px left-0 right-0 h-[2px] rounded-full"
                  style={{ background: "rgba(255,255,255,0.55)" }}
                  transition={{ duration: 0.25, ease: EASE }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Content — horizontal slide transition */}
      <div className="relative mt-4 overflow-hidden">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={tab}
            custom={direction}
            variants={{
              enter: (dir) => ({ x: dir >= 0 ? "100%" : "-100%", opacity: 0 }),
              center: { x: 0, opacity: 1 },
              exit: (dir) => ({ x: dir >= 0 ? "-100%" : "100%", opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: EASE }}
          >
            {tab === "meal" ? (
              <MealReviewContent
                mealInsight={mealInsight}
                monitoringStatus={highProteinFatStatus}
                glucoseTrend={glucoseTrend}
                onResolve={onResolveMeal}
              />
            ) : (
              <InsulinOnBoardCard
                totalUnits={totalUnits}
                breakdown={breakdown}
                basalRegimenStatus={basalRegimenStatus}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}