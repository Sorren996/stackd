import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

// Refresh key glucose queries when the PWA returns to the foreground.
// Systems suspend JavaScript timers in backgrounded webviews, so interval-based
// refetching alone isn't enough — this listener revalidates the freshest data
// the moment the user sees the app again.
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

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        FOREGROUND_REFRESH_KEYS.forEach((key) => {
          queryClient.invalidateQueries({ queryKey: key });
        });
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [queryClient]);
}