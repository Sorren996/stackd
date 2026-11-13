// Notification-only clock-skew policy. Preserve measurement timestamps for keys
// and episode intervals; clamp only the age used by freshness checks.
export const PUSH_FUTURE_TOLERANCE_MINUTES = 2;
export function notificationAgeMinutes(at: number, nowMs: number): number | null {
  const age = (nowMs - at) / 60_000;
  if (!Number.isFinite(age) || age < -PUSH_FUTURE_TOLERANCE_MINUTES) return null;
  return Math.max(0, age);
}