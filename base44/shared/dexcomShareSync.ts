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
  now: Date
): Promise<any> {
  const owner = conn.created_by_id;
  if (!owner) return { status: "skipped_no_owner" };

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
    const sessionId = await getShareSessionId(username, password);
    diag.auth_status = "successful";
    diag.session_valid = true;

    const readingsUrl =
      `${DEXCOM_SHARE_BASE_URL_US}${DEXCOM_SHARE_READINGS_ENDPOINT}` +
      `?sessionId=${encodeURIComponent(sessionId)}` +
      `&minutes=${POLL_MINUTES}` +
      `&maxCount=${POLL_MAX_COUNT}`;

    const readingsRes = await fetch(readingsUrl, {
      method: "POST",
      headers: DEXCOM_SHARE_HEADERS,
      body: JSON.stringify({}),
    });

    if (!readingsRes.ok) {
      diag.poll_status = "failed";
      diag.status = readingsRes.status === 500 ? "session_expired" : "readings_request_failed";
      try {
        const errJson = await readingsRes.json();
        diag.error_detail = (errJson.Code || "").slice(0, 50);
      } catch {}
      return diag;
    }

    const readingsData = await readingsRes.json();
    const records = Array.isArray(readingsData) ? readingsData : [];
    diag.records_returned = records.length;
    diag.poll_status = "successful";

    if (!records.length) {
      diag.status = "no_new_records";
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

    for (const rec of records) {
      const value = rec.Value ?? rec.value;
      if (value == null || !Number.isFinite(Number(value))) {
        diag.records_rejected++;
        continue;
      }

      const dt = parseShareTimestamp(rec.DT || rec.ST || rec.WT);
      if (!dt || Number.isNaN(dt.getTime())) {
        diag.records_rejected++;
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

    if (toCreate.length) {
      await sr.entities.GlucoseReading.bulkCreate(toCreate);
      diag.records_inserted = toCreate.length;
      diag.inserted_timestamps = toCreate.map((r) => r.recorded_at);
    }

    if (manualIdsToDelete.size) {
      await Promise.all(
        [...manualIdsToDelete].map((id) => sr.entities.GlucoseReading.delete(id))
      );
    }

    if (latestTime) {
      diag.latest_glucose_timestamp = new Date(latestTime).toISOString();
      diag.latest_glucose_value = latestValue;
      diag.latest_glucose_trend = latestTrend;
      diag.latest_glucose_age = Math.round((now.getTime() - latestTime) / 60000) + "m";
    }

    diag.status = toCreate.length > 0 ? "synced" : "no_new_records";
    return diag;
  } catch (error: any) {
    diag.status = "error";
    diag.auth_status = error.shareCode === "AccountPasswordInvalid" ? "failed_invalid_credentials" : "failed";
    diag.error = error.shareCode || error.message;
    return diag;
  }
}