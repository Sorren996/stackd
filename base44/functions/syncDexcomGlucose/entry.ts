// Consolidated Dexcom Share Glucose Sync.
//
// For each connected user, authenticates with THEIR OWN Dexcom Share
// credentials (stored per-user in their DexcomConnection record) and pulls
// near-real-time glucose readings. The API V3 OAuth path has been removed —
// Share is now the sole glucose source.
//
// After syncing, runs incremental spike detection and DailySummary updates
// for any days that received new readings.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { syncShareForConnection } from "../../shared/dexcomShareSync.ts";
import { detectSpikesForUser } from "../../shared/spikeDetection.ts";
import { dayKeyFromTimezone, recomputeDailySummary } from "../../shared/dailySummary.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const connections = await sr.entities.DexcomConnection.filter({ status: "connected" });

    if (!connections.length) {
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
        const diag = await syncShareForConnection(sr, conn, conn.share_username, conn.share_password, now);
        results.push(diag);

        // Update connection sync health
        const statusPatch: any = {
          last_sync_status: diag.status,
          last_sync_error: diag.status === "error" ? (diag.error || "Unknown error") : null,
        };

        if (diag.status === "error" && (diag.auth_status === "failed_invalid_credentials" || diag.auth_status === "failed")) {
          statusPatch.status = "error";
        } else if (diag.status !== "error") {
          statusPatch.status = "connected";
          statusPatch.last_fetched_at = now.toISOString();
        }

        await sr.entities.DexcomConnection.update(conn.id, statusPatch).catch(() => {});

        // Spike detection + DailySummary for new readings
        if (diag.records_inserted > 0) {
          try {
            const { toCreate: spikeRecords } = await detectSpikesForUser(sr, owner, 3);
            if (spikeRecords.length) {
              await sr.entities.GlucoseEvent.bulkCreate(spikeRecords);
            }
          } catch {
            // Spike detection failure is non-fatal
          }

          try {
            const settings = await sr.entities.UserSettings.filter({ created_by_id: owner }, "-created_date", 1);
            const s: any = settings[0];
            const timezone = s?.timezone || "UTC";
            const targetLow = Number.isFinite(s?.target_range_low) ? s.target_range_low : 70;
            const targetHigh = Number.isFinite(s?.target_range_high) ? s.target_range_high : 180;

            const affectedDates = new Set<string>();
            for (const ts of (diag.inserted_timestamps || [])) {
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