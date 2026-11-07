// Client for the notification backend.
//
// Same shape as the sharing client: the backend answers { ok: false, reason }
// rather than throwing, so this rejects with a reason the UI renders as plain
// words, never a raw server string.

import { base44 } from "@/api/base44Client";
import { withTimeout } from "@/lib/sharing/pendingAction";

async function call(functionName, payload, confirmWrite = false) {
  const request = base44.functions.invoke(functionName, payload);
  // A preference write must settle before the next queued intention is sent.
  // A local timeout cannot cancel a server write and could let it finish late.
  const response = await (confirmWrite ? request : withTimeout(request));
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
  call("updateNotificationPreferences", { preferences }, true);

export const saveFollowNotifications = (accessId, preferences) =>
  call("updateFollowNotificationPreferences", { access_id: accessId, preferences }, true);

export const savePushGrants = (accessId, grants) =>
  call("updateRelationshipPushGrants", { access_id: accessId, grants });

export const markNotificationRead = (deliveryId) =>
  call("markNotificationRead", { delivery_id: deliveryId });

const REASON_COPY = {
  notification_threshold_separation: 'Keep at least 20 mg/dL between your notification low and high.',
  notification_threshold_required: 'Choose a notification level before turning this on.',
  velocity_rate_required: 'Choose a minimum pace before turning this on.',
  invalid_custom_low_mgdl: 'Choose a notification low from 60 to 150 mg/dL.',
  invalid_custom_high_mgdl: 'Choose a notification high from 100 to 400 mg/dL.',
  invalid_velocity_rate: 'Choose a pace of 2 or 3 mg/dL per minute.',
  invalid_repeat_minutes: 'Choose one of the repeat options.',
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