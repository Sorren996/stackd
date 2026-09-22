import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Split, Clock, ChevronRight } from "lucide-react";
import { getPlanStatus, formatTimeRemaining, STATUS_LABELS } from "@/lib/splitDoseUtils";

const STATUS_COLORS = {
  planned: "#5b6550",
  review_approaching: "#af751b",
  review_due: "#af751b",
  postponed: "#8a7f70",
  draft: "#5b6550",
  completed: "#5b6550",
  modified: "#5b6550",
  skipped: "#8a7f70",
  expired: "#8a7f70",
  cancelled: "#8a7f70"
};

export default function SplitPlanCard({ plan }) {
  const navigate = useNavigate();
  const status = getPlanStatus(plan);
  const color = STATUS_COLORS[status] || "#5b6550";
  const label = STATUS_LABELS[status] || "Split plan";

  const timeRemaining = formatTimeRemaining(plan.current_review_at || plan.original_review_at);

  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.98 }}
      onClick={() => navigate(`/split-plan/${plan.id}`)}
      className="relative flex w-full items-center gap-3 overflow-hidden mt-4 rounded-2xl border p-4 text-left mb-4"
      style={{
        background: "#fdf9f2",
        borderColor: `${color}40`,
        boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)"
      }}>
      
      <div
        className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${color}1a`, border: `1px solid ${color}40` }}>
        
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
    </motion.button>);

}