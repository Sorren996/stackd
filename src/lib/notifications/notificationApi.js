// Client for the notification backend.
//
// Same shape as the sharing client: the backend answers { ok: false, reason }
// rather than throwing, so this rejects with a reason the UI renders as plain
// words, never a raw server string.

import { base44 } from "@/api/base44Client";
import { withTimeout } from "@/lib/sharing/pendingAction";

async function call(functionName, payload) {
  const response = await withTimeout(base44.functions.invoke(functionName, payload));
  const data = response?.data || {};
  if (data.ok !== true) {
    const error = new Error(data.reason || "request_failed");
    error.reason = data.reason || "request_failed";
    throw error;
  }
  return data;
}

export const getNotificationCenter = () => call("getNotificationCenter", {});

export const savePersonalNotifications = (preferences) =>
  call("updateNotificationPreferences", { preferences });

export const saveFollowNotifications = (accessId, preferences) =>
  call("updateFollowNotificationPreferences", { access_id: accessId, preferences });

export const savePushGrants = (accessId, grants) =>
  call("updateRelationshipPushGrants", { access_id: accessId, grants });

export const markNotificationRead = (deliveryId) =>
  call("markNotificationRead", { delivery_id: deliveryId });

const REASON_COPY = {
  above_range_minutes_required: "Choose how long a high has to last before saving.",
  missing_delay_minutes_required: "Choose how long readings must be quiet before saving.",
  invalid_above_range_minutes: "That timing is not one of the options.",
  invalid_missing_delay_minutes: "That delay is not one of the options.",
  quiet_hours_required: "Choose a start and end for quiet hours.",
  invalid_timezone: "We could not use that time zone.",
  not_available: "This person is not sharing glucose with you right now.",
  revoked: "This relationship has ended.",
  forbidden: "That is not your setting to change.",
  unauthorized: "Please sign in again.",
  timeout: "That took too long. Please try again.",
};

export function describeNotificationError(error) {
  const reason = error?.reason || "";
  return REASON_COPY[reason] || "Something didn't go as expected. Please try again.";
}