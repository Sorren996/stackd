import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import MealReviewAtAGlance from "./MealReviewAtAGlance";
import { getMealSlotLabel } from "@/lib/mealSlot";

const PALETTE = {
  ink: "#3f3830",
  faint: "#746959",
};

function formatClock(time) {
  if (!Number.isFinite(time)) return null;
  return new Date(time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Collapsible Meal Card — a compact summary row for a secondary active meal
 * that expands in place to the full Meal Review detail on tap, then collapses
 * again on a second tap. Used only for the non-most-recent meals in a
 * multi-meal stack; the most recent meal renders the full card directly.
 *
 * The summary row stays visible as the collapse handle. The expanded detail
 * renders the existing Meal Review with its identity row hidden (hideIdentity)
 * so the summary remains the single source of meal identity — no duplication.
 *
 * Copy rule: describes, never prescribes.
 */
export default function CollapsibleMealCard({
  meal,
  monitoringStatus,
  glucoseTrend,
  onResolve,
  glucoseReadings,
}) {
  const [expanded, setExpanded] = useState(false);

  const d = meal?.insight?.details;
  const mealTime = meal?.mealTime ?? d?.meal?.time;
  const carbEntries = d?.mealGroup?.carbEntries || (d?.meal ? [d.meal] : []);
  const totalCarbs = meal?.carbs ?? d?.mealGroup?.carbs ?? 0;
  const mealName = meal?.name || d?.meal?.food_name || d?.meal?.name || "Meal";
  const mealFatGrams = carbEntries.reduce((s, e) => s + Number(e.fat_grams || 0), 0);
  const mealProteinGrams = carbEntries.reduce((s, e) => s + Number(e.protein_grams || 0), 0);
  const combinedFoodName =
    carbEntries.map((e) => e?.food_name || e?.name || "").filter(Boolean).join(", ") || mealName;
  const slotLabel = getMealSlotLabel({
    time: mealTime,
    carbs: totalCarbs,
    fatGrams: mealFatGrams,
    proteinGrams: mealProteinGrams,
    foodName: combinedFoodName,
  });

  return (
    <div>
      {/* Summary handle — always visible, tappable */}
      <DashboardCard className="p-3.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex w-full items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <ChevronDown
            size={18}
            strokeWidth={2.5}
            style={{
              color: PALETTE.faint,
              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 280ms cubic-bezier(0.32, 0.72, 0.25, 1)",
              flexShrink: 0,
            }}
          />
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-semibold" style={{ color: PALETTE.ink }}>
              {mealName}
            </span>
          </div>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ color: PALETTE.faint, background: "#f7f1e8" }}
          >
            {slotLabel}
          </span>
          <span className="shrink-0 text-[11px] tabular-nums" style={{ color: PALETTE.faint }}>
            {formatClock(mealTime)}
          </span>
          <span className="shrink-0 text-[13px] font-semibold tabular-nums" style={{ color: PALETTE.ink }}>
            {Math.round(totalCarbs)}g
          </span>
        </button>
      </DashboardCard>

      {/* Animated detail — expands in place, smooth height/opacity, no jump */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.32, ease: [0.32, 0.72, 0.25, 1] }}
            style={{ overflow: "hidden" }}
          >
            <MealReviewAtAGlance
              mealInsight={meal.insight}
              monitoringStatus={monitoringStatus}
              glucoseTrend={glucoseTrend}
              onResolve={onResolve}
              glucoseReadings={glucoseReadings}
              hideIdentity
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}