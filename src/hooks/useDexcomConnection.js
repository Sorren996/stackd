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
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const connection = data?.[0];
  const connected = !!connection && connection.status === "connected";
  return { connected, connection, isLoading };
}