import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { DEXCOM_TOKEN_URL, DEXCOM_API_BASE } from "../../shared/dexcomConfig.ts";

// ── Dexcom V3 Sync ──────────────────────────────────────────
// Pulls new EGV readings from every connected Dexcom source.
// Uses Dexcom's dataRange endpoint to determine the actual latest
// available data (accounting for the ~1-hour US G7 upload delay),
// and tracks the sync cursor as the systemTime of the newest
// imported record — NOT wall-clock time.

// ── Helpers ─────────────────────────────────────────────────

// Dexcom V3 systemTime may or may not include a UTC offset.
// Mobile-app-sourced records include offsets; receiver-sourced
// records do not. If no offset is present, interpret as UTC.
function parseDexcomTime(value) {
  if (!value) return null;
  const s = String(value).trim();
  // Already has a timezone designator (Z, +hh:mm, -hh:mm, +hhmm, -hhmm)
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) {
    return new Date(s);
  }
  // No offset — assume UTC
  return new Date(s + "Z");
}

// Dexcom V3 expects ISO 8601 UTC timestamps without timezone suffix.
// The API interprets bare timestamps as UTC.
function formatDexcomDate(d) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function refreshTokens(conn, clientId, clientSecret) {
  const res = await fetch(DEXCOM_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: conn.refresh_token,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) throw new Error(`refresh failed: ${await res.text()}`);
  return await res.json();
}

// ── Constants ───────────────────────────────────────────────

const MAX_QUERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // Dexcom V3: max 30 days per request
const INITIAL_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;   // Initial sync: 24 hours of history
const INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;          // Overlap for reliable incremental sync
const MIN_LOOKBACK_MS = 60 * 60 * 1000;               // Min lookback — covers 1-hour US G7/G6 data delay

