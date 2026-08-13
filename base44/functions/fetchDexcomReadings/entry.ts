import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { DEXCOM_TOKEN_URL, DEXCOM_API_BASE } from "../../shared/dexcomConfig.ts";

// Scheduled auto-sync for connected glucose sources.
// Runs with the service role — there is no user context on a schedule.
// For every active Dexcom connection it refreshes the access token if it's
// about to expire, pulls new EGV readings since the last successful fetch,
// dedupes them against already-imported readings, and writes the new ones
// into the owning user's GlucoseReading records (source: "dexcom").

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

      try {
        let accessToken = conn.access_token;
        let refreshToken = conn.refresh_token;
        let expiresAt = conn.expires_at ? new Date(conn.expires_at) : null;

        // Refresh if the token is missing or expires within the next 5 minutes.
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
          } catch {
            await sr.entities.DexcomConnection.update(conn.id, { status: "error" });
            results.push({ owner, status: "refresh_failed" });
            continue;
          }
        }

        const lastFetched = conn.last_fetched_at ? new Date(conn.last_fetched_at) : null;

        // Ask Dexcom where data actually exists. The sandbox stores simulated
        // readings at a fixed historical range (not the current time), so a
        // naive "last 24h from now" window returns nothing. In production the
        // range end tracks ~now, so this same logic drives incremental sync.
        let rangeStart = null;
        let rangeEnd = null;
        let rawRange = null;
        try {
          const drRes = await fetch(`${DEXCOM_API_BASE}/users/self/dataRange`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (drRes.ok) {
            const dr = await drRes.json();
            rawRange = dr;
            const egvRange = Array.isArray(dr.egvs) ? dr.egvs[0] : dr.egvs;
            const pick = (v) => (typeof v === "string" ? v : (v && (v.systemTime || v.displayTime)) || null);
            if (egvRange) {
              if (pick(egvRange.start)) rangeStart = new Date(pick(egvRange.start));
              if (pick(egvRange.end)) rangeEnd = new Date(pick(egvRange.end));
            }
          }
        } catch { /* fall back to a time-based window below */ }

        const valid = (d) => d && !Number.isNaN(d.getTime());
        if (!valid(rangeStart)) rangeStart = null;
        if (!valid(rangeEnd)) rangeEnd = null;

        let startDate;
        let endDate = now;
        const MAX_RANGE_MS = 90 * 24 * 60 * 60 * 1000;
        if (rangeEnd) {
          endDate = rangeEnd.getTime() > now.getTime() ? now : rangeEnd;
          if (lastFetched && rangeStart && lastFetched.getTime() > rangeStart.getTime() && lastFetched.getTime() < rangeEnd.getTime()) {
            // Incremental: pick up where the last successful fetch left off.
            startDate = lastFetched;
          } else {
            // First pull (or sandbox re-query): start from the oldest available
            // reading. Dexcom caps any single EGV query at 90 days, so we walk
            // forward in ≤90-day chunks on successive runs until we catch up to
            // the most recent data. (In production rangeStart ≈ now, so this is
            // a single recent pull; in the sandbox the simulated readings live
            // at the historical start of the data range.)
            startDate = rangeStart || new Date(endDate.getTime() - MAX_RANGE_MS);
          }
        } else {
          endDate = now;
          startDate = (lastFetched && lastFetched.getTime() > now.getTime() - 24 * 60 * 60 * 1000)
            ? lastFetched
            : new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }
        // Dexcom rejects any EGV query wider than 90 days.
        endDate = new Date(Math.min(endDate.getTime(), startDate.getTime() + MAX_RANGE_MS));

        if (startDate.getTime() >= endDate.getTime()) {
          results.push({ owner, status: "ok", imported: 0, fetched: 0, range: { start: rangeStart, end: rangeEnd } });
          continue;
        }

        const egvRes = await fetch(
          `${DEXCOM_API_BASE}/users/self/egvs?startDate=${formatDexcomDate(startDate)}&endDate=${formatDexcomDate(endDate)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!egvRes.ok) {
          const errText = await egvRes.text();
          results.push({ owner, status: "fetch_failed", details: errText });
          continue;
        }

        const egvData = await egvRes.json();
        const egvs = egvData.egvs || egvData.EGVS || [];

        // Build a set of already-imported timestamps for this user to dedupe.
        const existing = await sr.entities.GlucoseReading.filter(
          { user_id: owner, source: "dexcom" },
          "-recorded_at",
          500
        );
        const existingTimes = new Set(
          existing.map((r) => new Date(r.recorded_at).getTime())
        );

        const toCreate = [];
        for (const egv of egvs) {
          const value = egv.value ?? egv.glucoseValue;
          if (value == null) continue;
          const dt = new Date(egv.displayTime || egv.systemTime);
          const ts = dt.getTime();
          if (Number.isNaN(ts) || existingTimes.has(ts)) continue;
          existingTimes.add(ts);
          toCreate.push({
            user_id: owner,
            value,
            recorded_at: dt.toISOString(),
            source: "dexcom",
          });
        }

        if (toCreate.length) {
          await sr.entities.GlucoseReading.bulkCreate(toCreate);
        }

        await sr.entities.DexcomConnection.update(conn.id, {
          last_fetched_at: endDate.toISOString(),
        });

        results.push({ owner, status: "ok", imported: toCreate.length, fetched: egvs.length, range: { start: rangeStart, end: rangeEnd } });
      } catch (error) {
        results.push({ owner, status: "error", details: error.message });
      }
    }

    return Response.json({ processed: connections.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}