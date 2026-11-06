import { useQuery } from "@tanstack/react-query";
import { getNotificationCenter } from "@/lib/notifications/notificationApi";

/**
 * The notifications screen's single read.
 *
 * Refetches on mount so a change made on another screen (a sharer revoking, a
 * follower narrowing) is never rendered from a stale cache.
 */
export default function useNotificationCenter() {
  return useQuery({
    queryKey: ["notification-center"],
    queryFn: getNotificationCenter,
    staleTime: 0,
    refetchOnMount: "always",
    retry: 1,
  });
}