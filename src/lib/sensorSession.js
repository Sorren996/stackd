// Sensor session countdown helpers. Durations reflect true wear time
// (grace period excluded) so the 24h warning aligns with when the sensor
// actually stops reading.

const DAY_MS = 24 * 60 * 60 * 1000;

export const SENSOR_MODELS = {
  G6: {
    id: "G6",
    label: "Dexcom G6",
    durationDays: 10,
    image: "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/337f55d82_DG6.png",
  },
  G7: {
    id: "G7",
    label: "Dexcom G7",
    durationDays: 10,
    image: "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/45bd3031b_DG7.png",
  },
  G7_15: {
    id: "G7_15",
    label: "Dexcom G7 (15-day)",
    durationDays: 15,
    image: "https://media.base44.com/images/public/6a1b93f234a8611ee1595134/45bd3031b_DG7.png",
  },
};

export const SENSOR_MODEL_IDS = Object.keys(SENSOR_MODELS);

export function getSensorModel(modelId) {
  return SENSOR_MODELS[modelId] || null;
}

export function getSensorSessionEndMs(modelId, startedAtMs) {
  const model = getSensorModel(modelId);
  if (!model || !Number.isFinite(startedAtMs)) return null;
  return startedAtMs + model.durationDays * DAY_MS;
}

export function getRemainingMs(modelId, startedAtMs, now = Date.now()) {
  const end = getSensorSessionEndMs(modelId, startedAtMs);
  if (end === null) return null;
  return end - now;
}

export function isSessionExpiringSoon(remainingMs) {
  return remainingMs !== null && remainingMs < DAY_MS && remainingMs > 0;
}

export function isSessionExpired(remainingMs) {
  return remainingMs !== null && remainingMs <= 0;
}

// The banner shows for the final 24h and stays through expiry until a new
// session is started.
export function shouldShowSessionBanner(remainingMs) {
  return remainingMs !== null && remainingMs < DAY_MS;
}

export function formatRemaining(remainingMs) {
  if (remainingMs === null) return null;
  if (remainingMs <= 0) return { expired: true, text: "Session complete" };

  const totalMinutes = Math.floor(remainingMs / (60 * 1000));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return { expired: false, days, hours, minutes, text: `${days}d ${hours}h left` };
  }
  if (hours > 0) {
    return { expired: false, days: 0, hours, minutes, text: `${hours}h ${minutes}m left` };
  }
  return { expired: false, days: 0, hours: 0, minutes, text: `${minutes}m left` };
}