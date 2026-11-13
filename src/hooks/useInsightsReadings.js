import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { useAuth } from "@/lib/AuthContext";
import { periodWindow } from "@/lib/insightsPeriod";
import { fetchAllGlucoseReadings } from "@/lib/fetchAllGlucose";

export default function useInsightsReadings(rangeDays) {
  const { user, isAuthenticated, isLoadingAuth } = useAuth();
  const ready = isAuthenticated && !isLoadingAuth && Boolean(user?.id);
  const day = format(new Date(), "yyyy-MM-dd");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const query = useQuery({
    // Keep the shared invalidation prefix, but never reuse dashboard/other-account data.
    queryKey: ["glucose-readings", "insights-period", user?.id, rangeDays, day, timezone],
    enabled: ready,
    queryFn: async ({ signal }) => {
      const { start, end } = periodWindow(rangeDays);
      const readings = await fetchAllGlucoseReadings({ userId: user.id, start, end, signal });
      return { readings, end: end.toISOString() };
    },
    // A range change or authorized remount revalidates even an empty cached
    // result — staleTime 0 already guarantees that, without a blocking read.
    staleTime: 0,
    placeholderData: undefined,
    retry: (count, error) => {
      const status = Number(error?.status || error?.response?.status);
      return count < 1 && (!status || status >= 500) && error?.name !== "AbortError";
    },
    retryDelay: 1500,
  });
  // TanStack owns completion by key; consuming its signal retires old range work.
  return { ...query, data: ready ? query.data : undefined, ready, userId: user?.id };
}