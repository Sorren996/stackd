import { CalendarDays, ChevronRight } from "lucide-react";
import { monthStats } from "@/lib/historyAggregations";

export default function HistoryMonthView({ months, onSelectMonth }) {
  if (!months.length) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <CalendarDays className="w-10 h-10 mb-3" style={{ color: "#a89e8d" }} />
        <h3 className="text-lg font-semibold" style={{ color: "#3f3830" }}>Your journey is just beginning</h3>
        <p className="text-sm mt-1 max-w-xs" style={{ color: "#a89e8d" }}>
          Your last 90 days of moments will gently gather here as you log them.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-0">
      {months.map((month) => {
        const stats = monthStats(month);
        const glucoseDays = month.days.filter((d) => d.glucose.count > 0).length;
        const trackedDays = month.days.filter(
          (d) => d.glucose.count > 0 || d.carbs.count > 0 || d.insulin.count > 0
        ).length;

        const subline = stats.glucoseCount
          ? `${glucoseDays}d, ${stats.inRangePct}% in range`
          : trackedDays
            ? `${trackedDays}d tracked`
            : "No moments yet";

        return (
          <button
            key={month.key}
            type="button"
            onClick={() => onSelectMonth(month.key)}
            className="flex w-full items-baseline gap-2 py-3 text-left transition hover:opacity-70 active:opacity-50"
          >
            <span className="shrink-0 text-sm font-semibold" style={{ color: "#3f3830" }}>
              {month.label} {month.year}
            </span>
            <span className="flex-1 overflow-hidden">
              <span className="dotted-leader block" />
            </span>
            <span className="shrink-0 text-xs" style={{ color: "#8a7f70" }}>
              {subline}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#a89e8d" }} />
          </button>
        );
      })}
    </div>
  );
}