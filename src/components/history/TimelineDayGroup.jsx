import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { GLASS_SURFACE } from "@/lib/glassTheme";
import { SPRING, SPRING_GENTLE } from "@/lib/motion";

export default function TimelineDayGroup({
  label,
  count,
  summary,
  isOpen,
  onToggle,
  children,
}) {
  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute left-[7px] top-10 bottom-0 w-px"
        style={{
          background:
            "linear-gradient(to bottom, rgba(255,255,255,0.12), rgba(255,255,255,0.04))",
        }}
      />

      <div className="relative z-10 mb-3 grid grid-cols-[16px_minmax(0,1fr)] items-center gap-3">
        <div
          className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2"
          style={{
            borderColor: "rgba(91,168,138,0.4)",
            background: "hsl(162,12%,9%)",
          }}
        >
          <motion.div
            animate={{ scale: isOpen ? 1 : 0.5 }}
            transition={SPRING}
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: "#5ba88a" }}
          />
        </div>

        <button
          type="button"
          onClick={onToggle}
          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 backdrop-blur-sm transition-colors hover:bg-white/[0.04]"
          style={GLASS_SURFACE}
        >
          <div className="min-w-0 text-left">
            <span className="text-sm font-semibold text-white">{label}</span>
            {summary && (
              <p className="mt-0.5 truncate text-[11px] text-white/45">
                {summary}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="whitespace-nowrap text-xs text-white/40">
              {count} {count === 1 ? "moment" : "moments"}
            </span>

            <motion.div animate={{ rotate: isOpen ? 90 : 0 }} transition={SPRING}>
              <ChevronRight className="h-4 w-4 text-white/50" />
            </motion.div>
          </div>
        </button>
      </div>

      <motion.div
        initial={false}
        animate={{
          height: isOpen ? "auto" : 0,
          opacity: isOpen ? 1 : 0,
        }}
        transition={SPRING_GENTLE}
        className="overflow-hidden"
      >
        <div className="space-y-2 pl-7">{children}</div>
      </motion.div>
    </div>
  );
}