// Per-connection Dexcom API V3 sync logic, extracted so the consolidated
// syncDexcomGlucose function can run Share + API V3 in a single pass.
// Identical behavior to the original fetchDexcomReadings per-connection loop.

import { DEXCOM_TOKEN_URL, DEXCOM_API_BASE } from "./dexcomConfig.ts";

const MAX_QUERY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const INITIAL_SYNC_WINDOW_MS = 24 * 60 * 60 * 1000;
const INCREMENTAL_OVERLAP_MS = 5 * 60 * 1000;
const MIN_LOOKBACK_MS = 60 * 60 * 1000;

function parseDexcomTime(value: string): Date | null {
  if (!value) return null;
  const s = String(value).trim();
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(s)) return new Date(s);
  return new Date(s + "Z");
}

function formatDexcomDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function refreshTokens(conn: any, clientId: string, clientSecret: string): Promise<any> {
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

export async function syncApiForConnection(
  sr: any,
  conn: any,
  clientId: string,
  clientSecret: string,
  now: Date
): Promise<any> {
  const owner = conn.created_by_id;
  if (!owner) return { status: "skipped_no_owner" };

  const diag: any = {
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
    records_reconciled_with_share: 0,
    oldest_egv_systemTime: null,
    newest_egv_systemTime: null,
    new_sync_cursor: conn.last_fetched_at || null,
    status: null,
  };

  try {
    let accessToken = conn.access_token;
    let refreshToken = conn.refresh_token;
    let expiresAt = conn.expires_at ? new Date(conn.expires_at) : null;

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
        return diag;
      }
    }
    diag.token_valid = true;

    let rangeStart: Date | null = null;
    let rangeEnd: Date | null = null;
    try {
      const drRes = await fetch(`${DEXCOM_API_BASE}/users/self/dataRange`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      diag.dataRange_http_status = drRes.status;
      if (drRes.ok) {
        const dr = await drRes.json();
        const egvRange = Array.isArray(dr.egvs) ? dr.egvs[0] : dr.egvs;
        const pick = (v: any) => (typeof v === "string" ? v : (v && (v.systemTime || v.displayTime)) || null);
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
    } catch {}

    const valid = (d: Date | null) => d && !Number.isNaN(d.getTime());
    if (!valid(rangeStart)) rangeStart = null;
    if (!valid(rangeEnd)) rangeEnd = null;

    const lastSyncCursor = conn.last_fetched_at ? parseDexcomTime(conn.last_fetched_at) : null;
    const validCursor = valid(lastSyncCursor);

    let startDate: Date;
    let endDate: Date;

    if (rangeEnd) {
      endDate = rangeEnd;
      if (validCursor && rangeStart && lastSyncCursor!.getTime() > rangeStart.getTime()) {
        startDate = new Date(Math.min(
          lastSyncCursor!.getTime() - INCREMENTAL_OVERLAP_MS,
          endDate.getTime() - MIN_LOOKBACK_MS
        ));
        if (rangeStart && startDate.getTime() < rangeStart.getTime()) {
          startDate = rangeStart;
        }
      } else {
        startDate = new Date(endDate.getTime() - INITIAL_SYNC_WINDOW_MS);
      }
    } else {
      endDate = now;
      if (validCursor) {
        startDate = new Date(lastSyncCursor!.getTime() - INCREMENTAL_OVERLAP_MS);
      } else {
        startDate = new Date(now.getTime() - INITIAL_SYNC_WINDOW_MS);
      }
    }

    if (endDate.getTime() - startDate.getTime() > MAX_QUERY_WINDOW_MS) {
      startDate = new Date(endDate.getTime() - MAX_QUERY_WINDOW_MS);
    }

    diag.requested_startDate = formatDexcomDate(startDate);
    diag.requested_endDate = formatDexcomDate(endDate);

    if (startDate.getTime() >= endDate.getTime()) {
      diag.status = "no_new_records";
      return diag;
    }

    const egvRes = await fetch(
      `${DEXCOM_API_BASE}/users/self/egvs?startDate=${formatDexcomDate(startDate)}&endDate=${formatDexcomDate(endDate)}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    diag.egv_http_status = egvRes.status;

    if (!egvRes.ok) {
      const errText = await egvRes.text();
      diag.status = egvRes.status === 404 ? "no_data_in_range" : "dexcom_request_failed";
      diag.error_detail = errText.slice(0, 200);
      return diag;
    }

    const egvData = await egvRes.json();
    diag.response_recordType = egvData.recordType || null;

    const records = egvData.records || egvData.egvs || egvData.EGVS || [];
    diag.response_records_length = records.length;

    if (!records.length) {
      diag.status = "no_new_records";
      return diag;
    }

    const existing = await sr.entities.GlucoseReading.filter(
      { user_id: owner, recorded_at: { $gte: startDate.toISOString() } },
      "-recorded_at",
      1000
    );
    const existingDexcomTimes = new Set();
    const shareReadings: any[] = [];
    const manualReadings: any[] = [];
    for (const r of existing) {
      const t = new Date(r.recorded_at).getTime();
      if (Number.isNaN(t)) continue;
      if (r.source === "dexcom") {
        existingDexcomTimes.add(t);
      } else if (r.source === "dexcom_share") {
        shareReadings.push({ id: r.id, time: t });
      } else if (r.source === "manual") {
        manualReadings.push({ id: r.id, time: t });
      }
    }

    const PROXIMITY_MS = 5 * 60 * 1000;
    const toCreate: any[] = [];
    const manualIdsToDelete = new Set();
    const shareIdsToReconcile = new Set();
    let newestSystemTime: Date | null = null;
    let oldestSystemTime: Date | null = null;

    for (const rec of records) {
      const value = rec.value ?? rec.glucoseValue;
      if (value == null) {
        diag.records_rejected++;
        continue;
      }

      const sysTime = rec.systemTime ? parseDexcomTime(rec.systemTime) : null;
      const dispTime = rec.displayTime ? parseDexcomTime(rec.displayTime) : null;
      const dt = sysTime || dispTime;
      if (!dt || Number.isNaN(dt.getTime())) {
        diag.records_rejected++;
        continue;
      }
      const ts = dt.getTime();

      if (existingDexcomTimes.has(ts)) {
        diag.records_ignored_duplicates++;
        continue;
      }

      const matchingShare = shareReadings.find((s) => Math.abs(s.time - ts) < 60 * 1000);
      if (matchingShare) {
        shareIdsToReconcile.add(matchingShare.id);
        diag.records_reconciled_with_share++;
        continue;
      }

      existingDexcomTimes.add(ts);

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

      if (!oldestSystemTime || ts < oldestSystemTime.getTime()) oldestSystemTime = dt;
      if (!newestSystemTime || ts > newestSystemTime.getTime()) newestSystemTime = dt;

      diag.records_parsed++;
    }

    diag.oldest_egv_systemTime = oldestSystemTime ? oldestSystemTime.toISOString() : null;
    diag.newest_egv_systemTime = newestSystemTime ? newestSystemTime.toISOString() : null;

    if (toCreate.length) {
      await sr.entities.GlucoseReading.bulkCreate(toCreate);
      diag.records_inserted = toCreate.length;
      diag.inserted_timestamps = toCreate.map((r) => r.recorded_at);
    }

    if (shareIdsToReconcile.size) {
      await Promise.all(
        [...shareIdsToReconcile].map((id) =>
          sr.entities.GlucoseReading.update(id, { source: "dexcom" })
        )
      );
    }

    if (manualIdsToDelete.size) {
      await Promise.all(
        [...manualIdsToDelete].map((id) => sr.entities.GlucoseReading.delete(id))
      );
    }

    if (newestSystemTime) {
      const newCursor = newestSystemTime.toISOString();
      await sr.entities.DexcomConnection.update(conn.id, {
        last_fetched_at: newCursor,
      });
      diag.new_sync_cursor = newCursor;
    }

    diag.status = toCreate.length > 0 ? "synced" : "no_new_records";
    return diag;
  } catch (error: any) {
    diag.status = "error";
    diag.error = error.message;
    return diag;
  }
}