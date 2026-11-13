import { useQuery } from "@tanstack/react-query";
import { getNotificationCenter } from "@/lib/notifications/notificationApi";
import { useAuth } from "@/lib/AuthContext";

/**
 * The notifications screen's single read.
 *
 * Refetches on mount so a change made on another screen (a sharer revoking, a
 * follower narrowing) is never rendered from a stale cache.
 */
export default function useNotificationCenter() {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  return useQuery({
    queryKey: ["notification-center", user?.id],
    enabled: isAuthenticated && Boolean(user?.id) && !isLoadingAuth,
    queryFn: getNotificationCenter,
    // staleTime 0 makes every mount revalidate on its own, so the explicit
    // mount refetch added nothing but a blocking read.
    staleTime: 0,
    retry: 1,
  });
}