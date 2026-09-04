import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import DaySummary from "./DaySummary";
import DayRecapGraph from "./DayRecapGraph";
import DayInsights from "./DayInsights";
import HistoryTimelineView from "./HistoryTimelineView";
import { computeDayGlucoseMetrics, isManualGlucose, buildTimelineLogs } from "@/lib/dayRecapMetrics";

export default function DayRecap({
  daySummary,
  glucose,
  carbs,
  insulin,
  loading,
  dexcomConnected,
  targetLow,
  targetHigh,
  onEdit,
  onDeleteDose,
  onDeleteGlucose,
  onDeleteCarb,
}) {
  const [timelineOpen, setTimelineOpen] = useState(false);

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

  const timelineLogs = useMemo(
    () => buildTimelineLogs(glucose, carbs, insulin, dexcomConnected),
    [glucose, carbs, insulin, dexcomConnected]
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

  const hasAnyActivity = metrics.hasData || timelineLogs.length > 0;
  const showTimeline = timelineLogs.length > 0;

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

      {/* Collapsible Day Timeline — preserves all existing edit/delete */}
      {showTimeline && (
        <div
          className="overflow-hidden rounded-2xl border"
          style={{
            background: "linear-gradient(145deg, rgba(255,255,255,0.03), rgba(255,255,255,0.008))",
            borderColor: "rgba(255,255,255,0.10)",
          }}
        >
          <button
            type="button"
            onClick={() => setTimelineOpen((v) => !v)}
            className="flex w-full items-center justify-between px-4 py-3.5 text-left transition hover:bg-white/[0.03]"
          >
            <span className="text-sm font-bold text-white">Day Timeline</span>
            <span className="flex items-center gap-2">
              <span className="text-[11px] text-white/40">
                {timelineLogs.length} {timelineLogs.length === 1 ? "moment" : "moments"}
              </span>
              <motion.span
                animate={{ rotate: timelineOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                style={{ transformOrigin: "50% 50%" }}
              >
                <ChevronDown className="h-4 w-4 text-white/45" />
              </motion.span>
            </span>
          </button>
          <AnimatePresence initial={false}>
            {timelineOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <div className="px-3 pb-3 pt-1">
                  <HistoryTimelineView
                    logs={timelineLogs}
                    loading={false}
                    dexcomConnected={dexcomConnected}
                    onEdit={onEdit}
                    onDeleteDose={onDeleteDose}
                    onDeleteGlucose={onDeleteGlucose}
                    onDeleteCarb={onDeleteCarb}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* CGM-only day with no manual moments */}
      {!showTimeline && hasAnyActivity && (
        <p className="px-1 text-[11px] text-white/35">
          Automated readings only — no manual moments to review.
        </p>
      )}

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