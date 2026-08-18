// On-demand Dexcom Share sync for the actively-viewing user.
//
// The scheduled syncDexcomGlucose automation runs every 5 minutes (the
// platform minimum for scheduled tasks). When a user is actively looking at
// their Dashboard, that 5-minute gap is the largest contributor to perceived
// latency. This function lets the frontend trigger an immediate Share fetch
// for the calling user only, complementing the scheduled pass.
//
// A per-connection rate limit (MIN_SYNC_GAP_MS) prevents redundant API calls
// — if the scheduled pass or a previous on-demand poll just ran, we return
// "too_soon" without hitting Dexcom.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.42";
import { syncShareForConnection } from "../../shared/dexcomShareSync.ts";

const MIN_SYNC_GAP_MS = 2 * 60 * 1000; // Don't hit Share more than once per 2 min

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    // User-context lookup — RLS ensures only the calling user's connection
    const connections = await base44.entities.DexcomConnection.list("-created_date", 1);
    const conn = connections?.[0];

    if (!conn || conn.status !== "connected") {
      return Response.json({ status: "not_connected" });
    }

    if (!conn.share_username || !conn.share_password) {
      return Response.json({ status: "no_credentials" });
    }

    // Rate limit — skip if we synced very recently (scheduled or on-demand)
    if (conn.last_fetched_at) {
      const lastFetched = new Date(conn.last_fetched_at).getTime();
      if (Number.isFinite(lastFetched) && Date.now() - lastFetched < MIN_SYNC_GAP_MS) {
        return Response.json({ status: "too_soon" });
      }
    }

    const now = new Date();
    const sr = base44.asServiceRole;

    try {
      const diag = await syncShareForConnection(sr, conn, conn.share_username, conn.share_password, now);

      // Update connection sync health (same pattern as syncDexcomGlucose)
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

      return Response.json({
        status: diag.status,
        records_inserted: diag.records_inserted || 0,
        latest_glucose: diag.latest_glucose_value ?? null,
        latest_glucose_timestamp: diag.latest_glucose_timestamp ?? null,
        latest_glucose_trend: diag.latest_glucose_trend ?? null,
      });
    } catch (error: any) {
      return Response.json({ status: "error", error: error.shareCode || error.message });
    }
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}