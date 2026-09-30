import { useMemo, useState, useEffect } from "react";
import {
  getHighProteinFatMonitoringStatus,
  getDelayedRiseCautionStatus,
  HIGH_PROTEIN_FAT_MONITORING_HOURS,
} from "@/lib/mealMonitoring";

const MONITORING_MS = HIGH_PROTEIN_FAT_MONITORING_HOURS * 60 * 60 * 1000;
// Safety-net tick: guarantees time advances while the consumer stays mounted,
// even when no window end is pending (keeps countdowns fresh, never longer).
const SAFETY_TICK_MS = 60 * 1000;

/**
 * Derives the high-protein/fat monitoring status from the actual qualifying
 * meals and the current time. Active status is NEVER persisted — it is
 * recomputed from carbEntries + a fresh `now` on every tick.
 *
 * The hook schedules a timeout to fire just past the nearest active window
 * end, so the alert expires promptly without waiting for a data refresh.
 * A 60s safety-net tick ensures time always advances while the consumer is
 * mounted.
 *
 * Fallback rules (never stuck active):
 *  - Missing/invalid consumed_at → entry excluded (no invented detection)
 *  - No qualifying meals → inactive immediately
 *  - Window end in the future → timeout fires at window end to expire
 *  - Window end in the past → already expired, 60s safety net only
 *  - Unknown/unavailable → inactive (never stuck active)
 *
 * @returns {{ isActive, endTime, remainingMs, qualifyingCount, meals }}
 */
export function useMonitoringStatus(carbEntries) {
  const [now, setNow] = useState(() => Date.now());

  // Schedule the next `now` refresh. Re-runs when entries change or when
  // `now` advances (self-scheduling timeout, not an interval).
  useEffect(() => {
    const entries = Array.isArray(carbEntries) ? carbEntries : [];
    const nowMs = Date.now();

    // Nearest future window end across all qualifying meals.
    let nearestEnd = Infinity;
    for (const entry of entries) {
      if (!entry || !entry.consumed_at) continue;
      const t = new Date(entry.consumed_at).getTime();
      if (!Number.isFinite(t)) continue;
      const end = t + MONITORING_MS;
      if (end > nowMs && end < nearestEnd) nearestEnd = end;
    }

    let delay;
    if (Number.isFinite(nearestEnd)) {
      // Fire just past the window end to flip the alert off, but cap at the
      // safety-net interval so countdowns stay reasonably fresh while active.
      delay = Math.min(nearestEnd - nowMs + 250, SAFETY_TICK_MS);
      delay = Math.max(delay, 1000); // never less than 1s
    } else {
      delay = SAFETY_TICK_MS;
    }

    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [carbEntries, now]);

  const status = useMemo(
    () => getHighProteinFatMonitoringStatus(carbEntries, now),
    [carbEntries, now]
  );

  const caution = useMemo(
    () => getDelayedRiseCautionStatus(carbEntries, now),
    [carbEntries, now]
  );

  // Stable merged object — only changes when status or caution change.
  return useMemo(
    () => ({
      isActive: status.isActive,
      endTime: status.endTime,
      remainingMs: status.remainingMs,
      qualifyingCount: status.qualifyingCount,
      meals: caution.meals,
    }),
    [status, caution]
  );
}