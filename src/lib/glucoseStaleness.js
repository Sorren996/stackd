// Stale-reading contingency helpers. When a Dexcom-connected user hasn't
// received a fresh CGM reading within the threshold window, the app calmly
// signals that the data stream has gone quiet and recovers automatically.

export const STALE_READING_MINUTES = 15;
const MINUTE_MS = 60 * 1000;

/**
 * Returns the most recent Dexcom-sourced reading from a list, or null.
 * Used so staleness is always measured against the CGM stream — never a
 * stray manual reading — while a Dexcom connection is active.
 */
export function getLatestDexcomReading(glucoseReadings) {
  if (!Array.isArray(glucoseReadings)) return null;
  let latest = null;
  let latestTime = -Infinity;

  for (const r of glucoseReadings) {
    if (r.source !== "dexcom" && r.source !== "dexcom_share") continue;
    const t = new Date(r.recorded_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (t > latestTime) {
      latestTime = t;
      latest = r;
    }
  }

  return latest;
}

/**
 * True when a Dexcom connection is active AND the latest Dexcom reading is
 * older than the staleness threshold. Manual-entry users and disconnected
 * sources are never flagged.
 */
export function computeGlucoseStale(latestDexcomReading, dexcomConnected) {
  if (!dexcomConnected || !latestDexcomReading) return false;
  const recordedAt = new Date(latestDexcomReading.recorded_at).getTime();
  if (!Number.isFinite(recordedAt)) return false;
  return Date.now() - recordedAt >= STALE_READING_MINUTES * MINUTE_MS;
}

/**
 * Formats the age of a reading as a short relative label ("15m ago", "2h ago").
 */
export function formatReadingAge(recordedAt) {
  if (!recordedAt) return null;
  const ms = Date.now() - new Date(recordedAt).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const minutes = Math.floor(ms / MINUTE_MS);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m ago` : `${hours}h ago`;
}