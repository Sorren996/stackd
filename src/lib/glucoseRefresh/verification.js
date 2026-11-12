// Freshness language for the glucose hero.
//
// Presentation only. Nothing here reads or writes glucose, insulin or alert
// data, and no threshold is redefined: the stale window is the app's existing
// one (STALE_READING_MINUTES), imported rather than restated.
//
// The one rule this file exists for: a returned database row is not proof that
// the source was checked. Only a server payload that says the upstream source
// answered this round may be presented as a completed check.

import { STALE_READING_MINUTES } from "../glucoseStaleness.js";

export const CHECKING_COPY = "Receiving your latest reading…";
export const REFRESH_ERROR_COPY = "Couldn’t refresh your reading. Please try again.";

export const VERIFICATION = {
  IDLE: "idle",
  PENDING: "pending",
  CONFIRMED_NO_NEW: "confirmed_no_new",
  NEW_READING: "new_reading",
  SOURCE_ERROR: "source_error",
  UNVERIFIED: "unverified",
};

// Statuses the sync loop can only produce AFTER the upstream source answered.
const SOURCE_ANSWERED = new Set(["synced", "no_new_records"]);
// Configuration states the app already surfaces in its own connection UI.
const SOURCE_CONFIG = new Set(["not_connected", "no_credentials"]);

/**
 * Maps a pollDexcomNow payload onto one verification verdict.
 *
 * - confirmed_no_new: the source answered this round and has nothing newer.
 * - new_reading:      the source answered and gave a newer measurement.
 * - pending:          the source was skipped (fresh cache, in-flight lock), so
 *                     freshness was not established either way.
 * - source_error:     the connection itself is not usable right now.
 * - unverified:       nothing proves a current check (thrown, timeout, unknown).
 */
export function normalizeSourceVerification(payload) {
  const base = {
    verification: VERIFICATION.UNVERIFIED,
    sourceCheckSuccess: false,
    sourceCheckedAt: null,
    latestSourceMeasurementAt: null,
    noNewReading: false,
    status: null,
  };
  if (!payload || typeof payload !== "object") return base;

  const status = typeof payload.status === "string" ? payload.status : null;
  const successFlag = payload.source_check_success;
  const answered = {
    sourceCheckSuccess: true,
    sourceCheckedAt: payload.source_checked_at || null,
    latestSourceMeasurementAt: payload.latest_source_measurement_at || null,
    status,
  };

  // Server metadata is authoritative whenever it is present.
  if (successFlag === true) {
    const noNew =
      payload.no_new_reading === true ||
      payload.verification === VERIFICATION.CONFIRMED_NO_NEW;
    return {
      ...answered,
      verification: noNew ? VERIFICATION.CONFIRMED_NO_NEW : VERIFICATION.NEW_READING,
      noNewReading: noNew,
    };
  }
  if (successFlag === false) {
    return {
      ...base,
      status,
      verification: SOURCE_CONFIG.has(status)
        ? VERIFICATION.SOURCE_ERROR
        : status === "error"
          ? VERIFICATION.UNVERIFIED
          : VERIFICATION.PENDING,
    };
  }

  // Older server without the metadata: only a status the sync loop can only
  // reach after a real upstream read counts as a check.
  if (SOURCE_ANSWERED.has(status)) {
    const noNew = (payload.records_inserted || 0) === 0;
    return {
      ...answered,
      verification: noNew ? VERIFICATION.CONFIRMED_NO_NEW : VERIFICATION.NEW_READING,
      noNewReading: noNew,
    };
  }
  if (SOURCE_CONFIG.has(status)) return { ...base, status, verification: VERIFICATION.SOURCE_ERROR };
  if (status === "error") return { ...base, status, verification: VERIFICATION.UNVERIFIED };
  return { ...base, status, verification: VERIFICATION.PENDING };
}

/**
 * What the hero may say right now.
 *
 * `showStaleWarning` is deliberately narrow: the reading must be past the
 * app's existing stale window AND this lifecycle must have a completed check.
 * A failed or skipped check is never turned into a claim about the sensor.
 */
export function deriveGlucoseFreshness({
  reading,
  now = Date.now(),
  connected = false,
  verification = VERIFICATION.IDLE,
  checking = false,
  staleMinutes = STALE_READING_MINUTES,
}) {
  const recordedAt = reading?.recorded_at ? Date.parse(reading.recorded_at) : NaN;
  const value = Number(reading?.value);
  const hasReading =
    Number.isFinite(recordedAt) &&
    Number.isFinite(value) &&
    value > 0 &&
    recordedAt <= now + 60 * 1000;

  const ageMs = hasReading ? Math.max(0, now - recordedAt) : null;
  const overThreshold = ageMs != null && ageMs >= staleMinutes * 60 * 1000;
  const answered =
    verification === VERIFICATION.CONFIRMED_NO_NEW || verification === VERIFICATION.NEW_READING;
  // No completed check yet in this lifecycle: a request is running, or one has
  // simply not started. Either way nothing may be claimed about the source.
  const awaiting = checking || verification === VERIFICATION.IDLE;

  return {
    hasReading,
    ageMs,
    ageMinutes: ageMs == null ? null : Math.floor(ageMs / 60000),
    overThreshold,
    staleMinutes,
    answered,
    awaiting,
    showChecking: Boolean(connected) && awaiting && overThreshold,
    showRefreshError:
      Boolean(connected) && !awaiting && verification === VERIFICATION.UNVERIFIED,
    // A newer reading that is itself already stale is the same confirmed-stale
    // state: the source answered and this is the newest measurement it has.
    showStaleWarning: Boolean(connected) && !awaiting && answered && overThreshold,
  };
}