// Can this recipient actually be reached?
//
// Every push is addressed to the recipient's OWN account id, so a follower's
// install must be registered under the follower's account, never the sharer's.
// When the platform answers that it cannot address that account, the notice was
// never sent — recording that as "transport_failed" told the sharer to believe
// alerts were arriving when they were not.
//
// Two honest reasons, both retryable:
//   • no_device_token       — the account exists but no device is registered yet
//                             (they have not opened Stackd on a phone).
//   • recipient_not_member  — the account is no longer an app member at all.
//
// Nothing here reads a device token: the app never sees one, and it must not
// pretend to. It classifies what the transport said and what the delivery rows
// already recorded.

export const NO_DEVICE_REASON = 'no_device_token';
export const NOT_MEMBER_REASON = 'recipient_not_member';

/** Backoff for a recipient with no device yet. Bounded elsewhere. */
export const DEVICE_RETRY_BASE_MS = 5 * 60 * 1000;

/**
 * Why a push could not be submitted, or null when the failure is an ordinary
 * transport problem that the existing classification already covers.
 */
export function classifyRecipientRefusal(error: any): string | null {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const message = String(error?.message ?? '');
  if (!Number.isFinite(status) || status < 400 || status >= 500) return null;
  // A recipient the app does not know at all.
  if (/outside the app|not a member|no such user|unknown user/i.test(message)) return NOT_MEMBER_REASON;
  // An account with no device registered yet. Deliberately narrow: a merely
  // rejected token is a transport refusal, not an unreachable recipient.
  if (/no device|no registered device|not registered|no (push )?subscription|has no device|no token|missing token/i.test(message)) {
    return NO_DEVICE_REASON;
  }
  if (status === 404) return NOT_MEMBER_REASON;
  return null;
}

export type Reachability = 'reachable' | 'no_device' | 'not_member' | 'unknown';

/** Reachability from what delivery rows already recorded — never a guess. */
export function reachabilityFromRows(rows: any[]): Reachability {
  const list = Array.isArray(rows) ? rows : [];
  if (list.some((row) => row?.status === 'submitted')) return 'reachable';
  if (list.some((row) => row?.reason === NO_DEVICE_REASON)) return 'no_device';
  if (list.some((row) => row?.reason === NOT_MEMBER_REASON)) return 'not_member';
  return 'unknown';
}