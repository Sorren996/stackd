import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

function TooltipPopover({ title, description, onClose, children }) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[300] flex items-center justify-center p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: -12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: -8 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onClick={(event) => event.stopPropagation()}
          className="tooltip-popover relative flex max-h-[min(82dvh,620px)] w-full max-w-xs flex-col overflow-hidden rounded-2xl border p-4 shadow-2xl"
          style={{
            background: "linear-gradient(145deg, rgba(22,32,28,0.96), rgba(16,24,21,0.94))",
            borderColor: "rgba(255,255,255,0.14)",
            boxShadow: "0 18px 50px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)",
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -inset-8 opacity-50"
            style={{
              background: "radial-gradient(circle at 25% 0%, rgba(255,255,255,0.14), transparent 34%), radial-gradient(circle at 88% 120%, rgba(45,212,191,0.1), transparent 42%)",
            }}
          />
          <div className="relative z-10 flex min-h-0 flex-col">
            <div className="mb-2 flex shrink-0 items-start justify-between gap-3">
              <p className="text-sm font-semibold text-white">{title}</p>
              <button onClick={onClose} className="text-white/40 transition-colors hover:text-white/80">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="shrink-0 text-xs leading-relaxed text-white/50">{description}</p>
            <div
              className="-mx-1 mt-3 min-h-0 overflow-y-auto overscroll-contain px-1 pb-1"
              style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
            >
              {children}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function MealBalanceTooltip({ mealInsight, open, onClose }) {
  if (!open || !mealInsight?.details) return null;

  return (
    <TooltipPopover
      title="Meal Balance"
      description="A gentle snapshot of how your nourishment and support are working together."
      onClose={onClose}
    >
      <div className="mt-3 space-y-4">
        {/* Headline status */}
        <div className="text-center">
          <p className="text-2xl font-bold" style={{ color: mealInsight.color }}>
            {mealInsight.value}
          </p>
          <p className="mt-0.5 text-xs text-white/50">{mealInsight.status}</p>
        </div>

        {/* Balance bar with coverage % */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-[11px] font-medium text-white/40">
            <span>{mealInsight.details.loggedTotalUnits.toFixed(1)}u logged</span>
            {mealInsight.details.coveragePercent !== null && (
              <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ color: mealInsight.color, background: `${mealInsight.color}15` }}>
                {mealInsight.details.coveragePercent}% coverage
              </span>
            )}
            <span>{mealInsight.details.grossDoseEstimate.toFixed(1)}u estimated</span>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-white/20"
              style={{ width: `${Math.min(100, Math.max(4, mealInsight.details.grossDoseEstimate * 12))}%` }}
            />
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.min(100, Math.max(4, mealInsight.details.loggedTotalUnits * 12))}%`,
                backgroundColor: mealInsight.color,
              }}
            />
          </div>
        </div>

        {/* Key numbers — color-coded */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border p-3 text-center" style={{ borderColor: `${mealInsight.color}30`, background: `${mealInsight.color}08` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Nourishment</p>
            <p className="mt-1 text-lg font-bold text-white">{Math.round(mealInsight.details.meal.carbs)}g</p>
            <p className="mt-0.5 text-[10px] text-white/30">~{mealInsight.details.gramsPerUnit.toFixed(1)}g per unit</p>
          </div>
          <div className="rounded-xl border p-3 text-center" style={{ borderColor: `${mealInsight.color}30`, background: `${mealInsight.color}08` }}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Support Logged</p>
            <p className="mt-1 text-lg font-bold text-white">{mealInsight.details.loggedTotalUnits.toFixed(1)}u</p>
            <p className="mt-0.5 text-[10px] text-white/30">
              {mealInsight.details.loggedMealUnits.toFixed(1)} meal + {mealInsight.details.loggedCorrectionUnits.toFixed(1)} restoration
            </p>
          </div>
        </div>

        {/* Glucose journey */}
        {mealInsight.details.correctionGlucoseValue !== null && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Glucose Journey</p>
            <div className="flex items-center justify-between gap-1.5">
              <div className="text-center">
                <p className="text-[10px] text-white/30">At Meal</p>
                <p className="text-sm font-bold text-white">{Math.round(mealInsight.details.correctionGlucoseValue)}</p>
              </div>
              {mealInsight.details.latestGlucoseValue !== null && (
                <>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-white/20" />
                  <div className="text-center">
                    <p className="text-[10px] text-white/30">Now</p>
                    <p className="text-sm font-bold" style={{ color: mealInsight.color }}>{Math.round(mealInsight.details.latestGlucoseValue)}</p>
                  </div>
                </>
              )}
              {(mealInsight.details.peakOutcome || mealInsight.details.lowOutcome) && (
                <>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/20 to-white/10" />
                  <div className="text-center">
                    <p className="text-[10px] text-white/30">Range</p>
                    <p className="text-[11px] font-bold text-white/60">
                      {mealInsight.details.lowOutcome ?? "--"}–{mealInsight.details.peakOutcome ?? "--"}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Continuous outcome assessment */}
        {mealInsight.details.outcomeAssessment && (
          <div
            className="rounded-xl border p-3"
            style={{
              borderColor: `${mealInsight.details.outcomeAssessment.color}30`,
              background: `${mealInsight.details.outcomeAssessment.color}0a`,
            }}
          >
            <p className="text-xs font-semibold" style={{ color: mealInsight.details.outcomeAssessment.color }}>
              {mealInsight.details.outcomeAssessment.label}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">
              {mealInsight.details.outcomeAssessment.message}
            </p>
          </div>
        )}

        {/* Numbers breakdown */}
        {mealInsight.details && mealInsight.details.grossDoseEstimate > 0 && mealInsight.details.meal?.carbs > 0 && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 space-y-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">How the Numbers Align</p>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-[11px] font-medium text-white/50">Nourishment</span>
                <span className="text-[9px] text-white/25 truncate">
                  {Math.round(mealInsight.details.meal.carbs)}g ÷ {mealInsight.details.gramsPerUnit.toFixed(1)}g/u
                </span>
              </div>
              <span className="text-[12px] font-semibold text-white/65 shrink-0">
                {mealInsight.details.expectedMealUnits.toFixed(1)}u
              </span>
            </div>
            {mealInsight.details.correctionUnitsNeeded > 0.01 && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-medium text-white/50">Gentle Adjustment</span>
                <span className="text-[12px] font-semibold text-white/65">
                  +{mealInsight.details.correctionUnitsNeeded.toFixed(1)}u
                </span>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-medium text-white/50">Already Logged</span>
              <span className="text-[12px] font-semibold text-white/65">
                −{mealInsight.details.loggedTotalUnits.toFixed(1)}u
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-white/10 pt-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-white/55">Suggested Support</span>
              <span className="text-[15px] font-bold" style={{ color: mealInsight.color }}>
                {mealInsight.details.estimatedAdditionalUnits.toFixed(1)}u
              </span>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">How This Works</p>
          <div className="space-y-1.5 text-[11px] leading-relaxed text-white/40">
            <p>
              <span className="font-semibold text-white/55">Carb estimate</span> — your carbs are divided by your meal ratio to estimate how much insulin your meal needs.
            </p>
            <p>
              <span className="font-semibold text-white/55">Correction factor</span> — if a glucose reading near your meal is above range, we estimate extra support based on your sensitivity.
            </p>
            <p>
              <span className="font-semibold text-white/55">What you logged</span> — the insulin you already took is compared to that estimate so you can see how things line up.
            </p>
          </div>
        </div>

        {/* Encouraging note */}
        <p className="text-center text-[11px] leading-relaxed text-white/35">
          {mealInsight.details.mealStillUnderReview
            ? "Still settling — we're keeping an eye on this one with you."
            : "This meal's window has passed. Nice work staying on top of it."}
        </p>
      </div>
    </TooltipPopover>
  );
}