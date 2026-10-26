// Thin client for the sharing backend functions.
//
// The backend returns { ok: false, reason } rather than throwing, so this maps
// that into a rejected promise carrying the reason — components show a plain
// message and never a raw server string.

import { base44 } from "@/api/base44Client";
import { withTimeout } from "./pendingAction";

async function call(functionName, payload) {
  // Bounded: the SDK's request has no timeout of its own, so a stalled request
  // would otherwise leave a control waiting forever. A request that outlasts the
  // bound rejects with reason "timeout" and the caller recovers; its late answer
  // is discarded rather than applied.
  const response = await withTimeout(base44.functions.invoke(functionName, payload));
  const data = response?.data || {};
  if (data.ok !== true) {
    const error = new Error(data.reason || "request_failed");
    error.reason = data.reason || "request_failed";
    error.payload = data;
    throw error;
  }
  return data;
}

export const getSharingRelationships = () => call("getSharingRelationships", {});

export const createSharingInvitation = (invitedEmail, sharerDisplayName) =>
  call("createSharingInvitation", { invited_email: invitedEmail, sharer_display_name: sharerDisplayName });

export const redeemSharingInvitation = (token) => call("redeemSharingInvitation", { token });

export const updateSharingScopes = (accessId, action, extra = {}) =>
  call("updateSharingScopes", { access_id: accessId, action, ...extra });

export const getSharedWithMe = () => call("getSharedWithMe", {});

export const setFollowerPrefs = (accessId, followerPrefs) =>
  call("getSharedWithMe", { action: "set_prefs", access_id: accessId, follower_prefs: followerPrefs });

/** The sharer correcting the name their followers see. Nothing about access. */
export const setSharerDisplayName = (name) =>
  call("updateSharingScopes", { action: "set_display_name", sharer_display_name: name });

/** The follower's own decision to stop following. Narrowing, never widening. */
export const stopFollowing = (accessId) =>
  call("getSharedWithMe", { action: "stop_following", access_id: accessId });

export const getSharedView = (accessId) => call("getSharedView", { access_id: accessId });

/**
 * Publish the sharer's own position.
 *
 * `observedAt` is the position's own observation time from the device fix, so
 * the follower sees when someone was actually there rather than when the app
 * happened to send it. The server bounds it and falls back to its own time.
 * `source` records how the fix was obtained ("manual" or "foreground_auto") and
 * cannot widen anything.
 */
export const publishSharerLocation = (latitude, longitude, accuracyM, { observedAt = null, source = "manual" } = {}) =>
  call("publishSharerLocation", {
    latitude,
    longitude,
    accuracy_m: accuracyM,
    observed_at: observedAt,
    source,
  });

// The wording lives in ./sharingErrorCopy.js so it can be exercised directly.
export { describeSharingError } from "./sharingErrorCopy";