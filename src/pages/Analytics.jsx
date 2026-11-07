import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import RangeSelector from "@/components/analytics/RangeSelector";
import InsightSection from "@/components/insights/InsightSection";
import ComfortZoneSummary from "@/components/insights/ComfortZoneSummary";
import DayByDayBars from "@/components/insights/DayByDayBars";
import TimeOfDayLine from "@/components/insights/TimeOfDayLine";
import MoreNumbers from "@/components/insights/MoreNumbers";
import DashboardCard from "@/components/dashboard/DashboardCard";
import { filterReadingsForStats } from "@/lib/timeInRange";
import { fetchAllGlucoseReadings } from "@/lib/fetchAllGlucose";
import { evaluateSufficiency } from "@/lib/dataSufficiency";
import {
  buildDaySeries,
  dayCoverage,
  hourlyAverages,
  periodWindow,
  readingsInWindow,
} from "@/lib/insightsPeriod";

const ANALYTICS_RANGE_KEY = "analytics_range_days";
const DEFAULT_RANGE_DAYS = 30;
const PERIOD_LONG = { 7: "7 days", 14: "14 days", 30: "30 days", 60: "60 days", 90: "90 days" };

function readStoredRange() {
  if (typeof window === "undefined") return DEFAULT_RANGE_DAYS;
  const stored = Number(window.localStorage.getItem(ANALYTICS_RANGE_KEY));
  return [7, 14, 30, 60, 90].includes(stored) ? stored : DEFAULT_RANGE_DAYS;
}

function readTargetRange() {
  if (typeof window === "undefined") return { low: 70, high: 180 };
  const low = Number(window.localStorage.getItem("target_range_low") || 70);
  const high = Number(window.localStorage.getItem("target_range_high") || 180);
  return {
    low: Number.isFinite(low) ? low : 70,
    high: Number.isFinite(high) ? high : 180,
  };
}

/**
 * Insights — a calm read of the selected period: the comfort-zone share, one
 * bar per day, the time-of-day averages, and a single disclosure of the extra
 * numbers. Every figure comes from the app's existing reading calculations and
 * the same stored readings the rest of the app uses.
 */
