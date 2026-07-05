import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { GLASS_SURFACE } from "@/lib/glassTheme";
import { SPRING, SPRING_GENTLE } from "@/lib/motion";

export default function TimelineWeekGroup({ label, dayCount, momentCount, summary, isOpen, onToggle, children }) {
  return (
    <div className="relative">
      {/* Week header */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3 backdrop-blur-sm transition-colors hover:bg-white/[0.04]"
        style={GLASS_SURFACE}
      >
        <div className="min-w-0 text-left">
          <span className="text-sm font-bold text-white">{label}</span>
          {summary && <p className="mt-0.5 text-[11px] text-white/45">{summary}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">
            {dayCount} {dayCount === 1 ? "day" : "days"} · {momentCount} {momentCount === 1 ? "moment" : "moments"}
          </span>
          <motion.div animate={{ rotate: isOpen ? 180 : 0 }} transition={SPRING}>
            <ChevronDown className="h-4 w-4 text-white/50" />
          </motion.div>
        </div>
      </button>

      {/* Week contents — day groups */}
      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={SPRING_GENTLE}
        className="overflow-hidden"
      >
        <div className="mt-4 space-y-5 pl-1">{children}</div>
      </motion.div>
    </div>
  );
}