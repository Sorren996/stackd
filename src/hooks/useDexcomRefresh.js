import { useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useDexcomConnection } from "./useDexcomConnection";

// ── Module-level singleton promise ──────────────────────────
// Only one Dexcom fetch is allowed at a time. If multiple components
// request a refresh simultaneously (Dashboard periodic poll, foreground
// lifecycle, manual refresh button), they all join the same in-flight
// promise rather than starting competing API calls.
let inflightPromise = null;

// Invalidates the glucose-related React Query caches so the graph,
// latest-glucose card, and IOB banner pick up any new readings
// immediately after a successful sync.
function invalidateGlucoseQueries(queryClient) {
  queryClient.invalidateQueries({ queryKey: ["latest-glucose"] });
  queryClient.invalidateQueries({ queryKey: ["glucose-readings", "graph"] });
  queryClient.invalidateQueries({ queryKey: ["glucose-readings"] });
}

/**
 * Centralized Dexcom refresh hook.
 *
 * Returns `requestRefresh(force)` — the single function every part of
 * Stackd should call when a legitimate refresh opportunity arises
 * (app launch, foreground, manual refresh, periodic timer).
 *
 * The backend (pollDexcomNow) applies the reading-age gate: if the
 * newest cached Dexcom reading is still within the expected G7 cadence
 * + propagation grace, the API call is skipped and cached data is
 * returned. A forced refresh bypasses the reading-age gate but still
 * respects the in-flight lock.
 */
export function useDexcomRefresh() {
  const queryClient = useQueryClient();
  const { connected } = useDexcomConnection();
  const connectedRef = useRef(connected);
  connectedRef.current = connected;

  const requestRefresh = useCallback(
    async (force = false) => {
      if (!connectedRef.current) {
        return { status: "not_connected" };
      }

      // Concurrency: join an existing in-flight request.
      if (inflightPromise) {
        return inflightPromise;
      }

      inflightPromise = (async () => {
        const invokeStart = Date.now();
        try {
          const res = await base44.functions.invoke("pollDexcomNow", { force });
          const data = res?.data;

          // Invalidate glucose queries whenever the poll returns a valid
          // latest reading timestamp — even when the frontend's own poll
          // didn't insert it (the scheduled workflow may have ingested it
          // first, so records_inserted is 0 but a newer reading now exists).
          if (data?.latest_glucose_timestamp) {
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
            latest_glucose: data?.latest_glucose ?? null,
            latest_glucose_timestamp: data?.latest_glucose_timestamp ?? null,
            reading_age_ms: data?.reading_age_ms ?? null,
            durationMs: Date.now() - invokeStart,
          }));

          return data;
        } catch (invokeErr) {
          console.log(JSON.stringify({
            diagStage: "FRONTEND",
            error_code: "FRONTEND_REQUEST_ERROR",
            message: invokeErr?.message || String(invokeErr),
            durationMs: Date.now() - invokeStart,
          }));
          throw invokeErr;
        } finally {
          inflightPromise = null;
        }
      })();

      return inflightPromise;
    },
    [queryClient]
  );

  return { requestRefresh };
}