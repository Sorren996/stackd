import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { readManualGlucoseEnabled, storeManualGlucoseEnabled } from "@/lib/manualGlucose";

/**
 * Returns the current user's Dexcom connection status.
 * `connected` means a CGM source is actively syncing — manual glucose
 * logging should step aside so readings flow in on their own.
 */
export function useDexcomConnection() {
  const { data, isLoading } = useQuery({
    queryKey: ["dexcom-connection"],
    queryFn: () => base44.entities.DexcomConnection.list("-created_date", 1),
    staleTime: 30 * 1000,
    gcTime: 10 * 60 * 1000,
    // The one query that keeps its mount refetch, deliberately. `connected`
    // decides which readings are even plotted (the chart draws CGM readings
    // only for a connected account) and whether manual logging is offered, so
    // a stale "connected" would quietly hide the person's own entries. It never
    // blocks a paint — cached data renders while this revalidates — and it is
    // one small row, not a series.
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const connection = data?.[0];
  const connected = !!connection && connection.status === "connected";

  // A sensor and hand-entered readings never share the same line. The moment a
  // connection is established or re-established, hand-logging steps aside —
  // whichever screen did the connecting. Readings already saved on either side
  // are never touched; they stay in the chart and the journal.
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!connected || !connection?.id) return;
    if (!readManualGlucoseEnabled()) return;
    storeManualGlucoseEnabled(false)
      .then(() => queryClient.invalidateQueries({ queryKey: ["user-settings"] }))
      .catch(() => {});
  }, [connected, connection?.id, queryClient]);

  return { connected, connection, isLoading };
}