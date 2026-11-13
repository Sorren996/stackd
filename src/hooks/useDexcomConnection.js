import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

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
  return { connected, connection, isLoading };
}