import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import DayMealOutcomes from "./DayMealOutcomes";
import DayInsulinActivity from "./DayInsulinActivity";
import DayRecovery from "./DayRecovery";

const LABEL_COLOR = "#746959"; // 4.8:1 on #fdf9f2 — WCAG AA for normal text

/**
 * Consolidated "Day analysis" section — wraps Meal Outcomes, Insulin Activity,
 * and Recovery into a single expandable section with clearly labelled internal
 * subsections. Each sub-component renders its content bare (no nested
 * collapsible wrapper) so the structure stays flat and scannable.
 */
export default function DayAnalysis({ mealOutcomes, glucose, insulin, targetLow, targetHigh, insulinActivity, recovery }) {
  const [open, setOpen] = useState(false);

  const hasMealOutcomes = mealOutcomes?.length > 0;
  const hasInsulinActivity = !!insulinActivity;
  const hasRecovery = !!recovery;
  const hasContent = hasMealOutcomes || hasInsulinActivity || hasRecovery;
  if (!hasContent) return null;

  return (
    <div
      className="overflow-hidden rounded-2xl"
      style={{ background: "#fdf9f2", boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3"
      >
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: LABEL_COLOR }}>
          Day analysis
        </span>
        <ChevronDown
          className="ml-auto h-4 w-4 transition-transform duration-200"
          style={{ color: LABEL_COLOR, transform: open ? "none" : "rotate(-90deg)" }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-5 px-4 pb-4">
              {hasMealOutcomes && (
                <div>
                  <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: LABEL_COLOR }}>
                    Meal outcomes
                  </p>
                  <DayMealOutcomes
                    meals={mealOutcomes}
                    glucose={glucose}
                    insulin={insulin}
                    targetLow={targetLow}
                    targetHigh={targetHigh}
                    bare
                  />
                </div>
              )}
              {hasInsulinActivity && (
                <div>
                  <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: LABEL_COLOR }}>
                    Insulin activity
                  </p>
                  <DayInsulinActivity activity={insulinActivity} bare />
                </div>
              )}
              {hasRecovery && (
                <div>
                  <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.16em]" style={{ color: LABEL_COLOR }}>
                    Recovery
                  </p>
                  <DayRecovery recovery={recovery} bare />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}