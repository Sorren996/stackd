import { useEffect, useState } from "react";
import { hasDelayedRise, HIGH_PROTEIN_FAT_MONITORING_HOURS } from "@/lib/mealMonitoring";
import { AnimatePresence, motion } from "framer-motion";
import { Clock } from "lucide-react";
import { useMonitoringStatus } from "@/hooks/useMonitoringStatus";

/**
 * Inline caution card anchored beneath the activity graph. Shows when one or
 * more logged meals auto-qualify for delayed-rise monitoring and their active
 * window (about 8 hours after eating) is current. Multiple qualifying meals
 * merge into a single card. Height animates so the chart never jumps.
 *
 * Active status is derived live from the qualifying meals and the current
 * time via useMonitoringStatus — never a sticky persisted flag. The hook
 * schedules its own expiry timeout so the card disappears promptly when the
 * window ends, even if the graph stays open without a data refresh.
 *
 * Copy describes, never prescribes. Sandstone-tinted surface, amber text
 * (#8a5a12, 5.3:1), small leading clock glyph, no border, no red/alarm styling.
 */
export default function DelayedRiseCautionCard({ carbEntries, selectionSource }) {
  const status = useMonitoringStatus(carbEntries);
  const [selectedCount, setSelectedCount] = useState(null);
  useEffect(() => {
    if (!selectionSource) return;
    let lastCount;
    const update = (entry) => {
      const time = entry?.centreTime;
      const count = Number.isFinite(time) ? carbEntries.filter(meal => {
        const start = Date.parse(meal.consumed_at);
        return hasDelayedRise(meal) && time >= start && time < start + HIGH_PROTEIN_FAT_MONITORING_HOURS * 3600000;
      }).length : null;
      if (lastCount !== count) { lastCount = count; setSelectedCount(count); }
    };
    update(selectionSource.getSnapshot());
    return selectionSource.subscribe(update);
  }, [carbEntries, selectionSource]);
  const active = selectedCount === null ? status.isActive : selectedCount > 0;
  const multiple = (selectedCount ?? status.meals.length) > 1;

  return (
    <AnimatePresence initial={false}>
      {active && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden px-3"
          aria-live="polite"
        >
          <div
            className="mt-2 flex items-start gap-2 rounded-2xl p-3"
            style={{
              background: "#fbf2e2",
              boxShadow: "0 2px 12px rgba(63,56,48,0.06)",
            }}
          >
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#8a5a12" }} />
            <p className="text-[11px] leading-relaxed" style={{ color: "#8a5a12" }}>
              {multiple
                ? "Recent meals digest slowly. Fat and protein stretch the window, so glucose may arrive in a gentle, lingering wave (3 to 8 hours after eating)."
                : "This meal digests slowly. Fat and protein stretch the window, so glucose may arrive in a gentle, lingering wave (3 to 8 hours after eating)."}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}