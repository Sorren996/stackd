import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { secrets } from "base44:runtime";
import {
  DEXCOM_SHARE_BASE_URL_US,
  DEXCOM_SHARE_APPLICATION_ID_US,
  DEXCOM_SHARE_AUTHENTICATE_ENDPOINT,
  DEXCOM_SHARE_LOGIN_ENDPOINT,
  DEXCOM_SHARE_READINGS_ENDPOINT,
  DEXCOM_SHARE_HEADERS,
  DEXCOM_SHARE_DEFAULT_UUID,
} from "../../shared/dexcomShareConfig.ts";

// ── Dexcom Share Sync ──────────────────────────────────────────
// Pulls near-real-time glucose readings from the Dexcom Share service.
//
// Share authenticates with the PRIMARY account's username/password (stored as
// app secrets) and returns readings within minutes of the sensor reading —
// much fresher than the ~1-hour delayed API V3 data.
//
// This is an OPTIONAL enhancement layer. If Share fails for any reason
// (auth changes, endpoint changes, session expiry, rate limits, outages),
// STACKD continues functioning normally using the official Dexcom API V3
// integration. Share data is informational display data only — never used for
// treatment decisions.
//
// Readings are written to the same GlucoseReading entity with
// source: "dexcom_share". The existing API V3 sync (fetchDexcomReadings)
// reconciles Share readings to canonical "dexcom" source when it later
// imports the same timestamp from the official API.

// ── Constants ────────────────────────────────────────────────

const POLL_MINUTES = 30; // Look back 30 minutes per poll
const POLL_MAX_COUNT = 6; // ~6 readings at 5-min intervals
const PROXIMITY_MS = 5 * 60 * 1000; // Override manual readings within 5 min
const DEDUP_WINDOW_MS = 60 * 1000; // 1-minute timestamp tolerance for dedup

// ── Helpers ───────────────────────────────────────────────────

// Parses Dexcom Share's Date(timestamp) format.
// Share returns: "Date(1691455258000-0400)" or "Date(1691455258000)"
// The epoch milliseconds are UTC-based regardless of the offset suffix.
function parseShareTimestamp(dtString) {
  if (!dtString) return null;
  const match = String(dtString).match(/Date\((\d+)/);
  if (!match) return null;
  const ms = parseInt(match[1], 10);
  if (Number.isNaN(ms)) return null;
  return new Date(ms);
}

// Validates that a UUID is present and not the all-zeros default.
function isCleanUuid(value) {
  if (!value) return false;
  const v = String(value).replace(/"/g, "").trim();
  return v.length > 0 && v !== DEXCOM_SHARE_DEFAULT_UUID;
}

// Sends a POST to the Share API and parses the JSON response.
// Throws with structured error info on failure.
async function sharePost(endpoint, body) {
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
    } catch {
      // Response not JSON — use status code only
    }
    const error = new Error(`Share request failed: ${res.status}`);
    error.shareCode = errCode;
    error.shareMessage = errMsg;
    throw error;
  }

  return await res.json();
}

