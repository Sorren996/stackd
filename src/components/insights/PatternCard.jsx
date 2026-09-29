import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, CalendarDays } from "lucide-react";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { format, parseISO } from "date-fns";

export default function PatternCard({ pattern }) {
  const isHigh = pattern.type === "high";
  const mostRecentDate = pattern.evidenceDates?.[0];
  const accent = isHigh ? "#8a5a12" : "#9c3f2e";

  return (
    <DashboardCard className="p-5">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full"
          style={{ background: isHigh ? "#f3e6d2" : "#f5e2dc", color: accent }}
        >
          {isHigh ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-medium" style={{ color: accent }}>
            {isHigh ? "Times above target" : "Times below target"}
          </span>
          <span className="text-sm font-semibold" style={{ color: "#3f3830" }}>
            mostly {pattern.windowLabel}
          </span>
        </div>
        <span className="shrink-0 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold" style={{ background: "#f0e8db", color: "#3f3830" }}>
          {pattern.count} of {pattern.ofDays} days
        </span>
      </div>

      <p className="mt-3 text-sm leading-relaxed" style={{ color: "#6b6153" }}>
        {isHigh
          ? `Readings trend above your 70–180 target between ${pattern.windowLabel}, on ${pattern.count} of ${pattern.ofDays} days with data.`
          : `Readings trend below your 70–180 target between ${pattern.windowLabel}, on ${pattern.count} of ${pattern.ofDays} days with data.`}
      </p>

      {pattern.evidenceDates?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {pattern.evidenceDates.slice(0, 6).map((d) => (
            <span key={d} className="rounded-md px-2 py-0.5 text-[11px] tabular-nums" style={{ background: "#f7f1e8", color: "#6b6153" }}>
              {format(parseISO(d), "MMM d")}
            </span>
          ))}
          {pattern.evidenceDates.length > 6 && (
            <span className="px-1 text-[11px] tabular-nums" style={{ color: "#746959" }}>
              +{pattern.evidenceDates.length - 6}
            </span>
          )}
        </div>
      )}

      {mostRecentDate && (
        <Link
          to={`/history?day=${mostRecentDate}`}
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