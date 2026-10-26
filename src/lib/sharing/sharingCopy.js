// Shared wording for the follower-sharing screens.
//
// One place for every label so the owner's view and the follower's view can
// never describe the same state in two different ways, and so all copy stays
// neutral and observational — it describes data, and never proposes a
// treatment or implies a judgement.

export const SCOPE_COPY = [
  {
    key: "glucose",
    label: "Glucose",
    blurb: "Readings from the last 24 hours, the latest value, and today's balance.",
  },
  {
    key: "insulin",
    label: "Insulin",
    blurb: "Recent doses and an estimated active rapid-acting figure when one can be worked out.",
  },
  {
    key: "location",
    label: "Latest location",
    blurb: "The most recent place published. Never a history of movement.",
  },
  {
    key: "urgent_low_call",
    label: "Can call during an urgent low",
    blurb: "Permission to place a person-to-person call. Shares no readings by itself.",
  },
];

export const ALERT_COPY = [
  {
    key: "urgent_low_email",
    label: "Email notice",
    blurb: "Sent when a fresh reading lands in the urgent low range.",
  },
  {
    key: "urgent_low_sms",
    label: "Text notice",
    blurb: "Not available yet: this app has no text-message provider connected.",
  },
];

export const STATUS_COPY = {
  pending: { label: "Invitation sent", tone: "waiting" },
  active: { label: "Active", tone: "on" },
  paused: { label: "Paused", tone: "waiting" },
  expired: { label: "Expired", tone: "off" },
  revoked: { label: "Revoked", tone: "off" },
};

export function describeStatus(status) {
  return STATUS_COPY[status] || { label: "Unknown", tone: "off" };
}

/** Why a value was not sent. Plain, non-clinical, never a suggestion. */
export function describeProjectionReason(reason) {
  switch (reason) {
    case "scope_off":
      return "Not shared with you.";
    case "paused":
      return "Sharing is paused.";
    case "revoked":
      return "Sharing was withdrawn.";
    case "expired":
      return "The invitation expired.";
    case "pending":
      return "Waiting for the invitation to be accepted.";
    case "none_published":
      return "Nothing has been published yet.";
    case "no_rapid_doses":
      // Not about a 24 hour window any more: it means nothing rapid-acting is
      // logged at all, so no figure can be worked out.
      return "Nothing rapid-acting has been logged, so this cannot be estimated yet.";
    case "unconfirmed_plan":
      return "Their insulin plan has not been confirmed yet.";
    case "unknown_type":
      return "An insulin type in this window is not recognised.";
    case "not_computable":
      return "An estimate could not be worked out.";
    default:
      return "Not available.";
  }
}

export function describeDirection(direction) {
  switch (direction) {
    case "climbing":
      return "Rising quickly";
    case "drifting up":
      return "Drifting up";
    case "falling":
      return "Falling quickly";
    case "drifting down":
      return "Drifting down";
    case "holding steady":
      return "Holding steady";
    default:
      return null;
  }
}

export function describeZone(zone) {
  switch (zone) {
    case "urgentLow":
      return "Urgent low";
    case "below":
      return "Below comfort zone";
    case "above":
      return "Above comfort zone";
    case "inRange":
      return "In comfort zone";
    default:
      return null;
  }
}

/** Age of the newest reading, in words. Used instead of a bare timestamp. */
export function describeReadingAge(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return "No reading available";
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${Math.round(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (hours < 24) return rest ? `${hours} hr ${rest} min ago` : `${hours} hr ago`;
  return "Over a day ago";
}

export function describeLocationAge(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return "Timestamp unavailable";
  if (minutes < 2) return "Published just now";
  if (minutes < 60) return `Published ${Math.round(minutes)} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Published ${hours} hr ago`;
  return `Published ${Math.floor(hours / 24)} day(s) ago`;
}

/**
 * What would actually reach the follower, given both sides.
 * "Armed" is deliberately distinct from "on": a channel the owner switched on
 * but the follower has not allowed is not live.
 */
export function describeAlertState(relationship, key) {
  const owner = Boolean(relationship?.alert_scopes?.[key]);
  if (!owner) return { state: "off", label: "Off" };
  const followerAllows = key === "urgent_low_email"
    ? Boolean(relationship?.follower_prefs?.notify_email)
    : Boolean(relationship?.follower_prefs?.notify_sms);
  if (!followerAllows) return { state: "armed", label: "Waiting for them to allow it" };
  return { state: "on", label: "On" };
}

export function summaryLine(scopes) {
  const on = SCOPE_COPY.filter((s) => scopes?.[s.key]).map((s) => s.label);
  if (on.length === 0) return "Nothing shared";
  if (on.length === SCOPE_COPY.length) return "Everything shared";
  return on.join(" · ");
}