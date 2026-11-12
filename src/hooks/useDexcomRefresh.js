import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useDexcomConnection } from "./useDexcomConnection";
import { useAuth } from '@/lib/AuthContext';
import { readStoredCacheOwner } from '@/lib/latestGlucoseCache';
import { boundedRead } from '@/lib/resumeFreshness';
import { requestGlucoseRefresh } from '@/lib/glucoseRefresh/coordinator';

// Invalidates the glucose-related React Query caches so the graph,
// latest-glucose card, and IOB banner pick up any new readings
// immediately after a successful sync.
function invalidateGlucoseQueries(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["latest-glucose"] }, { cancelRefetch: false });
  queryClient.invalidateQueries({ queryKey: ["glucose-readings"] }, { cancelRefetch: false });
  // Re-read the connection row so the stale-sync banner's "since last sync"
  // timer resets the moment last_fetched_at bumps forward.
  queryClient.invalidateQueries({ queryKey: ["dexcom-connection"] });
}

/**
 * Centralized source refresh hook.
 *
 * Returns `requestRefresh(force)` — the single function every part of Stackd
 * should call when a legitimate refresh opportunity arises (app launch,
 * foreground, manual refresh, periodic timer).
 *
 * The single-flight, generation and timeout rules live in the refresh
 * coordinator, so a launch/foreground/manual collision joins one request and a
 * late answer can never overwrite a newer one. This hook only owns what is
 * Dexcom-specific: the call itself and the cache invalidation that follows.
 *
 * The backend (pollDexcomNow) applies the reading-age gate: if the
 * newest cached Dexcom reading is still within the expected G7 cadence
 * + propagation grace, the API call is skipped and cached data is
 * returned. A forced refresh bypasses the reading-age gate but still
 * respects the in-flight lock.
 */
export function useDexcomRefresh() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { connected } = useDexcomConnection();
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  const requestRefresh = useCallback(
    async (force = false) => {
      if (!user?.id || !connectedRef.current) {
        return { status: "not_connected" };
      }

      const ownerId = user.id;

      return requestGlucoseRefresh({
        userId: ownerId,
        trigger: force ? "manual" : "opportunity",
        run: async () => {
          const invokeStart = Date.now();
          let res;
          try {
            res = await boundedRead(() => base44.functions.invoke("pollDexcomNow", { force }));
          } catch (invokeErr) {
            console.log(JSON.stringify({
              diagStage: "FRONTEND",
              error_code: "FRONTEND_REQUEST_ERROR",
              message: invokeErr?.message || String(invokeErr),
              durationMs: Date.now() - invokeStart,
            }));
            throw invokeErr;
          }
          const data = res?.data;

          // Invalidate glucose queries whenever the poll returns a valid
          // latest reading timestamp — even when the frontend's own poll
          // didn't insert it (the scheduled workflow may have ingested it
          // first, so records_inserted is 0 but a newer reading now exists).
          if (data?.latest_glucose_timestamp && readStoredCacheOwner() === ownerId) {
            invalidateGlucoseQueries(queryClient);
          }

          console.log(JSON.stringify({
            diagStage: "FRONTEND",
            trigger: force ? "manual_forced" : "opportunity",
            httpStatus: res?.status ?? null,
            status: data?.status ?? null,
            skipped: data?.skipped === true,
            reason: data?.reason ?? null,
            records_inserted: data?.records_inserted ?? null,
            source_check_success: data?.source_check_success ?? null,
            verification: data?.verification ?? null,
            latest_glucose: data?.latest_glucose ?? null,
            latest_glucose_timestamp: data?.latest_glucose_timestamp ?? null,
            reading_age_ms: data?.reading_age_ms ?? null,
            durationMs: Date.now() - invokeStart,
          }));

          return data;
        },
      });
    },
    [queryClient, user?.id]
  );

  return { requestRefresh };
}