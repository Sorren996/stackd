// Thin client for the sharing backend functions.
//
// The backend returns { ok: false, reason } rather than throwing, so this maps
// that into a rejected promise carrying the reason — components show a plain
// message and never a raw server string.

import { base44 } from "@/api/base44Client";

async function call(functionName, payload) {
  const response = await base44.functions.invoke(functionName, payload);
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

export const publishSharerLocation = (latitude, longitude, accuracyM) =>
  call("publishSharerLocation", { latitude, longitude, accuracy_m: accuracyM });

/** Plain, non-technical wording for every reason the backend can return. */
export function describeSharingError(error) {
  const reason = error?.reason || "";
  switch (reason) {
    case "invalid_email":
      return "That does not look like an email address.";
    case "cannot_invite_self":
      return "That is your own account.";
    case "already_shared":
      return "You are already sharing with that person.";
    case "too_many_invitations":
      return "Too many invitations in the last hour. Try again a little later.";
    case "too_many_followers":
      return "You have reached the limit of people who can follow you.";
    case "sharing_not_configured":
      return "Sharing is not switched on for this app yet.";
    case "missing_token":
      return "That invitation link is incomplete.";
    case "not_found":
      return "That invitation could not be found.";
    case "expired":
      return "That invitation has expired. Ask for a new one.";
    case "already_claimed":
      return "That invitation has already been accepted.";
    case "canceled":
      return "That invitation was cancelled.";
    case "email_mismatch":
      return "This invitation is for a different email address. Sign in with the address it was sent to.";
    case "revoked":
      return "Sharing for this person has been withdrawn.";
    case "paused":
      return "Sharing is paused.";
    case "forbidden":
      return "You do not have access to that.";
    case "glucose_scope_required_for_alerts":
      return "Turn on glucose sharing before switching on a notice.";
    case "call_permission_required":
      return "Turn on the call permission before releasing your number.";
    case "no_contact_number":
      return "Save your number first.";
    case "invalid_phone":
      return "That does not look like a phone number.";
    case "invalid_coordinates":
      return "Those coordinates could not be read.";
    case "unauthorized":
      return "Please sign in again.";
    default:
      return "Something went wrong. Please try again.";
  }
}