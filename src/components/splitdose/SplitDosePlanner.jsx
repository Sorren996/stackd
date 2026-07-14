import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Split } from "lucide-react";
import { NumberPadField, SelectField } from "@/components/FormInputFields";
import { INSULIN_PROFILES } from "@/lib/insulinPharmacology";
import {
  SPLIT_STRATEGIES,
  REVIEW_OPTIONS,
  calculateFirstUnits,
  calculatePercentage,
  calculateRemaining,
  formatReviewDuration,
} from "@/lib/splitDoseUtils";
import SplitPlanConfirm from "./SplitPlanConfirm";

const STRATEGY_OPTIONS = [
  { id: SPLIT_STRATEGIES.SINGLE, label: "Single dose" },
  { id: SPLIT_STRATEGIES.SPLIT, label: "Split dose" },
  { id: SPLIT_STRATEGIES.DECIDE_LATER, label: "Decide later" },
];

const insulinTypeOptions = Object.entries(INSULIN_PROFILES).map(([name, profile]) => ({
  value: name,
  label: name,
  description: profile.category,
}));

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
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-3 flex items-center gap-2">
          <Split className="h-4 w-4 text-teal-300/70" />
          <p className="text-sm font-bold uppercase tracking-widest text-white/40">Meal insulin strategy</p>
        </div>

        <div className="flex rounded-xl border border-white/10 bg-white/[0.04] p-1">
          {STRATEGY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setStrategy(option.id)}
              className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${
                strategy === option.id ? "bg-white/10 text-white" : "text-white/40 hover:text-white/60"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {strategy === SPLIT_STRATEGIES.SPLIT && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-3 space-y-3">
                <p className="text-[11px] leading-relaxed text-white/35">
                  Enter the total amount from your established insulin plan. Stackd will organize this amount for tracking but will not determine your dose.
                </p>
                {expectedDose && (
                  <p className="text-[11px] text-teal-300/60">
                    Your estimated meal insulin: {expectedDose} units
                  </p>
                )}
                <NumberPadField
                  label="Total planned meal insulin"
                  value={totalPlannedUnits}
                  onChange={handleTotalChange}
                  unit="units"
                  placeholder="0"
                  maxLength={4}
                />
                <div className="grid grid-cols-2 gap-2">
                  <NumberPadField
                    label="First portion"
                    value={firstPortionUnits}
                    onChange={handleUnitsChange}
                    unit="u"
                    placeholder="0"
                    maxLength={4}
                  />
                  <NumberPadField
                    label="First portion"
                    value={firstPortionPercentage}
                    onChange={handlePercentageChange}
                    unit="%"
                    placeholder="0"
                    maxLength={3}
                    decimal={false}
                  />
                </div>
                {remainingUnits && Number(remainingUnits) > 0 && (
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2">
                    <span className="text-xs text-white/45">Remaining planned portion</span>
                    <span className="text-sm font-semibold text-white">{remainingUnits} units</span>
                  </div>
                )}
                <SelectField
                  label="Review the remaining plan after"
                  value={String(reviewAfterMinutes)}
                  onChange={(v) => setReviewAfterMinutes(Number(v))}
                  options={REVIEW_OPTIONS.map((r) => ({ value: String(r.value), label: r.label }))}
                />
                <SelectField
                  label="Insulin type"
                  value={insulinType}
                  onChange={setInsulinType}
                  options={insulinTypeOptions}
                  placeholder="Select insulin type"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmation(true)}
                  disabled={!canReview}
                  className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition disabled:opacity-40"
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