import { format } from "date-fns";
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { GLASS_SURFACE } from "@/lib/glassTheme";
import { weekStats } from "@/lib/historyAggregations";
import HistoryStat from "./HistoryStat";

export default function HistoryWeekView({ weeks, onSelectWeek }) {
  if (!weeks.length) {
    return (
      <p className="py-10 text-center text-sm text-white/40">No moments in this month yet.</p>
    );
  }

  return (
    <div className="space-y-3">
      {weeks.map((week) => {
        const stats = weekStats(week);
        return (
          <motion.button
            key={week.key}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectWeek(week.key)}
            className="flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left backdrop-blur-sm transition-colors hover:bg-white/[0.04]"
            style={GLASS_SURFACE}
          >
            <div className="min-w-0 flex-1">
              <span className="text-sm font-bold text-white">Week of {format(week.weekStart, "MMM d")}</span>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <HistoryStat label="Avg glucose" value={stats.glucoseAvg ?? "—"} unit="mg/dL" />
                <HistoryStat label="Readings" value={stats.glucoseCount} />
                <HistoryStat label="Nourishment" value={stats.carbTotal} unit="g" />
                <HistoryStat label="Support" value={stats.insulinTotal} unit="u" />
              </div>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-white/40" />
          </motion.button>
        );
      })}
    </div>
  );
}