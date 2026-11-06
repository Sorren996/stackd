// The whole of the admin-only native push delivery test.
//
// Deliberately narrow: one fixed notification, to the authenticated admin's own
// account, and nothing else. The recipient is always the caller's verified user
// id — never a value from the request — so no recipient, title, body, link or
// role can be overridden by a client. There is no broadcast path.
//
// Kept in a shared module so the authorization and recipient rules can be
// exercised by mocked tests without any real delivery.

export const TEST_PUSH_TITLE = "Stackd test notification";
export const TEST_PUSH_MESSAGE =
  "This is a delivery test. No glucose alert has been triggered.";

// Best-effort per-account cooldown so repeated taps cannot fan out sends.
// In-memory only — no entity or workflow exists just for this test facility.
export const TEST_PUSH_COOLDOWN_MS = 20_000;

const lastSendByUser = new Map<string, number>();

function isUnavailable(error: any) {
  const detail = String(error?.message || "");
  return /not configured|not available|no device|no push|credential|502|503/i.test(detail);
}

/**
 * Runs one test send and returns { status, body } for the caller to relay.
 *
 * `user` must come from base44.auth.me() on the server — the role check and the
 * recipient both read from it, never from the request payload.
 */
export async function runTestPushNotification(
  base44: any,
  user: any,
  nowMs: number = Date.now()
): Promise<{ status: number; body: Record<string, any> }> {
  if (!user?.id) {
    return { status: 401, body: { error: "Please sign in to continue." } };
  }

  if (user.role !== "admin") {
    return { status: 403, body: { error: "This test is only available to admins." } };
  }

  const last = lastSendByUser.get(user.id) || 0;
  const waitMs = TEST_PUSH_COOLDOWN_MS - (nowMs - last);
  if (last > 0 && waitMs > 0) {
    return {
      status: 429,
      body: { error: `A test was just submitted. Try again in ${Math.ceil(waitMs / 1000)}s.` },
    };
  }

  // Claim the slot before sending so a double tap cannot slip through.
  lastSendByUser.set(user.id, nowMs);

  try {
    await base44.asServiceRole.integrations.Core.SendPushNotification({
      user_id: user.id,
      title: TEST_PUSH_TITLE,
      content: TEST_PUSH_MESSAGE,
    });
  } catch (error: any) {
    lastSendByUser.delete(user.id);
    console.error(
      "[sendMyTestPushNotification] push send failed:",
      error?.status || "",
      error?.message || ""
    );
    const unavailable = isUnavailable(error);
    return {
      status: unavailable ? 503 : 502,
      body: {
        error: unavailable
          ? "Push notifications are not available for this app yet. Confirm native push is enabled for the iOS build, then try again."
          : "We could not submit the test notification. Please try again in a moment.",
      },
    };
  }

  // The API accepting the send is not proof of delivery, so only that is
  // reported — never "delivered" or "received".
  return { status: 200, body: { ok: true } };
}