export default function Analytics() {
  const [rangeDays, setRangeDays] = useState(readStoredRange);
  const [targetRange, setTargetRange] = useState(readTargetRange);

  const { data: graphReadings = [], isLoading: graphLoading, isError: graphError, refetch: refetchGraph } = useQuery({
    queryKey: ["glucose-readings", "graph"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 5000),
    staleTime: 5 * 60 * 1000,
  });
  const { data: extendedReadings = [], isLoading: extendedLoading, isError: extendedError, refetch: refetchExtended } = useQuery({
    queryKey: ["glucose-readings", "analytics"],
    queryFn: () => fetchAllGlucoseReadings(270),
    staleTime: 5 * 60 * 1000,
  });

  const readings = useMemo(() => {
    if (!graphReadings.length) return extendedReadings;
    if (!extendedReadings.length) return graphReadings;
    const seen = new Set(graphReadings.map((record) => record.id));
    return [...graphReadings, ...extendedReadings.filter((record) => !seen.has(record.id))];
  }, [graphReadings, extendedReadings]);

  const isLoading = graphLoading || extendedLoading;
  // A single failed source is fine while the other still holds readings.
  const isError = graphError && extendedError;

  useEffect(() => {
    const refresh = () => setTargetRange(readTargetRange());
    window.addEventListener("target-range-updated", refresh);
    window.addEventListener("glucose-units-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("target-range-updated", refresh);
      window.removeEventListener("glucose-units-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const handleRangeChange = (days) => {
    setRangeDays(days);
    try {
      window.localStorage.setItem(ANALYTICS_RANGE_KEY, String(days));
    } catch {
      // Private mode — the in-memory period still applies.
    }
  };

  const stats = useMemo(() => {
    const now = new Date();
    const { start, end } = periodWindow(rangeDays, now);
    const recent = readingsInWindow(filterReadingsForStats(readings), start, end);
    const series = buildDaySeries(recent, targetRange.low, targetRange.high, rangeDays, now);
    const coverage = dayCoverage(series);
    const sufficiency = evaluateSufficiency(recent, rangeDays);
    const rangeText = `${format(start, "MMM d")} \u2013 ${format(end, "MMM d")}`;
    const total = recent.length;

    if (!total) {
      return { total: 0, series, hourly: hourlyAverages([]), coverage, sufficiency, rangeText };
    }

    const { low, high } = targetRange;
    let inRange = 0;
    let above = 0;
    let below = 0;
    let sum = 0;
    for (const record of recent) {
      const value = Number(record.value);
      sum += value;
      if (value < low) below += 1;
      else if (value > high) above += 1;
      else inRange += 1;
    }

    return {
      total,
      inRangePercent: (inRange / total) * 100,
      belowPercent: (below / total) * 100,
      abovePercent: (above / total) * 100,
      averageGlucose: sum / total,
      series,
      hourly: hourlyAverages(recent),
      coverage,
      sufficiency,
      rangeText,
    };
  }, [readings, targetRange, rangeDays]);

  // Existing GMI formula, unchanged — only shown when the period carries enough
  // readings to support an estimate.
  const gmi = useMemo(() => {
    if (!Number.isFinite(stats.averageGlucose)) return null;
    return 3.31 + 0.02392 * stats.averageGlucose;
  }, [stats.averageGlucose]);

  const hasEnough = stats.sufficiency?.hasEnough ?? false;

  const header = (
    <header className="px-1 pb-3">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "#f7f1e8" }}>
          Insights
        </h1>
        <span className="shrink-0 text-[11px] font-medium tabular-nums" style={{ color: "#dde5e8" }}>
          {stats.rangeText}
        </span>
      </div>
      <p className="mt-1 text-[12px]" style={{ color: "#dde5e8" }}>
        A look across your days.
      </p>
    </header>
  );

  if (isError && !readings.length) {
    return (
      <div className="mx-auto w-full max-w-md pb-10 pt-2">
        {header}
        <DashboardCard className="p-[18px]">
          <p className="text-[13px] font-semibold" style={{ color: "#3f3830" }}>
            We couldn&rsquo;t load your readings just now
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "#6b6153" }}>
            Nothing has changed on your account. Try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => {
              refetchGraph();
              refetchExtended();
            }}
            className="mt-3 min-h-[40px] rounded-full px-4 text-[12px] font-semibold"
            style={{ background: "#3f3830", color: "#fdf9f2" }}
          >
            Try again
          </button>
        </DashboardCard>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full min-w-0 max-w-md pb-10 pt-2">
      {header}

      <div className="px-1 pb-2">
        <RangeSelector value={rangeDays} onChange={handleRangeChange} />
      </div>

      {isLoading && !readings.length ? (
        <div aria-busy="true" aria-live="polite">
          <span className="sr-only">Loading your insights</span>
          {[0, 1, 2].map((key) => (
            <DashboardCard key={key} className="p-[18px]">
              <div className="h-2.5 w-24 rounded-full" style={{ background: "#efe5d8" }} />
              <div className="mt-3 h-8 w-28 rounded-lg" style={{ background: "#efe5d8" }} />
              <div className="mt-3 h-2.5 w-full rounded-full" style={{ background: "#f4ece1" }} />
              <div className="mt-2 h-2.5 w-2/3 rounded-full" style={{ background: "#f4ece1" }} />
            </DashboardCard>
          ))}
        </div>
      ) : !stats.total ? (
        <InsightSection label="No readings in this period">
          <p className="text-[13px] font-semibold" style={{ color: "#3f3830" }}>
            No readings in this period yet
          </p>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "#6b6153" }}>
            Log a glucose reading, or choose a longer period above, and your comfort zone, days and time of day
            will appear here.
          </p>
        </InsightSection>
      ) : (
        <>
          <InsightSection label="In your comfort zone">
            <ComfortZoneSummary
              percent={stats.inRangePercent}
              belowPercent={stats.belowPercent}
              abovePercent={stats.abovePercent}
              periodLabel={PERIOD_LONG[rangeDays] || `${rangeDays} days`}
              targetLow={targetRange.low}
              targetHigh={targetRange.high}
              coverage={stats.coverage}
            />
          </InsightSection>

          <InsightSection title="Day by day" helper="Time in your comfort zone each day">
            <DayByDayBars series={stats.series} />
          </InsightSection>

          <InsightSection title="Glucose by time of day" helper="Average readings at each time">
            <TimeOfDayLine
              averages={stats.hourly}
              targetLow={targetRange.low}
              targetHigh={targetRange.high}
              hasEnough={hasEnough}
            />
          </InsightSection>

          <MoreNumbers
            averageGlucose={stats.averageGlucose}
            gmi={gmi}
            hasEnough={hasEnough}
          />
        </>
      )}
    </div>
  );
}