// ── Main ────────────────────────────────────────────────────

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const clientId = secrets.get("DEXCOM_CLIENT_ID");
    const clientSecret = secrets.get("DEXCOM_CLIENT_SECRET");
    if (!clientId || !clientSecret) {
      return Response.json({ error: "Dexcom credentials not configured" }, { status: 500 });
    }

    const connections = await sr.entities.DexcomConnection.filter({ status: "connected" });
    const now = new Date();
    const results = [];

    for (const conn of connections) {
      const owner = conn.created_by_id;
      if (!owner) { results.push({ status: "skipped_no_owner" }); continue; }

      // ── Diagnostic container ──────────────────────────────
      const diag = {
        owner,
        environment: DEXCOM_API_BASE.includes("sandbox") ? "sandbox" : "production-US",
        api_version: "v3",
        token_valid: false,
        token_refreshed: false,
        server_utc: now.toISOString(),
        dataRange_http_status: null,
        dexcom_egvs_start_systemTime: null,
        dexcom_egvs_end_systemTime: null,
        last_sync_cursor: conn.last_fetched_at || null,
        requested_startDate: null,
        requested_endDate: null,
        egv_http_status: null,
        response_recordType: null,
        response_records_length: 0,
        records_parsed: 0,
        records_ignored_duplicates: 0,
        records_rejected: 0,
        records_inserted: 0,
        oldest_egv_systemTime: null,
        newest_egv_systemTime: null,
        new_sync_cursor: conn.last_fetched_at || null,
        status: null,
      };

      try {
        let accessToken = conn.access_token;
        let refreshToken = conn.refresh_token;
        let expiresAt = conn.expires_at ? new Date(conn.expires_at) : null;

        // Refresh if the token is missing or expires within 5 minutes.
        if (!accessToken || !expiresAt || expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
          try {
            const refreshed = await refreshTokens(conn, clientId, clientSecret);
            accessToken = refreshed.access_token;
            refreshToken = refreshed.refresh_token || refreshToken;
            expiresAt = new Date(Date.now() + (refreshed.expires_in || 0) * 1000);
            await sr.entities.DexcomConnection.update(conn.id, {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_at: expiresAt.toISOString(),
              expires_in: refreshed.expires_in,
            });
            diag.token_refreshed = true;
          } catch {
            await sr.entities.DexcomConnection.update(conn.id, { status: "error" });
            diag.status = "token_refresh_failed";
            results.push(diag);
            continue;
          }
        }
        diag.token_valid = true;

        // ── 1. Fetch dataRange ──────────────────────────────
        // Ask Dexcom where data actually exists. The end timestamp reflects
        // the latest available record — not wall-clock time — which accounts
        // for the ~1-hour US G7/G6 mobile app upload delay.
        let rangeStart = null;
        let rangeEnd = null;
        try {
          const drRes = await fetch(`${DEXCOM_API_BASE}/users/self/dataRange`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          diag.dataRange_http_status = drRes.status;
          if (drRes.ok) {
            const dr = await drRes.json();
            // V3: { egvs: { start: { systemTime, displayTime }, end: { ... } } }
            // V2 fallback: { egvs: [ { start: "str", end: "str" } ] }
            const egvRange = Array.isArray(dr.egvs) ? dr.egvs[0] : dr.egvs;
            const pick = (v) => (typeof v === "string" ? v : (v && (v.systemTime || v.displayTime)) || null);
            if (egvRange) {
              if (pick(egvRange.start)) {
                rangeStart = parseDexcomTime(pick(egvRange.start));
                diag.dexcom_egvs_start_systemTime = pick(egvRange.start);
              }
              if (pick(egvRange.end)) {
                rangeEnd = parseDexcomTime(pick(egvRange.end));
                diag.dexcom_egvs_end_systemTime = pick(egvRange.end);
              }
            }
          }
        } catch { /* fall back to time-based window below */ }

        const valid = (d) => d && !Number.isNaN(d.getTime());
        if (!valid(rangeStart)) rangeStart = null;
        if (!valid(rangeEnd)) rangeEnd = null;

        // ── 2. Determine query window ─────────────────────
        // Use Dexcom's reported data range (NOT wall-clock time) to determine
        // what data is actually available. rangeEnd from Dexcom reflects the
        // latest available record, which lags behind real-time by ~1 hour.
        const lastSyncCursor = conn.last_fetched_at ? parseDexcomTime(conn.last_fetched_at) : null;
        const validCursor = valid(lastSyncCursor);

        let startDate;
        let endDate;

        if (rangeEnd) {
          // Use Dexcom's actual latest available data time as the end bound.
          // rangeEnd from Dexcom reflects the latest uploaded record, which may
          // lag behind real-time by ~1 hour (US G7/G6 mobile app delay).
          endDate = rangeEnd;
          if (validCursor && rangeStart && lastSyncCursor.getTime() > rangeStart.getTime()) {
            // Incremental sync — start from the last imported record's systemTime
            // with a small overlap (endDate is exclusive). Ensure we always look
            // back at least 1 hour to catch delayed data that hasn't appeared yet.
            startDate = new Date(Math.min(
              lastSyncCursor.getTime() - INCREMENTAL_OVERLAP_MS,
              endDate.getTime() - MIN_LOOKBACK_MS
            ));
            if (rangeStart && startDate.getTime() < rangeStart.getTime()) {
              startDate = rangeStart;
            }
          } else {
            // Initial sync — pull 24 hours ending at Dexcom's latest available data
            startDate = new Date(endDate.getTime() - INITIAL_SYNC_WINDOW_MS);
          }
        } else {
          // dataRange failed — fall back to wall-clock time
          endDate = now;
          if (validCursor) {
            startDate = new Date(lastSyncCursor.getTime() - INCREMENTAL_OVERLAP_MS);
          } else {
            startDate = new Date(now.getTime() - INITIAL_SYNC_WINDOW_MS);
          }
        }

        // Dexcom V3 rejects any EGV query wider than 30 days
        if (endDate.getTime() - startDate.getTime() > MAX_QUERY_WINDOW_MS) {
          startDate = new Date(endDate.getTime() - MAX_QUERY_WINDOW_MS);
        }

        diag.requested_startDate = formatDexcomDate(startDate);
        diag.requested_endDate = formatDexcomDate(endDate);

        if (startDate.getTime() >= endDate.getTime()) {
          diag.status = "no_new_records";
          results.push(diag);
          continue;
        }

        // ── 3. Fetch EGVs ──────────────────────────────────
        const egvRes = await fetch(
          `${DEXCOM_API_BASE}/users/self/egvs?startDate=${formatDexcomDate(startDate)}&endDate=${formatDexcomDate(endDate)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        diag.egv_http_status = egvRes.status;

        if (!egvRes.ok) {
          const errText = await egvRes.text();
          diag.status = egvRes.status === 404 ? "no_data_in_range" : "dexcom_request_failed";
          diag.error_detail = errText.slice(0, 200);
          results.push(diag);
          continue;
        }

        const egvData = await egvRes.json();
        diag.response_recordType = egvData.recordType || null;

        // V3: response.records; V2 fallback: response.egvs
        const records = egvData.records || egvData.egvs || egvData.EGVS || [];
        diag.response_records_length = records.length;

        if (!records.length) {
          // No records in this window. Do NOT advance the cursor — data may
          // still arrive through the 1-hour delay. Keep the previous cursor.
          diag.status = "no_new_records";
          results.push(diag);
          continue;
        }

        // ── 4. Fetch existing readings for dedup ───────────
        const existing = await sr.entities.GlucoseReading.filter(
          { user_id: owner, recorded_at: { $gte: startDate.toISOString() } },
          "-recorded_at",
          1000
        );
        const existingDexcomTimes = new Set();
        const manualReadings = [];
        for (const r of existing) {
          const t = new Date(r.recorded_at).getTime();
          if (Number.isNaN(t)) continue;
          if (r.source === "dexcom") {
            existingDexcomTimes.add(t);
          } else if (r.source === "manual") {
            manualReadings.push({ id: r.id, time: t });
          }
        }

        const PROXIMITY_MS = 5 * 60 * 1000;
        const toCreate = [];
        const manualIdsToDelete = new Set();
        let newestSystemTime = null;
        let oldestSystemTime = null;

        for (const rec of records) {
          const value = rec.value ?? rec.glucoseValue;
          if (value == null) {
            diag.records_rejected++;
            continue;
          }

          // Use systemTime as the canonical timestamp (UTC). Fall back to
          // displayTime only if systemTime is missing.
          const sysTime = rec.systemTime ? parseDexcomTime(rec.systemTime) : null;
          const dispTime = rec.displayTime ? parseDexcomTime(rec.displayTime) : null;
          const dt = sysTime || dispTime;
          if (!dt || Number.isNaN(dt.getTime())) {
            diag.records_rejected++;
            continue;
          }
          const ts = dt.getTime();

          // Dedup by exact timestamp match
          if (existingDexcomTimes.has(ts)) {
            diag.records_ignored_duplicates++;
            continue;
          }
          existingDexcomTimes.add(ts);

          // Override any manual reading within 5 minutes
          for (const manual of manualReadings) {
            if (Math.abs(manual.time - ts) < PROXIMITY_MS) {
              manualIdsToDelete.add(manual.id);
            }
          }

          toCreate.push({
            user_id: owner,
            value,
            recorded_at: dt.toISOString(),
            source: "dexcom",
            trend: rec.trend || null,
          });

          // Track oldest/newest by systemTime
          if (!oldestSystemTime || ts < oldestSystemTime.getTime()) {
            oldestSystemTime = dt;
          }
          if (!newestSystemTime || ts > newestSystemTime.getTime()) {
            newestSystemTime = dt;
          }

          diag.records_parsed++;
        }

        diag.oldest_egv_systemTime = oldestSystemTime ? oldestSystemTime.toISOString() : null;
        diag.newest_egv_systemTime = newestSystemTime ? newestSystemTime.toISOString() : null;

        // ── 5. Store new readings ──────────────────────────
        if (toCreate.length) {
          await sr.entities.GlucoseReading.bulkCreate(toCreate);
          diag.records_inserted = toCreate.length;
        }

        // Remove manual readings superseded by Dexcom data
        if (manualIdsToDelete.size) {
          await Promise.all(
            [...manualIdsToDelete].map((id) => sr.entities.GlucoseReading.delete(id))
          );
        }

        // ── 6. Update sync cursor ──────────────────────────
        // Set the cursor to the systemTime of the newest imported record.
        // If no records were imported, keep the previous cursor so the next
        // sync can pick up delayed data.
        if (newestSystemTime) {
          const newCursor = newestSystemTime.toISOString();
          await sr.entities.DexcomConnection.update(conn.id, {
            last_fetched_at: newCursor,
          });
          diag.new_sync_cursor = newCursor;
        }

        diag.status = toCreate.length > 0 ? "synced" : "no_new_records";
        results.push(diag);
      } catch (error) {
        diag.status = "error";
        diag.error = error.message;
        results.push(diag);
      }
    }

    return Response.json({ processed: connections.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}