// Stackd Insight — Latest Projection Hook (Milestone 5)
//
// Fetches the latest stored GlucoseProjection for the current user and
// triggers a background generation when the stored projection is stale
// or missing. The generation is fire-and-forget — it never blocks the
// dashboard. The next refetch picks up the newly generated projection.
//
// SAFETY: Only returns non-abstained projections with a trajectory.
// Abstained projections (insufficient evidence) return null so the UI
// shows nothing rather than a misleading empty forecast.

import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useEffect, useRef } from "react";

const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const REFETCH_INTERVAL_MS = 60 * 1000; // 1 minute

export function useLatestProjection() {
  const latestQuery = useQuery({
    queryKey: ["latest-projection"],
    queryFn: () => base44.entities.GlucoseProjection.list("-generated_at", 1),
    refetchInterval: REFETCH_INTERVAL_MS,
    staleTime: 30 * 1000,
  });

  const projection = latestQuery.data?.[0] || null;
  const lastGenRef = useRef(0);

  // Background-generate a fresh projection when the stored one is stale.
  // Fire-and-forget — the next refetch cycle picks up the new record.
  useEffect(() => {
    if (!projection) {
      // No projection at all — generate one (but not more than once per 10 min).
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