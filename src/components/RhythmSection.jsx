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
      {/* Segmented pill navigation */}
      <div
        className="relative flex rounded-full p-1"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => handleTabChange(t.id)}
            className="relative flex-1 rounded-full py-2 text-[12px] font-semibold"
          >
            {tab === t.id && (
              <motion.div
                layoutId="rhythm-tab-indicator"
                className="absolute inset-0 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  boxShadow: "inset 0 1px 1px rgba(255,255,255,0.08), 0 2px 8px rgba(0,0,0,0.12)",
                }}
                transition={{ duration: 0.25, ease: EASE }}
              />
            )}
            <span className={`relative z-10 transition-colors duration-200 ${tab === t.id ? "text-white" : "text-white/40"}`}>
              {t.label}
            </span>
          </button>
        ))}
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