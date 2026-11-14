// The Settings hub is a summary, never a second copy of a sub-page: these pure
// helpers turn the data the sub-pages already own into the one-line values this
// page shows. Nothing here decides a threshold, a default or a rule — it only
// words what is already stored.

import { getSensorModel, getSensorSessionEndMs } from "./sensorSession.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** A reading older than this is reported as stopped. */
export const READINGS_STOPPED_MINUTES = 20;

/** A session inside this window is worth flagging before it lapses. */
export const SENSOR_ATTENTION_HOURS = 48;

/** "just now" / "2 min ago" / "3 hr ago" — the age of the newest reading. */
export function readingAgeLabel(atMs, nowMs = Date.now()) {
  if (!Number.isFinite(atMs)) return null;
  const minutes = Math.max(0, Math.floor((nowMs - atMs) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function shortDate(ms) {
  if (!Number.isFinite(ms)) return null;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(ms));
}

/** The owner's own alert choices, summarised. The wording is theirs, not advice. */
export function notificationsSummary({ personal, units } = {}) {
  if (personal?.master_enabled !== true) return "Off";
  const mmol = String(units ?? "").toLowerCase() === "mmol/l";
  const level = (value, fallback) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return mmol ? (Math.round((n / 18) * 10) / 10).toFixed(1) : String(Math.round(n));
  };
  return `On · low ${level(personal?.low_mgdl, mmol ? "3.9" : "70")} · high ${level(personal?.high_mgdl, mmol ? "10.0" : "180")}`;
}

/**
 * The one carb ratio the account actually stores, written the familiar way.
 * No ratio yet (or not yet confirmed) means no claim is made.
 */
export function insulinRatioLabel(unitsPer5g) {
  const units = Number(unitsPer5g);
  if (!Number.isFinite(units) || units <= 0) return null;
  const gramsPerUnit = Math.round((5 / units) * 10) / 10;
  return `1:${Number.isInteger(gramsPerUnit) ? gramsPerUnit : gramsPerUnit.toFixed(1)}`;
}

/** Day N of M, and when the wear time ends. */
export function sensorSessionSummary({ modelId, startedAtMs, remainingMs, nowMs = Date.now() } = {}) {
  const model = getSensorModel(modelId);
  if (!model || !Number.isFinite(startedAtMs)) {
    return { hasSession: false, value: null, note: null, expired: false, remainingMs: null };
  }
  const endMs = getSensorSessionEndMs(modelId, startedAtMs);
  const ended = Number.isFinite(remainingMs) && remainingMs <= 0;
  const day = Math.min(model.durationDays, Math.max(1, Math.floor((nowMs - startedAtMs) / DAY_MS) + 1));
  return {
    hasSession: true,
    model,
    remainingMs: Number.isFinite(remainingMs) ? remainingMs : null,
    expired: ended,
    value: ended ? "Session ended" : `Day ${day} of ${model.durationDays}`,
    note: `${ended ? "Ended" : "Expires"} ${shortDate(endMs)}`,
  };
}

/**
 * The status band: what the sensor is doing right now. When something is wrong
 * the band stops being a status and becomes the way to fix it.
 */
export function statusBand({ connection, modelId, latestAtMs, remainingMs, nowMs = Date.now() } = {}) {
  if (!connection) {
    return {
      tone: "attention",
      title: "Connect your glucose source",
      detail: "Link Dexcom to see your readings here.",
      to: "/settings/dexcom",
    };
  }
  if (connection.status !== "connected") {
    return {
      tone: "attention",
      title: "Connection dropped",
      detail: "Reconnect your glucose source to pick readings back up.",
      to: "/settings/dexcom",
    };
  }
  if (Number.isFinite(remainingMs) && remainingMs <= 0) {
    return {
      tone: "attention",
      title: "Sensor session ended",
      detail: "Start a new session to keep your readings coming.",
      to: "/settings/sensor",
    };
  }
  const model = getSensorModel(modelId || connection.cgm_model);
  const name = (model?.label || "Dexcom G7").replace("Dexcom ", "");
  if (!Number.isFinite(latestAtMs)) {
    return {
      tone: "attention",
      title: `Dexcom ${name} connected`,
      detail: "Waiting for your first reading to arrive.",
      to: "/settings/dexcom",
    };
  }
  const ageMinutes = Math.max(0, (nowMs - latestAtMs) / 60000);
  if (ageMinutes > READINGS_STOPPED_MINUTES) {
    return {
      tone: "attention",
      title: "Readings have stopped",
      detail: `Latest reading arrived ${readingAgeLabel(latestAtMs, nowMs)}.`,
      to: "/settings/dexcom",
    };
  }
  return {
    tone: "ok",
    title: `Dexcom ${name} connected`,
    detail: `Reading every 5 minutes · latest ${readingAgeLabel(latestAtMs, nowMs)}`,
    to: "/settings/dexcom",
  };
}

function sensorAttentionText(remainingMs) {
  if (!Number.isFinite(remainingMs)) return null;
  if (remainingMs <= 0) return "Sensor session has ended";
  const hours = Math.round(remainingMs / HOUR_MS);
  if (hours < 1) return "Sensor ends within the hour";
  return `Sensor ends in ${hours} hour${hours === 1 ? "" : "s"}`;
}

/**
 * Only the things worth a tap right now. An empty list means the block is not
 * rendered at all, so it can never leave a blank space on the page.
 */
export function attentionItems({ personal, sensor, connection, latestAtMs, nowMs = Date.now() } = {}) {
  const items = [];
  if (personal && personal.master_enabled !== true) {
    items.push({ key: "notifications", text: "Notifications are off", to: "/settings/notifications" });
  }
  if (
    sensor?.hasSession &&
    Number.isFinite(sensor.remainingMs) &&
    sensor.remainingMs <= SENSOR_ATTENTION_HOURS * HOUR_MS
  ) {
    const text = sensorAttentionText(sensor.remainingMs);
    if (text) items.push({ key: "sensor", text, to: "/settings/sensor" });
  }
  if (connection?.status === "connected" && (!Number.isFinite(latestAtMs) || nowMs - latestAtMs > READINGS_STOPPED_MINUTES * 60000)) {
    items.push({ key: "readings", text: "Readings have stopped", to: "/settings/dexcom" });
  }
  return items;
}