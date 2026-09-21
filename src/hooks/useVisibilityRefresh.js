import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDexcomRefresh } from "./useDexcomRefresh";

// Refresh key glucose queries when the PWA returns to the foreground.
// Systems suspend JavaScript timers in backgrounded webviews, so interval-based
// refetching alone isn't enough — this listener revalidates the freshest data
// the moment the user sees the app again.
//
// It also triggers a Dexcom Share refresh via the centralized gate, so new
// readings are pulled promptly after the app returns to the foreground
// (the reading-age gate prevents unnecessary API calls if the cached
// reading is still fresh).
const FOREGROUND_REFRESH_KEYS = [
  ["latest-glucose"],
  ["glucose-readings", "graph"],
  ["glucose-readings"],
  ["insulin-doses"],
  ["carb-entries"],
  ["unread-coach-insights"],
];

export function useVisibilityRefresh() {
  const queryClient = useQueryClient();
  const { requestRefresh } = useDexcomRefresh();

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        FOREGROUND_REFRESH_KEYS.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
        // Ask the centralized gate whether a Dexcom fetch is needed.
        // The gate checks the newest reading timestamp and skips the
        // API call if the cached reading is still fresh.
        requestRefresh(false).catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient, requestRefresh]);
}