// Two-step Share authentication: username → accountId → sessionId.
async function getShareSessionId(username, password) {
  const applicationId = DEXCOM_SHARE_APPLICATION_ID_US;

  // Step 1: Authenticate with username/password → get accountId
  const accountId = await sharePost(DEXCOM_SHARE_AUTHENTICATE_ENDPOINT, {
    accountName: username,
    password: password,
    applicationId: applicationId,
  });

  if (!isCleanUuid(accountId)) {
    const error = new Error("Share authentication returned invalid account ID");
    error.shareCode = "InvalidAccountId";
    throw error;
  }

  // Step 2: Login with accountId/password → get sessionId
  const sessionId = await sharePost(DEXCOM_SHARE_LOGIN_ENDPOINT, {
    accountId: String(accountId).replace(/"/g, ""),
    password: password,
    applicationId: applicationId,
  });

  if (!isCleanUuid(sessionId)) {
    const error = new Error("Share login returned invalid session ID");
    error.shareCode = "InvalidSessionId";
    throw error;
  }

  return String(sessionId).replace(/"/g, "");
}

// ── Main ──────────────────────────────────────────────────────

export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const sr = base44.asServiceRole;

    const username = secrets.get("DEXCOM_SHARE_USERNAME");
    const password = secrets.get("DEXCOM_SHARE_PASSWORD");

    if (!username || !password) {
      return Response.json(
        { error: "Dexcom Share credentials not configured" },
        { status: 500 }
      );
    }

    // Find users with active Dexcom (OAuth API V3) connections.
    // Share readings are attributed to these users — they've already authorized
    // the official integration, so Share enhances their existing data.
    const connections = await sr.entities.DexcomConnection.filter({
      status: "connected",
    });

    if (!connections.length) {
      return Response.json({
        skipped: "no_connected_dexcom_accounts",
        message: "Connect Dexcom via Settings before Share can attribute readings.",
      });
    }

    const now = new Date();
    const results = [];

    for (const conn of connections) {
      const owner = conn.created_by_id;
      if (!owner) {
        results.push({ status: "skipped_no_owner" });
        continue;
      }

      // ── Sanitized diagnostic container (no credentials/tokens) ──
      const diag = {
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
        // ── 1. Authenticate ──────────────────────────────────
        const sessionId = await getShareSessionId(username, password);
        diag.auth_status = "successful";
        diag.session_valid = true;

        // ── 2. Fetch recent readings ────────────────────────
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
          diag.status =
            readingsRes.status === 500
              ? "session_expired"
              : "readings_request_failed";
          try {
            const errJson = await readingsRes.json();
            diag.error_detail = (errJson.Code || "").slice(0, 50);
          } catch {
            // Non-JSON error response
          }
          results.push(diag);
          continue;
        }

        const readingsData = await readingsRes.json();
        const records = Array.isArray(readingsData) ? readingsData : [];
        diag.records_returned = records.length;
        diag.poll_status = "successful";

        if (!records.length) {
          diag.status = "no_new_records";
          results.push(diag);
          continue;
        }

        // ── 3. Fetch existing readings for dedup ───────────
        // Check both "dexcom" and "dexcom_share" sources to prevent
        // duplicates when Share and API V3 cover overlapping timestamps.
        const lookbackStart = new Date(
          now.getTime() - (POLL_MINUTES + 10) * 60 * 1000
        );
        const existing = await sr.entities.GlucoseReading.filter(
          { user_id: owner, recorded_at: { $gte: lookbackStart.toISOString() } },
          "-recorded_at",
          200
        );

        const existingTimes = new Set();
        const manualReadings = [];
        for (const r of existing) {
          const t = new Date(r.recorded_at).getTime();
          if (Number.isNaN(t)) continue;
          if (r.source === "dexcom" || r.source === "dexcom_share") {
            existingTimes.add(t);
          } else if (r.source === "manual") {
            manualReadings.push({ id: r.id, time: t });
          }
        }

        // ── 4. Process and deduplicate records ─────────────
        const toCreate = [];
        const manualIdsToDelete = new Set();
        let latestTime = null;
        let latestValue = null;
        let latestTrend = null;

        for (const rec of records) {
          const value = rec.Value ?? rec.value;
          if (value == null || !Number.isFinite(Number(value))) {
            diag.records_rejected++;
            continue;
          }

          // Use DT (display time with offset) as primary, fall back to ST/WT
          const dt = parseShareTimestamp(rec.DT || rec.ST || rec.WT);
          if (!dt || Number.isNaN(dt.getTime())) {
            diag.records_rejected++;
            continue;
          }
          const ts = dt.getTime();

          // Dedup by timestamp proximity (within 1 minute for sensor timing variance)
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

          // Override manual readings within 5 minutes (CGM is more accurate)
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

        // ── 5. Store new readings ──────────────────────────
        if (toCreate.length) {
          await sr.entities.GlucoseReading.bulkCreate(toCreate);
          diag.records_inserted = toCreate.length;
        }

        // Remove manual readings superseded by Share data
        if (manualIdsToDelete.size) {
          await Promise.all(
            [...manualIdsToDelete].map((id) =>
              sr.entities.GlucoseReading.delete(id)
            )
          );
        }

        // ── 6. Update diagnostics ──────────────────────────
        if (latestTime) {
          diag.latest_glucose_timestamp = new Date(latestTime).toISOString();
          diag.latest_glucose_value = latestValue;
          diag.latest_glucose_trend = latestTrend;
          diag.latest_glucose_age =
            Math.round((now.getTime() - latestTime) / 60000) + "m";
        }

        diag.status = toCreate.length > 0 ? "synced" : "no_new_records";
        results.push(diag);
      } catch (error) {
        diag.status = "error";
        diag.auth_status =
          error.shareCode === "AccountPasswordInvalid"
            ? "failed_invalid_credentials"
            : "failed";
        // Sanitized error — never expose credentials, session IDs, or passwords
        diag.error = error.shareCode || error.message;
        results.push(diag);
      }
    }

    return Response.json({ processed: connections.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}