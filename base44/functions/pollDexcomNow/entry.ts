// On-demand Dexcom Share sync for the actively-viewing user.
//
// This is the frontend-facing entry point for the centralized reading-age
// gate (requestDexcomRefreshIfNeeded). It accepts an optional `force`
// flag that bypasses the reading-age gate but still respects the in-flight
// lock.
//
// The scheduled syncDexcomGlucose workflow uses the same gate function, so
// there is exactly one sync decision system — not two competing ones.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.42";
import { requestDexcomRefreshIfNeeded } from "../../shared/dexcomShareSync.ts";
import { dayKeyFromTimezone, recomputeDailySummary } from "../../shared/dailySummary.ts";

export default async function (req: Request): Promise<Response> {
  const fnStart = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);

    // Parse force flag from request body (default false).
    let force = false;
    try {
      const body = await req.json().catch(() => ({}));
      force = body?.force === true;
    } catch {
      // No body or invalid JSON — default to non-forced.
    }

    console.log(JSON.stringify({
      diagStage: "REFRESH_START",
      trigger: "manual",
      function: "pollDexcomNow",
      force,
      timestamp: new Date(fnStart).toISOString(),
      userHash: user?.id ? user.id.slice(0, 8) : null,
      userEmailPresent: !!user?.email,
    }));

    // User-context lookup — RLS ensures only the calling user's connection.
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

    const now = new Date();
    const sr = base44.asServiceRole;

    // ── Centralized reading-age gate ──────────────────────
    const result = await requestDexcomRefreshIfNeeded(
      sr,
      base44,
      conn,
      conn.share_username,
      conn.share_password,
      now,
      "manual",
      force
    );

    // ── Update connection sync health ────────────────────
    const statusPatch: any = {
      last_sync_status: result.status,
      last_sync_error: result.status === "error" ? (result.error || "Unknown error") : null,
    };

    if (result.status === "error" && (result.auth_status === "failed_invalid_credentials" || result.auth_status === "failed")) {
      statusPatch.status = "error";
    } else if (result.status !== "error") {
      statusPatch.status = "connected";
      // Stamp last_fetched_at on every attempt (not just when records are
      // inserted) so it serves as the in-flight lock for concurrent calls.
      statusPatch.last_fetched_at = now.toISOString();
    }

    await sr.entities.DexcomConnection.update(conn.id, statusPatch).catch(() => {});

    // ── DailySummary updates for new readings ────────────
    if (result.records_inserted > 0) {
      try {
        const settings = await sr.entities.UserSettings.filter({ created_by_id: conn.created_by_id }, "-created_date", 1);
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
          await recomputeDailySummary(sr, conn.created_by_id, dateStr, timezone, targetLow, targetHigh, true);
        }
      } catch {
        // DailySummary failure is non-fatal
      }
    }

    console.log(JSON.stringify({
      diagStage: "FUNCTION_RESPONSE",
      trigger: "manual",
      force,
      httpStatus: 200,
      status: result.status,
      skipped: result.skipped === true,
      reason: result.reason ?? null,
      records_inserted: result.records_inserted || 0,
      latest_glucose: result.latest_glucose_value ?? null,
      latest_glucose_timestamp: result.latest_glucose_timestamp ?? null,
      latest_glucose_trend: result.latest_glucose_trend ?? null,
      reading_age_ms: result.reading_age_ms ?? null,
      error: result.error ?? null,
      totalDurationMs: Date.now() - fnStart,
    }));

    return Response.json({
      status: result.status,
      skipped: result.skipped === true,
      reason: result.reason ?? null,
      records_inserted: result.records_inserted || 0,
      latest_glucose: result.latest_glucose_value ?? null,
      latest_glucose_timestamp: result.latest_glucose_timestamp ?? null,
      latest_glucose_trend: result.latest_glucose_trend ?? null,
      reading_age_ms: result.reading_age_ms ?? null,
    });
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