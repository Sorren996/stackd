// The foreground location updater's rules, kept apart from the component so
// they can be exercised without a browser or a device.
//
// Nothing here fetches a position, talks to the network, or touches storage. It
// answers one question: given the current opt-in, the relationship list, the
// app's visibility and the device's state, may a fresh position be fetched and
// published right now — and if not, why not.
//
// The server re-checks the identity and the relationship side of this on every
// publish, so a stale client can never widen anything.

/** How often a fresh position may be published while the app is open. */
export const LIVE_LOCATION_MIN_INTERVAL_MS = 5 * 60 * 1000;

/** A device fix older than this is not current, so it is not republished. */
export const LIVE_LOCATION_MAX_FIX_AGE_MS = 5 * 60 * 1000;

/**
 * Does any ACTIVE relationship currently include the location scope?
 * Only the sharer's own relationships, only the explicit scope flag.
 */
export function hasActiveLocationFollower(relationships) {
  return (Array.isArray(relationships) ? relationships : []).some(
    (relationship) => relationship?.status === "active" && relationship?.scopes?.location === true
  );
}

/**
 * May we publish right now? Every condition is required.
 *
 * `permissionState` is the browser's own answer where it is available
 * ("granted" | "denied" | "prompt"), or "unknown". A denied permission stops
 * everything: the updater must never keep asking a person who has said no.
 */
export function shouldPublishLocation({
  enabled = false,
  hasLocationFollower = false,
  visible = false,
  geolocationAvailable = true,
  permissionState = "unknown",
  online = true,
  inFlight = false,
  lastPublishedAt = null,
  now = Date.now(),
} = {}) {
  if (!enabled) return { publish: false, reason: "not_enabled" };
  if (!hasLocationFollower) return { publish: false, reason: "no_active_location_scope" };
  if (!geolocationAvailable) return { publish: false, reason: "unsupported" };
  if (!visible) return { publish: false, reason: "hidden" };
  if (!online) return { publish: false, reason: "offline" };
  if (permissionState === "denied") return { publish: false, reason: "permission_denied" };
  if (inFlight) return { publish: false, reason: "already_running" };

  const last = Number(lastPublishedAt);
  if (Number.isFinite(last) && now - last < LIVE_LOCATION_MIN_INTERVAL_MS) {
    return { publish: false, reason: "throttled" };
  }

  return { publish: true, reason: null };
}

/**
 * The position's own observation time, taken from the device fix rather than
 * from when the request happened to be sent.
 *
 * Returns null when the fix carries no usable time, when it claims to be in the
 * future, or when it is older than a current fix should be — the caller then
 * leaves the observation time to the server instead of relabelling an old fix
 * as a new one.
 */
export function observedAtFromFix(fixTimestamp, now = Date.now()) {
  const t = Number(fixTimestamp);
  if (!Number.isFinite(t) || t <= 0) return null;
  const age = now - t;
  if (age < 0 || age > LIVE_LOCATION_MAX_FIX_AGE_MS) return null;
  return new Date(t).toISOString();
}