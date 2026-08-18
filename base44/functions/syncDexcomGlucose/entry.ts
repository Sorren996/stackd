// Consolidated Dexcom Glucose Sync — replaces the two separate 5-minute
// scheduled automations (fetchDexcomShareReadings + fetchDexcomReadings) with
// a single pass per connected user.
//
// For each connection:
//   1. Sync via Dexcom Share (near-real-time, creates "dexcom_share" readings)
//   2. Sync via Dexcom API V3 (creates "dexcom" readings, reconciles Share)
//
// Both data sources are preserved. Share runs first so its fresher readings are
// available immediately; API V3 runs second and reconciles any Share readings
// to canonical "dexcom" source — exactly the same behavior as before, just in
// one scheduled invocation instead of two.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import { syncShareForConnection } from "../../shared/dexcomShareSync.ts";
import { syncApiForConnection } from "../../shared/dexcomApiSync.ts";
import { detectSpikesForUser } from "../../shared/spikeDetection.ts";
import { dayKeyFromTimezone, recomputeDailySummary } from "../../shared/dailySummary.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const shareUsername = secrets.get("DEXCOM_SHARE_USERNAME");
    const sharePassword = secrets.get("DEXCOM_SHARE_PASSWORD");
    const clientId = secrets.get("DEXCOM_CLIENT_ID");
    const clientSecret = secrets.get("DEXCOM_CLIENT_SECRET");

    const connections = await sr.entities.DexcomConnection.filter({ status: "connected" });

    if (!connections.length) {
      return Response.json({
        skipped: "no_connected_dexcom_accounts",
        message: "Connect Dexcom via Settings before sync can attribute readings.",
      });
    }

    const now = new Date();
    const shareResults: any[] = [];
    const apiResults: any[] = [];

    for (const conn of connections) {
      // 1. Share sync (near-real-time) — skip if credentials not configured
      if (shareUsername && sharePassword) {
        try {
          const shareDiag = await syncShareForConnection(sr, conn, shareUsername, sharePassword, now);
          shareResults.push(shareDiag);
        } catch (error: any) {
          shareResults.push({ owner: conn.created_by_id, status: "error", error: error.message });
        }
      }

      // 2. API V3 sync (official, reconciles Share readings)
      if (clientId && clientSecret) {
        try {
          const apiDiag = await syncApiForConnection(sr, conn, clientId, clientSecret, now);
          apiResults.push(apiDiag);
        } catch (error: any) {
          apiResults.push({ owner: conn.created_by_id, status: "error", error: error.message });
        }
      }

      // 3. Incremental spike detection for this user — replaces the scheduled
      // scanForSpikes full-scan. Only runs if new readings were inserted.
      const owner = conn.created_by_id;
      if (owner) {
        const shareInserted = shareResults.length > 0 && shareResults[shareResults.length - 1]?.records_inserted > 0;
        const apiInserted = apiResults.length > 0 && apiResults[apiResults.length - 1]?.records_inserted > 0;
        if (shareInserted || apiInserted) {
          try {
            const { toCreate: spikeRecords } = await detectSpikesForUser(sr, owner, 3);
            if (spikeRecords.length) {
              await sr.entities.GlucoseEvent.bulkCreate(spikeRecords);
            }
          } catch {
            // Spike detection failure is non-fatal — sync already succeeded
          }

          // Incremental DailySummary update — only for days that received new
          // readings. Uses the actual reading timestamps so delayed readings
          // update the correct calendar day, not the ingestion day.
          try {
            const settings = await sr.entities.UserSettings.filter({ created_by_id: owner }, "-created_date", 1);
            const s: any = settings[0];
            const timezone = s?.timezone || "UTC";
            const targetLow = Number.isFinite(s?.target_range_low) ? s.target_range_low : 70;
            const targetHigh = Number.isFinite(s?.target_range_high) ? s.target_range_high : 180;

            const insertedTs: string[] = [];
            const lastShare = shareResults[shareResults.length - 1];
            const lastApi = apiResults[apiResults.length - 1];
            if (lastShare?.inserted_timestamps) insertedTs.push(...lastShare.inserted_timestamps);
            if (lastApi?.inserted_timestamps) insertedTs.push(...lastApi.inserted_timestamps);

            const affectedDates = new Set<string>();
            for (const ts of insertedTs) {
              const dk = dayKeyFromTimezone(ts, timezone);
              if (dk) affectedDates.add(dk);
            }

            for (const dateStr of affectedDates) {
              await recomputeDailySummary(sr, owner, dateStr, timezone, targetLow, targetHigh, true);
            }
          } catch {
            // DailySummary failure is non-fatal — sync already succeeded
          }
        }
      }
    }

    return Response.json({
      processed: connections.length,
      share: { results: shareResults },
      api: { results: apiResults },
    });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}