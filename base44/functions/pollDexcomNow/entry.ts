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

const MIN_SYNC_GAP_MS = 75 * 1000; // Don't hit Share more than once per 75s
const STALE_READING_MS = 4 * 60 * 1000; // Pull anyway if newest reading is older than 4 min

export default async function (req: Request): Promise<Response> {
  const fnStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    // ── [DIAG] REFRESH START (manual/on-demand) ──────────
    console.log(JSON.stringify({
      diagStage: "REFRESH_START",
      trigger: "manual",
      function: "pollDexcomNow",
      timestamp: new Date(fnStart).toISOString(),
      userHash: user?.id ? user.id.slice(0, 8) : null,
      userEmailPresent: !!user?.email,
    }));

    // User-context lookup — RLS ensures only the calling user's connection
    const connections = await base44.entities.DexcomConnection.list("-created_date", 1);
    const conn = connections?.[0];

    if (!conn || conn.status !== "connected") {
      console.log(JSON.stringify({
        diagStage: "FUNCTION_RESPONSE",
        trigger: "manual",
        httpStatus: 200,
        status: "not_connected",
        connectionFound: !!conn,
        connectionStatus: conn?.status ?? null,
      }));
      return Response.json({ status: "not_connected" });
    }

    if (!conn.share_username || !conn.share_password) {
      console.log(JSON.stringify({
        diagStage: "FUNCTION_RESPONSE",
        trigger: "manual",
        httpStatus: 200,
        status: "no_credentials",
        error_code: "DEXCOM_AUTH_ERROR",
        message: "Connection has no stored Share credentials",
      }));
      return Response.json({ status: "no_credentials" });
    }

    // Rate limit — skip if we synced very recently (scheduled or on-demand).
    // But if the newest stored reading is older than STALE_READING_MS, Dexcom
    // has almost certainly published fresh data since, so pull anyway.
    if (conn.last_fetched_at) {
      const lastFetched = new Date(conn.last_fetched_at).getTime();
      if (Number.isFinite(lastFetched) && Date.now() - lastFetched < MIN_SYNC_GAP_MS) {
        const latest = await base44.entities.GlucoseReading.list("-recorded_at", 1);
        const newestRecordedAt = latest?.[0]?.recorded_at
          ? new Date(latest[0].recorded_at).getTime()
          : null;
        const newestIsStale = !Number.isFinite(newestRecordedAt)
          || Date.now() - newestRecordedAt > STALE_READING_MS;
        if (!newestIsStale) {
          console.log(JSON.stringify({
            diagStage: "FUNCTION_RESPONSE",
            trigger: "manual",
            httpStatus: 200,
            status: "too_soon",
            error_code: "DEXCOM_NO_NEW_READING",
            message: "Rate-limited; newest stored reading is still fresh",
            totalDurationMs: Date.now() - fnStart,
          }));
          return Response.json({ status: "too_soon" });
        }
      }
    }

    const now = new Date();
    const sr = base44.asServiceRole;

    try {
      const diag = await syncShareForConnection(sr, conn, conn.share_username, conn.share_password, now, "manual");

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

      const httpStatus = diag.status === "error" ? 200 : 200; // preserves existing behavior
      console.log(JSON.stringify({
        diagStage: "FUNCTION_RESPONSE",
        trigger: "manual",
        httpStatus,
        status: diag.status,
        records_inserted: diag.records_inserted || 0,
        latest_glucose: diag.latest_glucose_value ?? null,
        latest_glucose_timestamp: diag.latest_glucose_timestamp ?? null,
        latest_glucose_trend: diag.latest_glucose_trend ?? null,
        error: diag.error ?? null,
        totalDurationMs: Date.now() - fnStart,
      }));

      return Response.json({
        status: diag.status,
        records_inserted: diag.records_inserted || 0,
        latest_glucose: diag.latest_glucose_value ?? null,
        latest_glucose_timestamp: diag.latest_glucose_timestamp ?? null,
        latest_glucose_trend: diag.latest_glucose_trend ?? null,
      });
    } catch (error: any) {
      console.log(JSON.stringify({
        diagStage: "FUNCTION_RESPONSE",
        trigger: "manual",
        httpStatus: 200,
        status: "error",
        error_code: "BACKEND_FUNCTION_ERROR",
        shareCode: error.shareCode || null,
        message: error.message,
        totalDurationMs: Date.now() - fnStart,
      }));
      return Response.json({ status: "error", error: error.shareCode || error.message });
    }
  } catch (error: any) {
    console.log(JSON.stringify({
      diagStage: "FUNCTION_RESPONSE",
      trigger: "manual",
      httpStatus: 500,
      status: "error",
      error_code: "BACKEND_FUNCTION_ERROR",
      message: error.message,
      totalDurationMs: Date.now() - fnStart,
    }));
    return Response.json({ error: error.message }, { status: 500 });
  }
}