import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useEffect, useMemo, useState } from "react";
import { subDays } from "date-fns";
import { motion } from "framer-motion";
import { Activity } from "lucide-react";
import { useDexcomConnection } from "@/hooks/useDexcomConnection";
import { filterReadingsForStats } from "@/lib/timeInRange";
import ZoneOfBalanceRing from "@/components/analytics/ZoneOfBalanceRing";
import DailyPatternChart from "@/components/analytics/DailyPatternChart";
import MomentsOfCare from "@/components/analytics/MomentsOfCare";
import RangeSelector from "@/components/analytics/RangeSelector";

const ANALYTICS_RANGE_KEY = "analytics_range_days";
const DEFAULT_RANGE_DAYS = 30;
// Dexcom Share emits a reading every 5 minutes (288/day). 90 days needs ~26k
// readings; fetch a little extra so the full window is covered.
const ANALYTICS_FETCH_LIMIT = 30000;

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

const SEGMENTS = [
  { label: "Early Morning", period: "12am – 6am", start: 0, end: 6 },
  { label: "Morning", period: "6am – 12pm", start: 6, end: 12 },
  { label: "Afternoon", period: "12pm – 6pm", start: 12, end: 18 },
  { label: "Evening", period: "6pm – 12am", start: 18, end: 24 },
];

const HOUR_LABELS = [
  "12a", "1a", "2a", "3a", "4a", "5a", "6a", "7a", "8a", "9a", "10a", "11a",
  "12p", "1p", "2p", "3p", "4p", "5p", "6p", "7p", "8p", "9p", "10p", "11p",
];

export default function Analytics() {
  const [rangeDays, setRangeDays] = useState(readStoredRange);
  const { data: readings = [], isLoading } = useQuery({
    queryKey: ["glucose-readings", "analytics"],
    queryFn: () => base44.entities.GlucoseReading.list("-recorded_at", ANALYTICS_FETCH_LIMIT),
    staleTime: 5 * 60 * 1000,
  });

  const [targetRange, setTargetRange] = useState(readTargetRange);
  const { connected: dexcomConnected } = useDexcomConnection();

  const handleRangeChange = (days) => {
    setRangeDays(days);
    try {
      window.localStorage.setItem(ANALYTICS_RANGE_KEY, String(days));
    } catch {
      // Storage failure is non-fatal — the in-memory state still drives the view.
    }
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

    const segments = SEGMENTS.map((seg) => {
      const segReadings = recent.filter((r) => {
        const hour = new Date(r.recorded_at).getHours();
        return hour >= seg.start && hour < seg.end;
      });
      const segTotal = segReadings.length;
      const segInRange = segReadings.filter((r) => r.value >= low && r.value <= high).length;
      const segAbove = segReadings.filter((r) => r.value > high).length;
      const segBelow = segReadings.filter((r) => r.value < low).length;
      const segAvg = segTotal ? segReadings.reduce((s, r) => s + r.value, 0) / segTotal : null;
      return {
        ...seg,
        count: segTotal,
        avg: segAvg ? Math.round(segAvg) : null,
        inRangePct: segTotal ? (segInRange / segTotal) * 100 : 0,
        abovePct: segTotal ? (segAbove / segTotal) * 100 : 0,
        belowPct: segTotal ? (segBelow / segTotal) * 100 : 0,
      };
    });

    return {
      total,
      inRangePercent: (inRangeCount / total) * 100,
      abovePercent: (aboveCount / total) * 100,
      belowPercent: (belowCount / total) * 100,
      averageGlucose,
      hourlyAverages,
      segments,
    };
  }, [readings, targetRange, dexcomConnected, rangeDays]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="w-8 h-8 border-4 border-white/10 border-t-teal-400 rounded-full animate-spin" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Activity className="w-10 h-10 text-white/20 mb-3" />
        <h3 className="text-lg font-semibold text-white">Your journey awaits</h3>
        <p className="mt-1 max-w-[240px] text-sm text-white/35">
          Log a few glucose readings to begin revealing your body's gentle patterns.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-6">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-end justify-between gap-3 px-1"
      >
        <div>
          <h1 className="text-2xl font-bold text-white">Your Rhythms</h1>
          <p className="mt-1 text-sm text-white/35">
            Gentle insights from your last {rangeDays} days
          </p>
        </div>
        <RangeSelector value={rangeDays} onChange={handleRangeChange} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
        <ZoneOfBalanceRing
          inRangePercent={stats.inRangePercent}
          abovePercent={stats.abovePercent}
          belowPercent={stats.belowPercent}
          totalReadings={stats.total}
          averageGlucose={stats.averageGlucose}
          targetLow={targetRange.low}
          targetHigh={targetRange.high}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <DailyPatternChart
          hourlyAverages={stats.hourlyAverages}
          targetLow={targetRange.low}
          targetHigh={targetRange.high}
        />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
      >
        <MomentsOfCare segments={stats.segments} />
      </motion.div>
    </div>
  );
}