// Consolidated Dexcom Share Glucose Sync — scheduled pass.
//
// Iterates all connected users and runs each through the centralized
// reading-age gate (requestDexcomRefreshIfNeeded). The gate skips users
// whose newest cached reading is still within the expected Dexcom G7
// cadence + propagation grace, preventing unnecessary API calls while
// ensuring readings are fetched promptly once a new one is likely
// available.
//
// After syncing, runs DailySummary updates for any days that received
// new readings.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { requestDexcomRefreshIfNeeded } from "../../shared/dexcomShareSync.ts";
import { dayKeyFromTimezone, recomputeDailySummary } from "../../shared/dailySummary.ts";

export default async function (req: Request): Promise<Response> {
  const fnStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      console.log(JSON.stringify({
        diagStage: "FUNCTION_RESPONSE",
        trigger: "scheduled",
        function: "syncDexcomGlucose",
        httpStatus: 403,
        status: "forbidden",
      }));
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    const sr = base44.asServiceRole;

    console.log(JSON.stringify({
      diagStage: "REFRESH_START",
      trigger: "scheduled",
      function: "syncDexcomGlucose",
      timestamp: new Date(fnStart).toISOString(),
      userHash: user?.id ? user.id.slice(0, 8) : null,
    }));

    const connections = await sr.entities.DexcomConnection.filter({ status: "connected" });

    if (!connections.length) {
      console.log(JSON.stringify({
        diagStage: "FUNCTION_RESPONSE",
        trigger: "scheduled",
        httpStatus: 200,
        status: "skipped",
        reason: "no_connected_dexcom_accounts",
        totalDurationMs: Date.now() - fnStart,
      }));
      return Response.json({ skipped: "no_connected_dexcom_accounts" });
    }

    const now = new Date();
    const results: any[] = [];

    for (const conn of connections) {
      const owner = conn.created_by_id;
      if (!owner || !conn.share_username || !conn.share_password) {
        results.push({ owner, status: "skipped_no_share_credentials" });
        continue;
      }

      try {
        // The scheduled pass uses the same reading-age gate as the
        // on-demand poll. Non-forced — the gate decides based on the
        // newest reading timestamp.
        const result = await requestDexcomRefreshIfNeeded(
          sr,
          base44,
          conn,
          conn.share_username,
          conn.share_password,
          now,
          "scheduled",
          false
        );

        results.push(result);

        // Update connection sync health.
        const statusPatch: any = {
          last_sync_status: result.status,
          last_sync_error: result.status === "error" ? (result.error || "Unknown error") : null,
        };

        if (result.status === "error" && (result.auth_status === "failed_invalid_credentials" || result.auth_status === "failed")) {
          statusPatch.status = "error";
        } else if (result.status !== "error") {
          statusPatch.status = "connected";
          // Stamp last_fetched_at on every attempt so it serves as the
          // in-flight lock for concurrent calls.
          statusPatch.last_fetched_at = now.toISOString();
        }

        await sr.entities.DexcomConnection.update(conn.id, statusPatch).catch(() => {});

        // DailySummary updates for new readings.
        if (result.records_inserted > 0) {
          try {
            const settings = await sr.entities.UserSettings.filter({ created_by_id: owner }, "-created_date", 1);
            const s: any = settings[0];
            const timezone = s?.timezone || "UTC";
            const targetLow = Number.isFinite(s?.target_range_low) ? s.target_range_low : 70;
            const targetHigh = Number.isFinite(s?.target_range_high) ? s.target_range_high : 180;

            const affectedDates = new Set<string>();
            for (const ts of (result.inserted_timestamps || [])) {
              const dk = dayKeyFromTimezone(ts, timezone);
              if (dk) affectedDates.add(dk);
            }
            for (const dateStr of affectedDates) {
              await recomputeDailySummary(sr, owner, dateStr, timezone, targetLow, targetHigh, true);
            }
          } catch {
            // DailySummary failure is non-fatal
          }
        }
      } catch (error: any) {
        results.push({ owner, status: "error", error: error.message });
        await sr.entities.DexcomConnection.update(conn.id, {
          last_sync_status: "error",
          last_sync_error: error.message,
        }).catch(() => {});
      }
    }

    return Response.json({ processed: connections.length, results });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}