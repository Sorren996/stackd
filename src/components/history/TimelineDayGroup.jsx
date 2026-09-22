import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { GLASS_FLOATING } from "@/lib/glassTheme";
import { SPRING, SPRING_GENTLE } from "@/lib/motion";

export default function TimelineDayGroup({ label, count, summary, isOpen, onToggle, children }) {
  return (
    <div className="relative">
      {/* Vertical timeline connector */}
      <div
        className="pointer-events-none absolute left-[7px] top-10 bottom-0 w-px"
        style={{ background: "linear-gradient(to bottom, #d8cec2, #eadccf)" }}
      />

      {/* Day waypoint */}
      <div className="relative z-10 mb-3 flex items-center gap-3">
        {/* Waypoint dot */}
        <div
          className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
          style={{ borderColor: "rgba(91,101,80,0.4)", background: "#fdf9f2" }}
        >
          <motion.div
            animate={{ scale: isOpen ? 1 : 0.5 }}
            transition={SPRING}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "#5b6550" }}
          />
        </div>

        {/* Day label + summary in glass card */}
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 transition-colors hover:bg-white/[0.04]"
          style={GLASS_FLOATING}
        >
          <div className="min-w-0 text-left">
            <span className="text-sm font-semibold text-white">{label}</span>
            {summary && <p className="mt-0.5 text-[11px] text-white/45">{summary}</p>}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">{count} {count === 1 ? "moment" : "moments"}</span>
            <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={SPRING}>
              <ChevronRight className="h-4 w-4 text-white/50" />
            </motion.div>
          </div>
        </button>
      </div>

      {/* Timeline entries */}
      <motion.div
        initial={false}
        animate={{ height: isOpen ? "auto" : 0, opacity: isOpen ? 1 : 0 }}
        transition={SPRING_GENTLE}
        className="overflow-hidden"
      >
        <div className="space-y-2 pl-7">{children}</div>
      </motion.div>
    </div>
  );
}