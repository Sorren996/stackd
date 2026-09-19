// Per-connection Dexcom Share sync logic, extracted so the consolidated
// syncDexcomGlucose function can run Share + API V3 in a single pass.
// Identical behavior to the original fetchDexcomShareReadings per-connection loop.

import {
  DEXCOM_SHARE_BASE_URL_US,
  DEXCOM_SHARE_APPLICATION_ID_US,
  DEXCOM_SHARE_AUTHENTICATE_ENDPOINT,
  DEXCOM_SHARE_LOGIN_ENDPOINT,
  DEXCOM_SHARE_READINGS_ENDPOINT,
  DEXCOM_SHARE_HEADERS,
  DEXCOM_SHARE_DEFAULT_UUID,
} from "./dexcomShareConfig.ts";

const POLL_MINUTES = 30;
const POLL_MAX_COUNT = 6;
const PROXIMITY_MS = 5 * 60 * 1000;
const DEDUP_WINDOW_MS = 60 * 1000;

function parseShareTimestamp(dtString: string): Date | null {
  if (!dtString) return null;
  const match = String(dtString).match(/Date\((\d+)/);
  if (!match) return null;
  const ms = parseInt(match[1], 10);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

function isCleanUuid(value: string): boolean {
  if (!value) return false;
  const v = String(value).replace(/"/g, "").trim();
  return v.length > 0 && v !== DEXCOM_SHARE_DEFAULT_UUID;
}

async function sharePost(endpoint: string, body: any): Promise<any> {
  const res = await fetch(`${DEXCOM_SHARE_BASE_URL_US}${endpoint}`, {
    method: "POST",
    headers: DEXCOM_SHARE_HEADERS,
    body: JSON.stringify(body || {}),
  });
  if (!res.ok) {
    let errCode = null;
    let errMsg = null;
    try {
      const errJson = await res.json();
      errCode = errJson.Code || null;
      errMsg = errJson.Message || null;
    } catch {}
    const error = new Error(`Share request failed: ${res.status}`);
    (error as any).shareCode = errCode;
    (error as any).shareMessage = errMsg;
    throw error;
  }
  return await res.json();
}

export async function getShareSessionId(username: string, password: string): Promise<string> {
  const applicationId = DEXCOM_SHARE_APPLICATION_ID_US;
  const accountId = await sharePost(DEXCOM_SHARE_AUTHENTICATE_ENDPOINT, {
    accountName: username,
    password: password,
    applicationId: applicationId,
  });
  if (!isCleanUuid(accountId)) {
    const error = new Error("Share authentication returned invalid account ID");
    (error as any).shareCode = "InvalidAccountId";
    throw error;
  }
  const sessionId = await sharePost(DEXCOM_SHARE_LOGIN_ENDPOINT, {
    accountId: String(accountId).replace(/"/g, ""),
    password: password,
    applicationId: applicationId,
  });
  if (!isCleanUuid(sessionId)) {
    const error = new Error("Share login returned invalid session ID");
    (error as any).shareCode = "InvalidSessionId";
    throw error;
  }
  return String(sessionId).replace(/"/g, "");
}

export async function syncShareForConnection(
  sr: any,
  conn: any,
  username: string,
  password: string,
  now: Date,
  trigger: string = "scheduled"
): Promise<any> {
  const owner = conn.created_by_id;
  const fnStart = Date.now();

  // ── [DIAG] REFRESH START ──────────────────────────────
  console.log(JSON.stringify({
    diagStage: "REFRESH_START",
    trigger,
    function: "syncShareForConnection",
    timestamp: new Date(fnStart).toISOString(),
    ownerHash: owner ? owner.slice(0, 8) : null, // privacy-safe prefix only
    connectionId: conn?.id ?? null,
    hasUsername: !!username,
    hasPassword: !!password,
  }));

  if (!owner) {
    console.log(JSON.stringify({ diagStage: "DATA_PROCESSING", error_code: "DEXCOM_NO_OWNER", message: "No owner on connection" }));
    return { status: "skipped_no_owner" };
  }

  const diag: any = {
    owner,
    api: "dexcom_share",
    region: "US",
    auth_status: null,
    session_valid: false,
    poll_status: null,
    records_returned: 0,
    records_parsed: 0,
    records_ignored_duplicates: 0,
    records_rejected: 0,
    records_inserted: 0,
    latest_glucose_timestamp: null,
    latest_glucose_value: null,
    latest_glucose_trend: null,
    latest_glucose_age: null,
    status: null,
  };

  try {
    // ── [DIAG] DEXCOM REQUEST (auth step) ────────────────
    const authStart = Date.now();
    console.log(JSON.stringify({
      diagStage: "DEXCOM_REQUEST",
      step: "authenticate",
      timestamp: new Date(authStart).toISOString(),
      endpoint: DEXCOM_SHARE_AUTHENTICATE_ENDPOINT,
      method: "POST",
      tokenPresent: false, // Share uses username/password, not a bearer token
    }));

    const sessionId = await getShareSessionId(username, password);
    diag.auth_status = "successful";
    diag.session_valid = true;

    console.log(JSON.stringify({
      diagStage: "DEXCOM_RESPONSE",
      step: "authenticate",
      httpStatus: 200,
      authSucceeded: true,
      sessionRetrieved: true,
      durationMs: Date.now() - authStart,
    }));

    // ── [DIAG] DEXCOM REQUEST (readings step) ───────────
    const readingsUrl =
      `${DEXCOM_SHARE_BASE_URL_US}${DEXCOM_SHARE_READINGS_ENDPOINT}` +
      `?sessionId=${encodeURIComponent(sessionId)}` +
      `&minutes=${POLL_MINUTES}` +
      `&maxCount=${POLL_MAX_COUNT}`;

    const pollStart = Date.now();
    console.log(JSON.stringify({
      diagStage: "DEXCOM_REQUEST",
      step: "readings",
      timestamp: new Date(pollStart).toISOString(),
      endpoint: DEXCOM_SHARE_READINGS_ENDPOINT,
      method: "POST",
      tokenPresent: true, // sessionId retrieved from auth step
    }));

    const readingsRes = await fetch(readingsUrl, {
      method: "POST",
      headers: DEXCOM_SHARE_HEADERS,
      body: JSON.stringify({}),
    });

    // ── [DIAG] DEXCOM RESPONSE (readings step) ──────────
    const pollDurationMs = Date.now() - pollStart;
    const safeHeaders: any = {};
    try {
      readingsRes.headers.forEach((v, k) => {
        if (/content-type|date|server|cache-control/i.test(k)) safeHeaders[k] = v;
      });
    } catch {}

    if (!readingsRes.ok) {
      let errCode: string | null = null;
      let errMsg: string | null = null;
      let errBody: any = null;
      try {
        const errJson = await readingsRes.json();
        errCode = errJson.Code || null;
        errMsg = errJson.Message || null;
        errBody = { Code: errCode, Message: errMsg };
      } catch {}

      const errorCode =
        readingsRes.status === 429 ? "DEXCOM_RATE_LIMIT"
        : readingsRes.status === 401 || readingsRes.status === 403 ? "DEXCOM_AUTH_ERROR"
        : readingsRes.status === 500 ? "DEXCOM_API_ERROR"
        : "DEXCOM_API_ERROR";

      diag.poll_status = "failed";
      diag.status = readingsRes.status === 500 ? "session_expired" : "readings_request_failed";
      diag.error_detail = (errCode || "").slice(0, 50);

      console.log(JSON.stringify({
        diagStage: "DEXCOM_RESPONSE",
        step: "readings",
        httpStatus: readingsRes.status,
        responseHeaders: safeHeaders,
        responseBody: errBody,
        containedReadings: false,
        readingsCount: 0,
        error_code: errorCode,
        dexcom_error_code: errCode,
        dexcom_error_message: errMsg,
        durationMs: pollDurationMs,
      }));

      return diag;
    }

    const readingsData = await readingsRes.json();
    const records = Array.isArray(readingsData) ? readingsData : [];
    diag.records_returned = records.length;
    diag.poll_status = "successful";

    // Parse newest/oldest timestamps from the raw response
    let newestReadingTs: string | null = null;
    let oldestReadingTs: string | null = null;
    for (const rec of records) {
      const dt = parseShareTimestamp(rec.DT || rec.ST || rec.WT);
      if (!dt) continue;
      const iso = dt.toISOString();
      if (!newestReadingTs || iso > newestReadingTs) newestReadingTs = iso;
      if (!oldestReadingTs || iso < oldestReadingTs) oldestReadingTs = iso;
    }

    console.log(JSON.stringify({
      diagStage: "DEXCOM_RESPONSE",
      step: "readings",
      httpStatus: readingsRes.status,
      responseHeaders: safeHeaders,
      containedReadings: records.length > 0,
      readingsCount: records.length,
      newestReadingTimestamp: newestReadingTs,
      oldestReadingTimestamp: oldestReadingTs,
      durationMs: pollDurationMs,
    }));

    if (!records.length) {
      diag.status = "no_new_records";
      console.log(JSON.stringify({
        diagStage: "DATA_PROCESSING",
        error_code: "DEXCOM_EMPTY_RESPONSE",
        message: "Dexcom returned 0 readings",
      }));
      return diag;
    }

    const lookbackStart = new Date(now.getTime() - (POLL_MINUTES + 10) * 60 * 1000);
    const existing = await sr.entities.GlucoseReading.filter(
      { user_id: owner, recorded_at: { $gte: lookbackStart.toISOString() } },
      "-recorded_at",
      200
    );

    const existingTimes = new Set();
    const manualReadings: any[] = [];
    for (const r of existing) {
      const t = new Date(r.recorded_at).getTime();
      if (Number.isNaN(t)) continue;
      if (r.source === "dexcom" || r.source === "dexcom_share") {
        existingTimes.add(t);
      } else if (r.source === "manual") {
        manualReadings.push({ id: r.id, time: t });
      }
    }

    const toCreate: any[] = [];
    const manualIdsToDelete = new Set();
    let latestTime: number | null = null;
    let latestValue: number | null = null;
    let latestTrend: string | null = null;
    let parseError: string | null = null;

    for (const rec of records) {
      const value = rec.Value ?? rec.value;
      if (value == null || !Number.isFinite(Number(value))) {
        diag.records_rejected++;
        continue;
      }

      const dt = parseShareTimestamp(rec.DT || rec.ST || rec.WT);
      if (!dt || Number.isNaN(dt.getTime())) {
        diag.records_rejected++;
        if (!parseError) parseError = "One or more readings had an unparseable timestamp";
        continue;
      }
      const ts = dt.getTime();

      let isDuplicate = false;
      for (const existingTs of existingTimes) {
        if (Math.abs(existingTs - ts) < DEDUP_WINDOW_MS) {
          isDuplicate = true;
          break;
        }
      }
      if (isDuplicate) {
        diag.records_ignored_duplicates++;
        continue;
      }
      existingTimes.add(ts);

      for (const manual of manualReadings) {
        if (Math.abs(manual.time - ts) < PROXIMITY_MS) {
          manualIdsToDelete.add(manual.id);
        }
      }

      const trend = rec.Trend || null;

      toCreate.push({
        user_id: owner,
        value: Number(value),
        recorded_at: dt.toISOString(),
        source: "dexcom_share",
        trend,
      });

      if (!latestTime || ts > latestTime) {
        latestTime = ts;
        latestValue = Number(value);
        latestTrend = trend;
      }

      diag.records_parsed++;
    }

    // ── [DIAG] DATA PROCESSING ──────────────────────────
    const newestIdentified = latestTime != null;
    console.log(JSON.stringify({
      diagStage: "DATA_PROCESSING",
      newestIdentified,
      readingTimestamp: latestTime ? new Date(latestTime).toISOString() : null,
      glucoseValue: latestValue,
      trend: latestTrend,
      consideredNew: toCreate.length > 0,
      alreadyStored: diag.records_ignored_duplicates,
      parseError,
      recordsParsed: diag.records_parsed,
      recordsRejected: diag.records_rejected,
    }));

    if (!newestIdentified) {
      diag.status = "no_new_records";
      console.log(JSON.stringify({
        diagStage: "DATA_PROCESSING",
        error_code: "DEXCOM_RESPONSE_PARSE_ERROR",
        message: parseError || "No valid reading identified from Dexcom response",
      }));
      return diag;
    }

    // ── [DIAG] DATABASE/STORAGE ─────────────────────────
    const dbStart = Date.now();
    let dbWriteOk = false;
    let dbError: string | null = null;
    let insertedIds: any[] = [];

    if (toCreate.length) {
      try {
        const created = await sr.entities.GlucoseReading.bulkCreate(toCreate);
        diag.records_inserted = toCreate.length;
        diag.inserted_timestamps = toCreate.map((r) => r.recorded_at);
        insertedIds = Array.isArray(created) ? created.map((r: any) => r?.id).filter(Boolean) : [];
        dbWriteOk = true;
      } catch (dbErr: any) {
        dbError = dbErr?.message || String(dbErr);
        console.log(JSON.stringify({
          diagStage: "DATABASE",
          error_code: "DATABASE_WRITE_ERROR",
          entity: "GlucoseReading",
          error: dbError,
          durationMs: Date.now() - dbStart,
        }));
        diag.status = "error";
        diag.error = `DATABASE_WRITE_ERROR: ${dbError}`;
        return diag;
      }
    }

    if (manualIdsToDelete.size) {
      try {
        await Promise.all(
          [...manualIdsToDelete].map((id) => sr.entities.GlucoseReading.delete(id))
        );
      } catch (delErr: any) {
        // Non-fatal — log but don't fail the sync
        console.log(JSON.stringify({
          diagStage: "DATABASE",
          warning: "manual_reading_delete_failed",
          error: delErr?.message || String(delErr),
        }));
      }
    }

    console.log(JSON.stringify({
      diagStage: "DATABASE",
      writeSucceeded: dbWriteOk,
      entity: "GlucoseReading",
      recordIds: insertedIds,
      recordsWritten: diag.records_inserted,
      durationMs: Date.now() - dbStart,
    }));

    if (latestTime) {
      diag.latest_glucose_timestamp = new Date(latestTime).toISOString();
      diag.latest_glucose_value = latestValue;
      diag.latest_glucose_trend = latestTrend;
      diag.latest_glucose_age = Math.round((now.getTime() - latestTime) / 60000) + "m";
    }

    diag.status = toCreate.length > 0 ? "synced" : "no_new_records";

    // ── [DIAG] FUNCTION RESPONSE ─────────────────────────
    console.log(JSON.stringify({
      diagStage: "FUNCTION_RESPONSE",
      status: diag.status,
      records_inserted: diag.records_inserted,
      latest_glucose_timestamp: diag.latest_glucose_timestamp,
      latest_glucose_value: diag.latest_glucose_value,
      totalDurationMs: Date.now() - fnStart,
    }));

    return diag;
  } catch (error: any) {
    diag.status = "error";
    // Only Share API errors (those carrying a shareCode from Dexcom) are
    // credential/auth failures. Plain errors — database timeouts, network
    // blips, platform hiccups — are transient and must NOT disconnect the
    // account, so the next sync can simply try again.
    if (error.shareCode === "AccountPasswordInvalid") {
      diag.auth_status = "failed_invalid_credentials";
    } else if (error.shareCode) {
      diag.auth_status = "failed";
    } else {
      diag.auth_status = "transient_error";
    }
    diag.error = error.shareCode || error.message;

    const errorCode =
      error.shareCode === "AccountPasswordInvalid" ? "DEXCOM_AUTH_ERROR"
      : error.shareCode ? "DEXCOM_API_ERROR"
      : "UNKNOWN_ERROR";

    console.log(JSON.stringify({
      diagStage: "FUNCTION_RESPONSE",
      error_code: errorCode,
      shareCode: error.shareCode || null,
      message: error.message,
      totalDurationMs: Date.now() - fnStart,
    }));

    return diag;
  }
}