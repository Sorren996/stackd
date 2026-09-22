import { format, parseISO } from "date-fns";
import { ChevronRight } from "lucide-react";

function dayAvg(day) {
  return day.glucose.count ? Math.round(day.glucose.sum / day.glucose.count) : null;
}

function dayTir(day) {
  return day.glucose.count ? Math.round((day.glucose.inRange / day.glucose.count) * 100) : null;
}

export default function HistoryMonthDays({ days, onSelectDay }) {
  if (!days.length) {
    return <p className="py-10 text-center text-sm" style={{ color: "#a89e8d" }}>No moments this month yet.</p>;
  }

  return (
    <div className="space-y-0">
      {days.map((day) => {
        const parsed = parseISO(day.date);
        const avg = dayAvg(day);
        const tir = dayTir(day);
        const hasGlucose = day.glucose.count > 0;
        const carbs = Math.round(day.carbs.total);
        const insulin = Math.round(day.insulin.total);

        const summary = hasGlucose
          ? `${avg} mg/dL · ${tir}% in range`
          : "No glucose data";
        const extras = [
          carbs > 0 && `${carbs}g`,
          insulin > 0 && `${insulin}u`,
        ].filter(Boolean).join(" · ");

        return (
          <button
            key={day.date}
            type="button"
            onClick={() => onSelectDay(day.date)}
            className="flex w-full items-baseline gap-2 py-3 text-left transition hover:opacity-70 active:opacity-50"
          >
            <span className="shrink-0 text-sm font-medium" style={{ color: "#3f3830" }}>
              {format(parsed, "EEE, MMM d")}
            </span>
            <span className="flex-1 overflow-hidden">
              <span className="dotted-leader block" />
            </span>
            <span className="shrink-0 text-xs" style={{ color: "#8a7f70" }}>
              {summary}{extras && ` · ${extras}`}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#a89e8d" }} />
          </button>
        );
      })}
    </div>
  );
}