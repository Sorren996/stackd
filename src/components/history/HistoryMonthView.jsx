import { CalendarDays, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { GLASS_SURFACE } from "@/lib/glassTheme";
import { monthStats } from "@/lib/historyAggregations";
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
        const glucoseDays = month.days.filter((d) => d.glucose.count > 0).length;
        const trackedDays = month.days.filter(
          (d) => d.glucose.count > 0 || d.carbs.count > 0 || d.insulin.count > 0
        ).length;

        const subline = stats.glucoseCount
          ? `${glucoseDays} day${glucoseDays === 1 ? "" : "s"} · ${stats.inRangePct}% in range`
          : trackedDays
            ? `${trackedDays} day${trackedDays === 1 ? "" : "s"} tracked`
            : "No moments yet";

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
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-bold text-white">{month.label} {month.year}</span>
                <span className="shrink-0 text-[11px] font-medium text-white/45">{subline}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                <HistoryStat label="Avg glucose" value={stats.glucoseAvg ?? "—"} unit="mg/dL" />
                <HistoryStat label="Time in range" value={stats.inRangePct ?? "—"} unit="%" />
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