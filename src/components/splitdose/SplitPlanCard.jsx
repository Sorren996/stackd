import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Split, Clock, ChevronRight } from "lucide-react";
import { getPlanStatus, formatTimeRemaining, STATUS_LABELS } from "@/lib/splitDoseUtils";

const STATUS_COLORS = {
  planned: "#5ba88a",
  review_approaching: "#d4a056",
  review_due: "#d4a056",
  postponed: "#6b92c4",
  draft: "#5ba88a",
  completed: "#5ba88a",
  modified: "#5ba3b8",
  skipped: "#6b92c4",
  expired: "#6b92c4",
  cancelled: "#6b92c4",
};

export default function SplitPlanCard({ plan }) {
  const navigate = useNavigate();
  const status = getPlanStatus(plan);
  const color = STATUS_COLORS[status] || "#5ba88a";
  const label = STATUS_LABELS[status] || "Split plan";

  const timeRemaining = formatTimeRemaining(plan.current_review_at || plan.original_review_at);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/split-plan/${plan.id}`)}
      className="relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border p-4 text-left backdrop-blur-sm"
      style={{
        background: "linear-gradient(145deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01))",
        borderColor: `${color}40`,
        boxShadow: `0 8px 24px rgba(0,0,0,0.12), inset 0 1px 1px rgba(255,255,255,0.12), 0 0 0 1px ${color}15`,
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-4 opacity-50"
        style={{ background: `radial-gradient(circle at 20% 0%, ${color}18, transparent 50%)` }}
      />
      <div
        className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${color}1a`, border: `1px solid ${color}40` }}
      >
        <Split className="h-4 w-4" style={{ color }} />
      </div>
      <div className="relative z-10 min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">
          {plan.meal_name || "High protein/fat meal plan active"}
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <Clock className="h-3 w-3" style={{ color }} />
          <span className="text-xs" style={{ color }}>
            {timeRemaining || label}
          </span>
        </div>
      </div>
      <ChevronRight className="relative z-10 h-4 w-4 shrink-0 text-white/30" />
    </motion.button>
  );
}