// Stackd Insight — Latest Projection Hook (Milestone 5 + continuous learning)
//
// Fetches the latest stored GlucoseProjection for the current user and
// triggers a background generation when:
//   - a new glucose reading arrives (re-anchors the cone to actual current
//     glucose instead of drifting from a stale starting point),
//   - a new meal or insulin log arrives (refreshes the active projection
//     inputs so the trajectory reflects the latest logged support),
//   - or the stored projection is stale / missing.
//
// All generation goes through the existing generateProjection backend
// function (Milestone 1-4 insight engine, model arbitration, provenance) —
// never a parallel path. The backend always reads current state and
// re-anchors to the latest reading, so repeated calls are idempotent.
// Generation is throttled (min 30s apart) so a burst of readings/logs
// coalesces into one generation, and a refetch is kicked shortly after so
// the UI picks up the fresh cone promptly.
//
// SAFETY: Only returns non-abstained projections with a trajectory.
// Abstained projections (insufficient evidence) return null so the UI
// shows nothing rather than a misleading empty forecast.

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useEffect, useRef } from "react";

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const REFETCH_INTERVAL_MS = 60 * 1000; // 1 minute
const GENERATION_THROTTLE_MS = 30 * 1000; // min 30s between background generations
const POST_GENERATION_REFETCH_MS = 2000; // refetch shortly after kicking off generation

export function useLatestProjection({ latestReadingTime, latestMealTime, latestDoseTime } = {}) {
  const latestQuery = useQuery({
    queryKey: ["latest-projection"],
    queryFn: () => base44.entities.GlucoseProjection.list("-generated_at", 1),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 30 * 1000,
  });

  const projection = latestQuery.data?.[0] || null;
  const lastGenRef = useRef(0);
  const lastSignalRef = useRef("");

  // ── Continuous-learning signal ──
  // Changes when a new glucose reading, meal, or insulin log arrives. Each
  // new reading re-anchors the cone; each new meal/insulin log refreshes the
  // active inputs. The backend reads current state and produces a fresh
  // projection, so this is the same insight-engine pipeline — just triggered
  // promptly on new data instead of only on the periodic evaluator cadence.
  const signal = `${latestReadingTime ?? ""}|${latestMealTime ?? ""}|${latestDoseTime ?? ""}`;

  useEffect(() => {
    const now = Date.now();
    const signalChanged = signal !== lastSignalRef.current;
    if (!signalChanged) return;

    lastSignalRef.current = signal;

    // Throttle: coalesce a burst of readings/logs into one generation.
    if (now - lastGenRef.current < GENERATION_THROTTLE_MS) return;

    lastGenRef.current = now;
    base44.functions.invoke("generateProjection", {}).catch(() => {});

    // Refetch shortly after so the UI picks up the fresh cone promptly,
    // rather than waiting for the next 60s refetch cycle.
    const t = setTimeout(() => {
      latestQuery.refetch().catch(() => {});
    }, POST_GENERATION_REFETCH_MS);
    return () => clearTimeout(t);
  }, [signal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stale fallback: when no signal changes (e.g. no CGM connected and no
  // manual logs), still regenerate when the stored projection is older than
  // 10 minutes or missing entirely.
  useEffect(() => {
    if (!projection) {
      if (Date.now() - lastGenRef.current > STALE_THRESHOLD_MS) {
        lastGenRef.current = Date.now();
        base44.functions.invoke("generateProjection", {}).catch(() => {});
      }
      return;
    }
    const age = Date.now() - new Date(projection.generated_at).getTime();
    if (age > STALE_THRESHOLD_MS && Date.now() - lastGenRef.current > STALE_THRESHOLD_MS) {
      lastGenRef.current = Date.now();
      base44.functions.invoke("generateProjection", {}).catch(() => {});
    }
  }, [projection?.generated_at]);

  // Only return usable projections — abstained or empty ones show nothing.
  if (projection && !projection.abstained && Array.isArray(projection.trajectory) && projection.trajectory.length > 0) {
    return projection;
  }
  return null;
}