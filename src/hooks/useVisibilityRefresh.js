import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDexcomRefresh } from "./useDexcomRefresh";

// The one foreground refresh coordinator.
//
// Every reason the app comes back in front of someone — the document becoming
// visible, a page restored from the back/forward cache, the network returning —
// arrives here instead of in a listener per screen. Triggers that land together
// (iOS fires several at once on resume) collapse into a single round of work,
// so no two handlers ever race for the same refresh.
//
// It revalidates the freshest data the user can see and asks the centralized
// Dexcom gate whether a new reading is likely available. The gate (and the
// server's own freshness and rate limits) still decide whether an API call
// happens at all, and a reading that has not changed is a valid answer.

const FOREGROUND_REFRESH_KEYS = [
  ["latest-glucose"],
  ["glucose-readings", "graph"],
  ["glucose-readings"],
  ["insulin-doses"],
  ["carb-entries"],
  ["unread-coach-insights"],
];

// A resume fires several triggers within a few milliseconds (visibility, then
// pageshow, then online). Only those bursts are collapsed; a genuinely separate
// return still refreshes. Overlapping network work is deduped downstream by
// React Query and by the Dexcom refresh singleton.
const MIN_TRIGGER_GAP_MS = 400;

export function useVisibilityRefresh({ onRevalidate } = {}) {
  const queryClient = useQueryClient();
  const { requestRefresh } = useDexcomRefresh();

  // Kept in a ref so a new callback identity never re-registers the listeners.
  const onRevalidateRef = useRef(onRevalidate);
  onRevalidateRef.current = onRevalidate;

  useEffect(() => {
    let lastTriggerAt = 0;

    const refresh = () => {
      const now = Date.now();
      if (now - lastTriggerAt < MIN_TRIGGER_GAP_MS) return;
      lastTriggerAt = now;

      // Anything the screen shows as "current" must be confirmed again before
      // it is painted as current after a resume.
      onRevalidateRef.current?.();

      FOREGROUND_REFRESH_KEYS.forEach((key) => {
        queryClient.invalidateQueries({ queryKey: key });
      });

      // The gate checks the newest reading's age and skips the API call when
      // the cached reading is still fresh; the singleton inside collapses any
      // simultaneous callers.
      requestRefresh(false).catch(() => {});
    };

    const handleVisibility = () => {
      // Leaving marks the live display as needing revalidation, so returning
      // never paints the previous reading as current. Returning refreshes.
      if (document.visibilityState === "visible") {
        refresh();
      } else {
        onRevalidateRef.current?.();
      }
    };

    const handlePageShow = () => refresh();
    const handleOnline = () => refresh();

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("online", handleOnline);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("online", handleOnline);
    };
  }, [queryClient, requestRefresh]);
}