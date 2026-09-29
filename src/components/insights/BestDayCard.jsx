import { Link } from "react-router-dom";
import { CalendarDays, Sparkles } from "lucide-react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { format, parseISO } from "date-fns";

export default function BestDayCard({ bestDay }) {
  return (
    <DashboardCard className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "#e8e7dd", color: "#4d5742" }}>
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="flex flex-col">
          <span className="text-xs font-medium" style={{ color: "#4d5742" }}>Best day in range</span>
          <span className="text-sm font-semibold" style={{ color: "#3f3830" }}>
            {bestDay ? format(parseISO(bestDay.date), "EEEE, MMMM d") : "Coming into view"}
          </span>
        </div>
        {bestDay && (
          <span className="ml-auto whitespace-nowrap" style={{ color: "#4d5742" }}>
            <span className="text-2xl font-semibold tabular-nums">{bestDay.tirPercent}%</span>
            <span className="ml-1 text-xs font-medium">in target</span>
          </span>
        )}
      </div>

      {bestDay ? (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "#6b6153" }}>
          On {format(parseISO(bestDay.date), "MMMM d")}, your time within the 70–180 target reached {bestDay.tirPercent}% — your highest in this window.
        </p>
      ) : (
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "#6b6153" }}>
          No full days with data yet.
        </p>
      )}

      {bestDay && (
        <Link
          to={`/history?day=${bestDay.date}`}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition active:opacity-60"
          style={{ background: "#f0e8db", color: "#3f3830" }}
        >
          <CalendarDays className="h-3.5 w-3.5" />
          View the days behind this
        </Link>
      )}
    </DashboardCard>
  );
}