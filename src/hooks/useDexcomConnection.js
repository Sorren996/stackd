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
    // Always refetch when a component using the hook mounts, even if a
    // (possibly errored) result is still cached as "fresh". This keeps the
    // connection status honest after a transient fetch failure, without
    // waiting for staleTime to expire — the keep-alive Layout means pages
    // stay mounted (hidden), so a failed first load otherwise sticks.
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const connection = data?.[0];
  const connected = !!connection && connection.status === "connected";
  return { connected, connection, isLoading };
}