import { motion } from "framer-motion";
import { X, Check, ShieldCheck } from "lucide-react";
import { formatReviewDuration } from "@/lib/splitDoseUtils";

const EDITORIAL = {
  background: "#fdf9f2",
  borderColor: "#eadccf",
  boxShadow: "0 8px 28px rgba(63, 56, 48, 0.12)",
};

export default function SplitPlanConfirm({
  open,
  onClose,
  mealName,
  totalPlannedUnits,
  firstPlannedUnits,
  remainingUnits,
  reviewAfterMinutes,
  onConfirmAndLog,
  onSavePlanOnly,
}) {
  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
      style={{ background: "rgba(63, 56, 48, 0.25)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%", opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: "100%", opacity: 0 }}
        transition={{ type: "spring", stiffness: 380, damping: 32 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-t-3xl border p-5 sm:rounded-3xl"
        style={EDITORIAL}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-white">Split meal plan</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full border text-white/60"
            style={{ background: "#f7f1e8", borderColor: "#eadccf" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2.5 rounded-2xl border p-4" style={{ borderColor: "#eadccf", background: "#f7f1e8" }}>
          <SummaryRow label="Total planned insulin" value={`${totalPlannedUnits} units`} />
          <SummaryRow label="First portion" value={`${firstPlannedUnits} units now`} />
          <SummaryRow label="Planned remaining portion" value={`${remainingUnits} units`} />
          <SummaryRow label="Review time" value={`approximately ${formatReviewDuration(reviewAfterMinutes)} after the meal`} />
        </div>

        <div className="mt-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3" style={{ borderColor: "rgba(175,117,27,0.20)", background: "rgba(175,117,27,0.06)" }}>
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#af751b", opacity: 0.8 }} />
          <p className="text-[11px] leading-relaxed" style={{ color: "#af751b", opacity: 0.7 }}>
            Before administering any follow-up insulin, reassess your current glucose, glucose direction, and active insulin using your established insulin plan.
          </p>
        </div>

        <div className="mt-5 space-y-2.5">
          <button
            type="button"
            onClick={onConfirmAndLog}
            className="flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition"
            style={{ background: "#3f3830", color: "#f7f1e8", boxShadow: "0 4px 16px rgba(63, 56, 48, 0.15)" }}
          >
            <Check className="h-4 w-4" />
            Confirm and log first portion
          </button>
          <button
            type="button"
            onClick={onSavePlanOnly}
            className="w-full rounded-2xl border py-3.5 text-sm font-semibold text-white/80 transition hover:text-white"
            style={{ borderColor: "#eadccf", background: "#f7f1e8" }}
          >
            Save plan without logging insulin
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm font-medium text-white/40 transition hover:text-white/60"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SummaryRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-white/45">{label}</span>
      <span className="text-sm font-semibold text-white">{value}</span>
    </div>
  );
}