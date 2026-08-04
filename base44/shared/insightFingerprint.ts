// Deterministic insight fingerprinting and deduplication helpers for the
// AI Coach Insight Engine. The fingerprint is the key used to prevent the
// same event or pattern from producing duplicate insights.

export function buildInsightFingerprint(
  userId: string,
  eventId: string | null | undefined,
  category: string,
  patternId: string | null | undefined,
  analysisVersion: string
): string {
  return [
    "insight",
    userId || "user",
    eventId || "event",
    category || "category",
    patternId || "pattern",
    analysisVersion,
  ].join(":");
}

// Returns true when an existing insight with this fingerprint is still within
// its cooldown window, meaning a new one should not be generated.
export function isWithinCooldown(
  lastGeneratedAt: string | null | undefined,
  cooldownMs: number
): boolean {
  if (!lastGeneratedAt || !Number.isFinite(cooldownMs)) return false;
  const last = new Date(lastGeneratedAt).getTime();
  if (!Number.isFinite(last)) return false;
  return Date.now() - last < cooldownMs;
}