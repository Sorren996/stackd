// Plain, non-technical wording for every reason the sharing backend can return.
//
// Kept free of any client import so it can be exercised directly by tests.

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
    case "missing_access_id":
      return "That invitation could not be found.";
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
    case "already_revoked":
      return "Sharing for this person has already been withdrawn.";
    case "paused":
      return "Sharing is paused.";
    case "not_active":
      return "Sharing is not running for this person right now.";
    case "not_paused":
      return "Sharing is not paused for this person.";
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
    case "timeout":
      return "That took too long to come back. Please check your connection and try again.";
    case "unauthorized":
      return "Please sign in again.";
    default:
      return "Something went wrong. Please try again.";
  }
}