import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useEffect, useMemo, useState } from "react";
import { subDays, format } from "date-fns";
import { motion } from "framer-motion";
import PageHeader from "@/components/editorial/PageHeader";
import AnchorNumber from "@/components/editorial/AnchorNumber";
import HairlineSection from "@/components/editorial/HairlineSection";
import LedgerRow from "@/components/editorial/LedgerRow";
import { Activity } from "lucide-react";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { filterReadingsForStats } from "@/lib/timeInRange";
import DailyPatternChart from "@/components/analytics/DailyPatternChart";
import RangeSelector from "@/components/analytics/RangeSelector";
import { fetchAllGlucoseReadings } from "@/lib/fetchAllGlucose";
import { evaluateSufficiency } from "@/lib/dataSufficiency";

const ANALYTICS_RANGE_KEY = "analytics_range_days";
const DEFAULT_RANGE_DAYS = 30;

const PERIOD_LONG = { 7: "7 days", 14: "14 days", 30: "30 days", 60: "60 days", 90: "90 days", 270: "9 months" };

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

const DAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"];

export default function Analytics() {
  const [rangeDays, setRangeDays] = useState(readStoredRange);
  const { data: graphReadings = [], isLoading: graphLoading } = useQuery({
    queryKey: ["glucose-readings", "graph"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", 5000),
    staleTime: 5 * 60 * 1000,
  });
  const { data: extendedReadings = [], isLoading: extendedLoading } = useQuery({
    queryKey: ["glucose-readings", "analytics"],
    queryFn: () => fetchAllGlucoseReadings(270),
    staleTime: 5 * 60 * 1000,
  });
  const readings = useMemo(() => {
    if (!graphReadings.length) return extendedReadings;
    if (!extendedReadings.length) return graphReadings;
    const seen = new Set(graphReadings.map((r) => r.id));
    return [...graphReadings, ...extendedReadings.filter((r) => !seen.has(r.id))];
  }, [graphReadings, extendedReadings]);
  const isLoading = graphLoading || extendedLoading;

  const [targetRange, setTargetRange] = useState(readTargetRange);
  const { connected: dexcomConnected } = useDexcomConnection();

  const handleRangeChange = (days) => {
    setRangeDays(days);
    try {
      window.localStorage.setItem(ANALYTICS_RANGE_KEY, String(days));
    } catch {}
  };

  useEffect(() => {
    const refresh = () => setTargetRange(readTargetRange());
    window.addEventListener("target-range-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("target-range-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const stats = useMemo(() => {
    const cutoff = subDays(new Date(), rangeDays);
    const recent = filterReadingsForStats(
      readings.filter((r) => new Date(r.recorded_at) >= cutoff && Number.isFinite(r.value)),
      dexcomConnected
    );
    if (!recent.length) return null;

    const { low, high } = targetRange;
    const inRangeCount = recent.filter((r) => r.value >= low && r.value <= high).length;
    const aboveCount = recent.filter((r) => r.value > high).length;
    const belowCount = recent.filter((r) => r.value < low).length;
    const total = recent.length;
    const averageGlucose = recent.reduce((s, r) => s + r.value, 0) / total;

    // Per-day breakdown for bar chart
    const dayBuckets = {};
    recent.forEach((r) => {
      const dayKey = format(new Date(r.recorded_at), "yyyy-MM-dd");
      if (!dayBuckets[dayKey]) dayBuckets[dayKey] = [];
      dayBuckets[dayKey].push(r.value);
    });
    const days = Object.entries(dayBuckets)
      .map(([date, values]) => {
        const inRange = values.filter((v) => v >= low && v <= high).length;
        return {
          date,
          dayLabel: DAY_LABELS[new Date(date).getDay()],
          tir: Math.round((inRange / values.length) * 100),
          count: values.length,
        };
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);

    const bestDay = days.reduce((best, d) => (d.tir > (best?.tir ?? -1) ? d : best), null);
    const hardestDay = days.reduce((worst, d) => (d.tir < (worst?.tir ?? 101) ? d : worst), null);

    // Hourly averages for DailyPatternChart
    const HOUR_LABELS = [
      "12a", "1a", "2a", "3a", "4a", "5a", "6a", "7a", "8a", "9a", "10a", "11a",
      "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "11p",
    ];
    const hourlyBuckets = Array.from({ length: 24 }, () => []);
    recent.forEach((r) => {
      const hour = new Date(r.recorded_at).getHours();
      hourlyBuckets[hour].push(r.value);
    });
    const hourlyAverages = hourlyBuckets.map((values, hour) => ({
      hour: HOUR_LABELS[hour],
      avg: values.length ? Math.round(values.reduce((s, v) => s + v, 0) / values.length) : null,
      count: values.length,
    }));

    return {
      total,
      inRangePercent: (inRangeCount / total) * 100,
      abovePercent: (aboveCount / total) * 100,
      belowPercent: (belowCount / total) * 100,
      averageGlucose,
      days,
      bestDay,
      hardestDay,
      hourlyAverages,
      sufficiency: evaluateSufficiency(recent, rangeDays),
    };
  }, [readings, targetRange, dexcomConnected, rangeDays]);

  const gmi = useMemo(() => {
    if (!stats || !Number.isFinite(stats.averageGlucose)) return null;
    return 3.31 + 0.02392 * stats.averageGlucose;
  }, [stats]);

  const dateRangeText = useMemo(() => {
    const end = new Date();
    const start = subDays(end, rangeDays);
    return `Past ${PERIOD_LONG[rangeDays] || `${rangeDays} days`} · ${format(start, "MMM d")}–${format(end, "MMM d")}`;
  }, [rangeDays]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "#eadccf", borderTopColor: "#4d5742" }} />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Activity className="w-10 h-10 mb-3" style={{ color: "#746959" }} />
        <h3 className="text-lg font-semibold" style={{ color: "#3f3830" }}>Your journey awaits</h3>
        <p className="mt-1 max-w-[240px] text-sm" style={{ color: "#746959" }}>
          Log a few glucose readings to begin revealing your body's gentle patterns.
        </p>
      </div>
    );
  }

  const hasEnough = stats.sufficiency?.hasEnough ?? false;

  return (
    <div className="mx-auto max-w-md space-y-6 pb-24 pt-2">
      {/* Header */}
      <PageHeader italicWord="rhythm" rightText={dateRangeText} />

      {/* Range selector */}
      <div className="flex justify-center px-1">
        <RangeSelector value={rangeDays} onChange={handleRangeChange} />
      </div>

      {/* Anchor: Time in comfort zone */}
      <div className="px-1">
        <AnchorNumber
          value={`${Math.round(stats.inRangePercent)}%`}
          caption={
            <>
              of the past {PERIOD_LONG[rangeDays] || `${rangeDays} days`} spent{" "}
              <span className="font-serif-italic">in your comfort zone</span>
              {hasEnough ? " — steady cadence" : " — still gathering"}
            </>
          }
        />
      </div>

      {/* Daily bar chart */}
      {stats.days.length > 0 && (
        <HairlineSection label="Daily Balance">
          <div className="flex items-end justify-between gap-2 pt-2 pb-3" style={{ height: 120 }}>
            {stats.days.map((d, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium tabular-nums" style={{ color: "#8a7f70" }}>
                  {d.tir}
                </span>
                <div
                  className="w-full rounded-t-sm"
                  style={{
                    height: `${Math.max(d.tir, 4)}%`,
                    background: d.tir >= 70 ? "#4d5742" : d.tir >= 50 ? "#af751b" : "#c97060",
                    opacity: 0.85,
                    minHeight: 4,
                  }}
                />
                <span className="text-[10px] font-medium" style={{ color: "#746959" }}>
                  {d.dayLabel}
                </span>
              </div>
            ))}
          </div>
          {(stats.bestDay || stats.hardestDay) && (
            <div className="flex justify-between pt-2 text-xs" style={{ color: "#8a7f70" }}>
              {stats.bestDay && (
                <span>
                  Best day{" "}
                  <span className="font-semibold" style={{ color: "#3f3830" }}>
                    {format(new Date(stats.bestDay.date), "EEEE")} · {stats.bestDay.tir}%
                  </span>
                </span>
              )}
              {stats.hardestDay && (
                <span>
                  Hardest{" "}
                  <span className="font-semibold" style={{ color: "#3f3830" }}>
                    {format(new Date(stats.hardestDay.date), "EEEE")} · {stats.hardestDay.tir}%
                  </span>
                </span>
              )}
            </div>
          )}
        </HairlineSection>
      )}

      {/* At a glance metrics */}
      <HairlineSection label="At a Glance">
        <LedgerRow label="Average glucose" value={`${Math.round(stats.averageGlucose)} mg/dL`} />
        {gmi !== null && <LedgerRow label="GMI" value={`${gmi.toFixed(1)}%`} />}
        <LedgerRow label="Time above range" value={`${stats.abovePercent.toFixed(0)}%`} />
        <LedgerRow label="Time below range" value={`${stats.belowPercent.toFixed(0)}%`} />
        <LedgerRow label="Readings" value={String(stats.total)} />
      </HairlineSection>

      {/* Daily pattern chart (existing component) */}
      <DailyPatternChart
        hourlyAverages={stats.hourlyAverages || []}
        targetLow={targetRange.low}
        targetHigh={targetRange.high}
        hasEnough={hasEnough}
      />

      <p className="px-1 pt-2 text-xs" style={{ color: "#746959" }}>
        Patterns describe the last {PERIOD_LONG[rangeDays] || `${rangeDays} days`} —{" "}
        <span className="font-serif-italic">the rhythm is yours to read.</span>
      </p>
    </div>
  );
}