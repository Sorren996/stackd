import { CalendarDays, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { GLASS_SURFACE } from "@/lib/glassTheme";
import { monthStats, trendSummary } from "@/lib/historyAggregations";
import HistoryStat from "./HistoryStat";

export default function HistoryMonthView({ months, onSelectMonth }) {
  if (!months.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CalendarDays className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <h3 className="text-lg font-semibold text-white">Your journey is just beginning</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Your last 90 days of moments will gently gather here as you log them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {months.map((month) => {
        const stats = monthStats(month);
        return (
          <motion.button
            key={month.key}
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelectMonth(month.key)}
            className="flex w-full items-center gap-3 rounded-2xl border px-4 py-4 text-left backdrop-blur-sm transition-colors hover:bg-white/[0.04]"
            style={GLASS_SURFACE}
          >
            <div className="min-w-0 flex-1">
              <span className="text-base font-bold text-white">{month.label} {month.year}</span>
              <p className="mt-0.5 text-[11px] italic text-white/45">{trendSummary(month)}</p>
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