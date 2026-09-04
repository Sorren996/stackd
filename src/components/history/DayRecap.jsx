import { useMemo } from "react";
import DaySummary from "./DaySummary";
import DayRecapGraph from "./DayRecapGraph";
import EnhancedDayInsights from "./EnhancedDayInsights";
import DayMealOutcomes from "./DayMealOutcomes";
import DayInsulinActivity from "./DayInsulinActivity";
import DayRecovery from "./DayRecovery";
import DayComparison from "./DayComparison";
import DayTimeline from "./DayTimeline";
import { computeDayGlucoseMetrics, isManualGlucose } from "@/lib/dayRecapMetrics";
import {
  computeMealOutcomes,
  computeInsulinActivity,
  computeRecovery,
  computeComparison,
  buildDayTimeline,
  computeEnhancedInsights,
} from "@/lib/dayRecapAnalytics";

const HOUR_MS = 60 * 60 * 1000;

export default function DayRecap({
  allDays,
  daySummary,
  glucose,
  carbs,
  insulin,
  loading,
  dexcomConnected,
  targetLow,
  targetHigh,
}) {
  const metrics = useMemo(
    () => computeDayGlucoseMetrics(glucose, targetLow, targetHigh),
    [glucose, targetLow, targetHigh]
  );

  const manualCount = useMemo(
    () => (glucose || []).filter((g) => isManualGlucose(g)).length,
    [glucose]
  );

  const hasCGM = dexcomConnected && (daySummary?.glucose?.count || 0) > 0;

  const mealOutcomes = useMemo(
    () => computeMealOutcomes(carbs, insulin, glucose),
    [carbs, insulin, glucose]
  );

  const dayDate = daySummary?.date;
  const dayStart = dayDate ? new Date(dayDate + "T00:00:00").getTime() : Date.now() - 24 * HOUR_MS;
  const dayEnd = dayStart + 24 * HOUR_MS;

  const insulinActivity = useMemo(
    () => computeInsulinActivity(insulin, dayStart, dayEnd),
    [insulin, dayStart, dayEnd]
  );

  const recovery = useMemo(
    () => computeRecovery(glucose),
    [glucose]
  );

  const comparison = useMemo(
    () => computeComparison(daySummary, allDays, dayDate),
    [daySummary, allDays, dayDate]
  );

  const timeline = useMemo(
    () => buildDayTimeline(glucose, carbs, insulin, metrics, recovery, targetLow, targetHigh),
    [glucose, carbs, insulin, metrics, recovery, targetLow, targetHigh]
  );

  const insights = useMemo(
    () => computeEnhancedInsights(metrics, carbs, insulin, glucose, targetLow, targetHigh),
    [metrics, carbs, insulin, glucose, targetLow, targetHigh]
  );

  const carbTotal = (carbs || []).reduce((s, c) => s + (Number(c.carbs) || 0), 0);
  const insulinTotal = (insulin || []).reduce((s, d) => s + (Number(d.units) || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const hasAnyActivity = metrics.hasData || carbTotal > 0 || insulinTotal > 0;

  return (
    <div className="space-y-5">
      {/* Day context line */}
      {(carbTotal > 0 || insulinTotal > 0) && (
        <p className="px-1 text-xs font-medium text-white/45">
          {carbTotal > 0 && <>{Math.round(carbTotal)}g nourishment</>}
          {carbTotal > 0 && insulinTotal > 0 && <span className="mx-1.5 text-white/20">·</span>}
          {insulinTotal > 0 && <>{Math.round(insulinTotal * 10) / 10}u support</>}
        </p>
      )}

      {/* Day summary */}
      <DaySummary
        metrics={metrics}
        daySummary={daySummary}
        manualCount={manualCount}
        hasCGM={hasCGM}
        targetLow={targetLow}
        targetHigh={targetHigh}
      />

      {/* Glucose graph — the centerpiece */}
      {metrics.hasData && (
        <DayRecapGraph
          glucose={glucose}
          carbs={carbs}
          insulin={insulin}
          targetLow={targetLow}
          targetHigh={targetHigh}
        />
      )}

      {/* What stood out */}
      {insights.length > 0 && <EnhancedDayInsights insights={insights} />}

      {/* Meal outcomes */}
      {mealOutcomes.length > 0 && <DayMealOutcomes meals={mealOutcomes} />}

      {/* Insulin activity */}
      {insulinActivity && <DayInsulinActivity activity={insulinActivity} />}

      {/* Recovery */}
      {recovery && <DayRecovery recovery={recovery} />}

      {/* Compared with usual */}
      {comparison && <DayComparison comparison={comparison} />}

      {/* Day timeline */}
      {timeline.length > 0 && <DayTimeline events={timeline} />}

      {/* Empty state */}
      {!hasAnyActivity && (
        <div
          className="rounded-2xl border px-4 py-8 text-center"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))",
            borderColor: "rgba(255,255,255,0.10)",
          }}
        >
          <p className="text-sm font-medium text-white/55">Nothing logged yet</p>
        </div>
      )}
    </div>
  );
}