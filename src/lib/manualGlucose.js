import { base44 } from "@/api/base44Client";

// Manual glucose logging is one of two mutually exclusive ways readings can
// arrive. A sensor and hand-entered readings never share the same line, so this
// flag is only ever "on" while no CGM is feeding the app.
export const MANUAL_GLUCOSE_KEY = "manual_glucose_logging_enabled";

/** On by default: with no sensor there is no other way to log a reading. */
export function readManualGlucoseEnabled() {
  if (typeof window === "undefined") return true;
  const raw = window.localStorage.getItem(MANUAL_GLUCOSE_KEY);
  return raw === null ? true : raw === "true";
}

/** Write the choice on this device and tell the UI (the Log fan listens). */
export function cacheManualGlucoseEnabled(enabled) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MANUAL_GLUCOSE_KEY, String(enabled));
  window.dispatchEvent(new Event("insulin-settings-updated"));
}

/**
 * Persist the choice for every device without creating a settings row. Used
 * where the mode follows the sensor itself (a connection completing) rather
 * than a person turning the switch.
 */
export async function storeManualGlucoseEnabled(enabled) {
  cacheManualGlucoseEnabled(enabled);
  const rows = await base44.entities.UserSettings.list("-created_date", 1);
  const row = rows?.[0];
  if (row?.id) {
    await base44.entities.UserSettings.update(row.id, { [MANUAL_GLUCOSE_KEY]: enabled });
  }
}