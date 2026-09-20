import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import {
  SPLIT_STRATEGIES,
  REVIEW_OPTIONS,
  calculateFirstUnits,
  calculatePercentage,
  calculateRemaining,
} from "@/lib/splitDoseUtils";
import SplitPlanConfirm from "./SplitPlanConfirm";

const STRATEGY_OPTIONS = [
  { id: SPLIT_STRATEGIES.SINGLE, label: "Single dose" },
  { id: SPLIT_STRATEGIES.SPLIT, label: "Split dose" },
  { id: SPLIT_STRATEGIES.DECIDE_LATER, label: "Decide later" },
];

const PRESET_PERCENTAGES = [25, 33, 50, 67, 75];

const SEGMENT_TRANSITION =
  "border-color 250ms ease-out, background 250ms ease-out, box-shadow 250ms ease-out, color 250ms ease-out";

const insulinTypeOptions = Object.entries(INSULIN_PROFILES).map(([name, profile]) => ({
  value: name,
  label: name,
  description: profile.category,
}));

function InlineNumberInput({ value, onChange, placeholder = "0", maxLength = 4, decimal = true, className = "" }) {
  const textValue = value === undefined || value === null ? "" : String(value);

  const handleChange = (e) => {
    const next = e.target.value;
    if (decimal ? !/^\d*\.?\d*$/.test(next) : !/^\d*$/.test(next)) return;
    onChange(next);
  };

  return (
    <input
      type="text"
      inputMode={decimal ? "decimal" : "numeric"}
      value={textValue}
      onChange={handleChange}
      placeholder={placeholder}
      maxLength={maxLength}
      className={`w-full min-w-0 bg-transparent text-right font-bold text-white placeholder:text-white/25 focus:outline-none ${className}`}
    />
  );
}

