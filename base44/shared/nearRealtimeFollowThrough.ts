// Near-real-time follow-through for Dexcom Share.
//
// The scheduler cannot run a workflow more than once every five minutes, and a
// CGM publishes a reading at an arbitrary second inside that window. Waiting
// for the next scheduled pass therefore produced measured gaps of 26 s to 5 m 29 s
// between a reading existing and its notification being submitted — a polling
// cadence, not a delivery delay.
//
// So the scheduled pass does not end when its first sweep is done: for the rest
// of this request's own budget it keeps asking Share for anything new, every
// twenty seconds. Ingestion dispatches the notification itself, so a reading
// found here is alerted within one poll of existing.
//
// Bounded on purpose:
//   • it keeps polling for the whole budget rather than stopping at the first
//     reading it finds — the readings published later in the same five-minute
//     window would otherwise wait for the next scheduled pass, which is exactly
//     the multi-minute tail this exists to remove;
//   • it stops early only on a rate-limit answer, leaving the next scheduled
//     pass to it;
//   • it can never run past the request budget, well under the platform's
//     five-minute cap.
//
// SAFETY: reads a glucose source and stores measurements. It never interprets a
// value and never decides what a patient should do.

import { requestDexcomRefreshIfNeeded } from "./dexcomShareSync.ts";
import { loadDexcomCredentials } from "./dexcomCredentials.ts";

const POLL_INTERVAL_MS = 20 * 1000;
/** Leaves head-room under the five-minute request cap for the pass itself. */
const FOLLOW_BUDGET_MS = 4.25 * 60 * 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface FollowThroughResult {
  attempts: number;
  inserted: number;
  stopped: "new_reading" | "rate_limited" | "budget" | "error" | "no_connections";
  /** Measured: newest reading's own timestamp → this request storing it. */
  delaySeconds?: number;
}

/**
 * Keep polling Share inside the current request until a reading appears, the
 * budget ends, or the source asks us to slow down.
 */
export async function followShareReadings({
  sr,
  base44,
  connections,
  fnStart,
}: {
  sr: any;
  base44: any;
  connections: any[];
  fnStart: number;
}): Promise<FollowThroughResult> {
  const shareConnections = (connections || []).filter((conn) => conn?.created_by_id);
  if (!shareConnections.length) return { attempts: 0, inserted: 0, stopped: "no_connections" };

  let attempts = 0;
  let inserted = 0;
  let lastDelaySeconds: number | undefined;
  while (Date.now() - fnStart < FOLLOW_BUDGET_MS) {
    await sleep(POLL_INTERVAL_MS);
    attempts += 1;

    for (const conn of shareConnections) {
      const owner = conn.created_by_id;
      const creds = await loadDexcomCredentials(sr, owner).catch(() => null);
      if (!creds) continue;

      const startedAt = Date.now();
      let result: any;
      try {
        result = await requestDexcomRefreshIfNeeded(
          sr,
          base44,
          conn,
          creds.username,
          creds.password,
          new Date(),
          "near_real_time",
          true
        );
      } catch (error: any) {
        const message = String(error?.message || error);
        // A rate limit ends the follow-through; the scheduled pass resumes.
        if (/429|rate.?limit/i.test(message)) {
          console.log(JSON.stringify({
            diagStage: "NRT_FOLLOW_THROUGH",
            stopped: "rate_limited",
            attempts,
            durationMs: Date.now() - startedAt,
          }));
          return { attempts, inserted: 0, stopped: "rate_limited" };
        }
        continue;
      }

      if (result?.status === "error" && /429|rate.?limit/i.test(String(result?.error || ""))) {
        console.log(JSON.stringify({
          diagStage: "NRT_FOLLOW_THROUGH",
          stopped: "rate_limited",
          attempts,
        }));
        return { attempts, inserted: 0, stopped: "rate_limited" };
      }

      if (Number(result?.records_inserted) > 0) {
        // Measured from the reading's own timestamp, never from a guess.
        const newest = result?.latest_glucose_timestamp
          ? new Date(result.latest_glucose_timestamp).getTime()
          : NaN;
        const delaySeconds = Number.isFinite(newest)
          ? Math.max(0, Math.round((Date.now() - newest) / 1000))
          : undefined;
        // Ingestion dispatches the notification for this reading itself, in the
        // same request, so the notice leaves within one poll of the reading
        // existing. The loop then KEEPS POLLING: the scheduler cannot fire more
        // often than every five minutes, so returning here would leave the rest
        // of the window unwatched and push the next alert out to the next
        // scheduled pass — the measured 4-5 minute tail this exists to remove.
        inserted += Number(result.records_inserted);
        lastDelaySeconds = delaySeconds ?? lastDelaySeconds;
        console.log(JSON.stringify({
          diagStage: "NRT_FOLLOW_THROUGH",
          event: "new_reading",
          attempts,
          inserted: Number(result.records_inserted),
          discovery_delay_s: delaySeconds ?? null,
          notification_dispatch: result?.notification_dispatch ?? null,
          projection_dispatch: result?.projection_dispatch ?? null,
        }));
      }
    }
  }

  console.log(JSON.stringify({
    diagStage: "NRT_FOLLOW_THROUGH",
    stopped: inserted > 0 ? "new_reading" : "budget",
    attempts,
    inserted,
    discovery_delay_s: lastDelaySeconds ?? null,
  }));
  return {
    attempts,
    inserted,
    stopped: inserted > 0 ? "new_reading" : "budget",
    delaySeconds: lastDelaySeconds,
  };
}