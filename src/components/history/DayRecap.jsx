import { useMemo } from "react";
import DaySummary from "./DaySummary";
import DayRecapGraph from "./DayRecapGraph";
import DayInsights from "./DayInsights";
import { computeDayGlucoseMetrics, isManualGlucose } from "@/lib/dayRecapMetrics";

export default function DayRecap({
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

  // CGM data exists only when the user is connected AND the day summary
  // recorded sensor readings. Otherwise any glucose is manual.
  const hasCGM = dexcomConnected && (daySummary?.glucose?.count || 0) > 0;

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
      {/* Day context line — nourishment & support totals */}
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

      {/* Glucose graph — the hero */}
      {metrics.hasData && (
        <DayRecapGraph
          glucose={glucose}
          carbs={carbs}
          insulin={insulin}
          targetLow={targetLow}
          targetHigh={targetHigh}
        />
      )}

      {/* Insights */}
      <DayInsights metrics={metrics} carbs={carbs} />

      {/* Completely empty day */}
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