export default function SplitDosePlanner({ mealName, expectedDose, onConfirm }) {
  const [strategy, setStrategy] = useState(SPLIT_STRATEGIES.SINGLE);
  const [totalPlannedUnits, setTotalPlannedUnits] = useState("");
  const [firstPortionUnits, setFirstPortionUnits] = useState("");
  const [firstPortionPercentage, setFirstPortionPercentage] = useState("");
  const [reviewAfterMinutes, setReviewAfterMinutes] = useState(120);
  const [insulinType, setInsulinType] = useState("");
  const [showConfirmation, setShowConfirmation] = useState(false);

  const remainingUnits = useMemo(
    () => calculateRemaining(totalPlannedUnits, firstPortionUnits),
    [totalPlannedUnits, firstPortionUnits]
  );

  const secondPercentage = useMemo(() => {
    const first = Number(firstPortionPercentage);
    if (!Number.isFinite(first) || first <= 0) return "";
    return Math.max(0, 100 - first);
  }, [firstPortionPercentage]);

  const canReview =
    Number(totalPlannedUnits) > 0 &&
    Number(firstPortionUnits) > 0 &&
    Number(firstPortionUnits) <= Number(totalPlannedUnits) &&
    Boolean(insulinType);

  const handleUnitsChange = (value) => {
    setFirstPortionUnits(value);
    setFirstPortionPercentage(calculatePercentage(totalPlannedUnits, value));
  };

  const handlePercentageChange = (value) => {
    setFirstPortionPercentage(value);
    setFirstPortionUnits(calculateFirstUnits(totalPlannedUnits, value));
  };

  const handleTotalChange = (value) => {
    setTotalPlannedUnits(value);
    if (firstPortionPercentage) {
      setFirstPortionUnits(calculateFirstUnits(value, firstPortionPercentage));
    }
  };

  const buildPlanData = (logFirstDose) => ({
    strategy,
    totalPlannedUnits: Number(totalPlannedUnits),
    firstPlannedUnits: Number(firstPortionUnits),
    followUpPlannedUnits: Number(remainingUnits) || 0,
    insulinType,
    reviewAfterMinutes,
    logFirstDose,
  });

  const handleConfirmAndLog = () => {
    setShowConfirmation(false);
    onConfirm(buildPlanData(true));
  };

  const handleSavePlanOnly = () => {
    setShowConfirmation(false);
    onConfirm(buildPlanData(false));
  };

  return (
    <>
      <div className="mt-6">
        {/* Strategy selector — matches the Stackd insulin selector language */}
        <div className="flex gap-2">
          {STRATEGY_OPTIONS.map((option) => {
            const isSelected = strategy === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setStrategy(option.id)}
                className="flex-1 rounded-full border px-3 py-2.5 text-xs font-semibold transition"
                style={{
                  transition: SEGMENT_TRANSITION,
                  borderColor: isSelected ? "rgba(91,168,138,0.65)" : "rgba(255,255,255,0.10)",
                  background: isSelected
                    ? "linear-gradient(145deg, rgba(91,168,138,0.20), rgba(91,163,184,0.10))"
                    : "rgba(255,255,255,0.03)",
                  boxShadow: isSelected
                    ? "0 0 0 1px rgba(91,168,138,0.30), 0 0 18px rgba(91,168,138,0.28), inset 0 1px 1px rgba(255,255,255,0.10)"
                    : "inset 0 1px 1px rgba(255,255,255,0.04)",
                  color: isSelected ? "rgba(255,255,255,0.97)" : "rgba(255,255,255,0.60)",
                }}
                aria-pressed={isSelected}
              >
                {option.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence>
          {strategy === SPLIT_STRATEGIES.SPLIT && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="space-y-7 pt-7">
                {/* Total meal insulin */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="stackd-section-label">Total Meal Insulin</span>
                    {expectedDose ? (
                      <span className="text-[11px] text-teal-300/60">
                        estimate {expectedDose}u
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-baseline gap-2 border-b border-white/8 pb-5">
                    <InlineNumberInput
                      value={totalPlannedUnits}
                      onChange={handleTotalChange}
                      maxLength={4}
                      className="text-4xl"
                    />
                    <span className="shrink-0 text-sm font-medium text-white/45">units</span>
                  </div>
                </div>

                {/* First portion */}
                <div>
                  <span className="stackd-section-label">First Portion</span>
                  <div className="mt-3 flex items-baseline gap-3">
                    <InlineNumberInput
                      value={firstPortionUnits}
                      onChange={handleUnitsChange}
                      maxLength={4}
                      className="text-3xl"
                    />
                    <span className="shrink-0 text-sm font-medium text-white/45">units</span>
                    <div className="ml-auto flex min-w-[64px] items-baseline gap-1">
                      <InlineNumberInput
                        value={firstPortionPercentage}
                        onChange={handlePercentageChange}
                        maxLength={3}
                        decimal={false}
                        className="text-lg text-white/70"
                      />
                      <span className="shrink-0 text-xs font-medium text-white/40">%</span>
                    </div>
                  </div>

                  {/* Lightweight preset choices */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {PRESET_PERCENTAGES.map((preset) => {
                      const isSelected = Number(firstPortionPercentage) === preset;
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handlePercentageChange(String(preset))}
                          className="rounded-full px-3.5 py-1.5 text-xs font-semibold transition"
                          style={{
                            transition: SEGMENT_TRANSITION,
                            border: `1px solid ${isSelected ? "rgba(91,168,138,0.55)" : "rgba(255,255,255,0.08)"}`,
                            background: isSelected
                              ? "linear-gradient(145deg, rgba(91,168,138,0.18), rgba(91,163,184,0.10))"
                              : "transparent",
                            boxShadow: isSelected
                              ? "0 0 14px rgba(91,168,138,0.22), inset 0 1px 1px rgba(255,255,255,0.08)"
                              : "none",
                            color: isSelected ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.55)",
                          }}
                          aria-pressed={isSelected}
                        >
                          {preset}%
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Subtle divider between portions */}
                <div className="border-t border-white/8" />

                {/* Second portion */}
                <div>
                  <span className="stackd-section-label">Second Portion</span>
                  <div className="mt-3 flex items-baseline gap-3">
                    <span className="text-3xl font-bold leading-none text-white/90">
                      {remainingUnits || "0"}
                    </span>
                    <span className="text-sm font-medium text-white/45">units</span>
                    {secondPercentage !== "" && (
                      <span className="ml-auto text-lg font-semibold text-white/55">
                        {secondPercentage}%
                      </span>
                    )}
                  </div>
                  <p className="mt-2.5 text-xs text-white/40">
                    Remaining planned: {remainingUnits || "0"} units
                  </p>
                </div>

                {/* Timing — native iOS setting row */}
                <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-5">
                  <span className="stackd-section-label">Take Remaining Portion</span>
                  <div className="relative flex items-center">
                    <select
                      value={String(reviewAfterMinutes)}
                      onChange={(e) => setReviewAfterMinutes(Number(e.target.value))}
                      className="appearance-none bg-transparent pr-5 text-sm font-semibold text-white focus:outline-none"
                    >
                      {REVIEW_OPTIONS.map((r) => (
                        <option key={r.value} value={String(r.value)} className="bg-popover text-foreground">
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-white/40" />
                  </div>
                </div>

                {/* Insulin type — native iOS setting row */}
                <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-5">
                  <span className="stackd-section-label">Insulin Type</span>
                  <div className="relative flex min-w-0 items-center">
                    <select
                      value={insulinType}
                      onChange={(e) => setInsulinType(e.target.value)}
                      className="appearance-none bg-transparent pr-5 text-right text-sm font-semibold text-white focus:outline-none"
                    >
                      {!insulinType && (
                        <option value="" className="bg-popover text-foreground">
                          Select insulin type
                        </option>
                      )}
                      {insulinTypeOptions.map((option) => (
                        <option key={option.value} value={option.value} className="bg-popover text-foreground">
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-white/40" />
                  </div>
                </div>

                {/* Review plan — primary action */}
                <button
                  type="button"
                  onClick={() => setShowConfirmation(true)}
                  disabled={!canReview}
                  className="w-full rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-40"
                  style={{
                    background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))",
                    boxShadow: "0 8px 28px rgba(91,163,184,0.22), inset 0 1px 1px rgba(255,255,255,0.2)",
                  }}
                >
                  Review plan
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <SplitPlanConfirm
        open={showConfirmation}
        onClose={() => setShowConfirmation(false)}
        mealName={mealName}
        totalPlannedUnits={totalPlannedUnits}
        firstPlannedUnits={firstPortionUnits}
        remainingUnits={remainingUnits}
        reviewAfterMinutes={reviewAfterMinutes}
        onConfirmAndLog={handleConfirmAndLog}
        onSavePlanOnly={handleSavePlanOnly}
      />
    </>
  );
}