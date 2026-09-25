import { format, addDays, parseISO } from "date-fns";
import SectionCard from "@/components/editorial/SectionCard";
import DaySparkline from "./DaySparkline";
import { groupDaysByWeek, weekStats } from "@/lib/historyAggregations";

function dayAvg(day) {
  return day.glucose?.count ? Math.round(day.glucose.sum / day.glucose.count) : null;
}
function dayTir(day) {
  return day.glucose?.count ? Math.round((day.glucose.inRange / day.glucose.count) * 100) : null;
}

/**
 * HistoryWeekList — groups a month's days into ISO weeks (Monday-start).
 * Each week is a sandstone SectionCard with a header (date range + avg/TIR)
 * and redesigned day rows: one hero stat (TIR% or avg) in bold, carbs/insulin
 * as smaller muted secondary text, an inline glucose sparkline, and a subtle
 * left edge stripe only on out-of-range days.
 */
export default function HistoryWeekList({ days, readingsByDay = {}, targetLow, targetHigh, onSelectDay }) {
  if (!days.length) {
    return (
      <SectionCard>
        <p className="py-8 text-center text-sm" style={{ color: "#746959" }}>No moments this month yet.</p>
      </SectionCard>
    );
  }

  const weeks = groupDaysByWeek(days);

  return (
    <div className="space-y-4">
      {weeks.map((week) => {
        const stats = weekStats(week);
        const weekEnd = addDays(week.weekStart, 6);
        const headerLabel = `${format(week.weekStart, "MMM d")} – ${format(weekEnd, "MMM d")}`;

        return (
          <SectionCard key={week.key} label={headerLabel}>
            <div className="flex items-baseline justify-between pb-2">
              <span className="text-[11px] font-medium" style={{ color: "#746959" }}>
                {stats.glucoseAvg != null ? `${stats.glucoseAvg} mg/dL avg` : "Still gathering"}
              </span>
              <span className="flex items-baseline gap-1">
                <span className="text-base font-bold tabular-nums" style={{ color: stats.inRangePct != null ? "#3f3830" : "#b8aea0" }}>
                  {stats.inRangePct != null ? `${stats.inRangePct}%` : "—"}
                </span>
                <span className="text-[10px] font-medium" style={{ color: "#746959" }}>in range</span>
              </span>
            </div>

            <div className="divide-y divide-[#eadccf]">
              {week.days.map((day) => {
                const parsed = parseISO(day.date);
                const tir = dayTir(day);
                const avg = dayAvg(day);
                const carbs = Math.round(day.carbs?.total || 0);
                const insulin = Math.round(day.insulin?.total || 0);
                const readings = readingsByDay[day.date] || [];

                const hero = tir != null ? `${tir}%` : avg != null ? `${avg}` : "—";
                const secondary = [
                  tir != null && avg != null && `${avg} avg`,
                  carbs > 0 && `${carbs}g`,
                  insulin > 0 && `${insulin}u`,
                ].filter(Boolean).join(", ");

                const outOfRange = tir != null && tir < 50;
                const stripeColor = outOfRange ? "#d58814ff" : null;

                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => onSelectDay(day.date)}
                    className="flex w-full items-center gap-3 py-3 text-left transition hover:opacity-70 active:opacity-50"
                  >
                    {stripeColor && (
                      <span className="w-[3px] self-stretch shrink-0 rounded-full" style={{ background: stripeColor, opacity: 0.5 }} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" style={{ color: "#3f3830" }}>{format(parsed, "EEE, MMM d")}</p>
                      {secondary && <p className="mt-0.5 truncate text-[11px]" style={{ color: "#746959" }}>{secondary}</p>}
                    </div>
                    <span className="shrink-0 text-base font-bold tabular-nums" style={{ color: "#3f3830" }}>{hero}</span>
                    <DaySparkline readings={readings} targetLow={targetLow} targetHigh={targetHigh} />
                  </button>
                );
              })}
            </div>
          </SectionCard>
        );
      })}
    </div>
  );
}