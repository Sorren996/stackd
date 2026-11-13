// The whole of the admin-only native push delivery test.
//
// Deliberately narrow: one fixed notification, to the authenticated admin's own
// account, and nothing else. The recipient is always the caller's verified user
// id — never a value from the request — so no recipient, title, body, link or
// role can be overridden by a client. There is no broadcast path.
//
// Kept in a shared module so the authorization and recipient rules can be
// exercised by mocked tests without any real delivery.

export const TEST_PUSH_TITLE = "145 mg/dL →";
export const TEST_PUSH_MESSAGE = "Holding steady";
export const TEST_PUSH_IMAGE_URL =
  "https://media.base44.com/images/public/6ac18e6df0a84bf80842d5f0/38d56112a_stackd_push_arrow_flat.png";

// Fallback origin, used only when the caller cannot supply the app's own public
// origin (for example in a unit test).
export const DEFAULT_PUSH_ORIGIN = "https://stackdinsight.base44.app";

// Best-effort per-account cooldown so repeated taps cannot fan out sends.
// In-memory only — no entity or workflow exists just for this test facility.
export const TEST_PUSH_COOLDOWN_MS = 20_000;

const lastSendByUser = new Map<string, number>();

function isUnavailable(error: any) {
  const detail = String(error?.message || "");
  return /not configured|not available|no device|no push|credential|502|503/i.test(detail);
}

function isExtraFieldsRejection(error: any) {
  if (isUnavailable(error)) return false;
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  const detail = String(error?.message || "");
  if (
    /no device|no registered device|not registered|no (push )?subscription|has no device|no token|missing token|outside the app|not a member|no such user|unknown user/i.test(
      detail
    )
  ) {
    return false;
  }
  if (status === 400 || status === 422) return true;
  return /extra|field|schema|validation|invalid|unexpected|unrecognized|not permitted|forbidden|attachment|image|mutable|apns|fcm/i.test(
    detail
  );
}

export const RICH_IMAGE_FIELD_PATHS = [
  "image",
  "image_url",
  "attachment_url",
  "media_url",
  "mutable_content",
  "notification.image",
  "fcm_options.image",
  "apns.payload.aps.mutable-content",
  "apns.fcm_options.image",
  "aps.mutable-content",
  "data.image",
  "data.image_url",
  "data.attachment_url",
  "data.media_url",
  "ios_attachments.thumbnail",
  "big_picture",
  "richContent.image",
  "attachments",
];

const REDACTED_KEY_PATTERN =
  /token|secret|key|auth|credential|password|email|user_id|app_owner|phone|device_id|registration/i;

function scrubSensitiveText(input: string): string {
  return String(input || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi, "$1[redacted]")
    .replace(/\b[a-f0-9]{32,}\b/gi, "[redacted-token]")
    .replace(/\b[A-Za-z0-9_-]{28,}\b/g, "[redacted-token]")
    .slice(0, 300);
}

function summarizeProviderResponse(statusCode: number | null, raw: any) {
  let message = "OK";
  if (raw == null) {
    message = "Accepted (empty response body)";
  } else if (typeof raw === "string") {
    message = scrubSensitiveText(raw) || "OK";
  } else if (typeof raw === "object") {
    const safe: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (REDACTED_KEY_PATTERN.test(k)) continue;
      if (v == null || typeof v === "boolean" || typeof v === "number") {
        safe[k] = v;
      } else if (typeof v === "string") {
        safe[k] = scrubSensitiveText(v);
      } else if (Array.isArray(v)) {
        safe[k] = `[array:${v.length}]`;
      } else if (typeof v === "object") {
        safe[k] = "[object]";
      }
    }
    const serialized = JSON.stringify(safe);
    message = serialized === "{}" ? "Accepted" : scrubSensitiveText(serialized);
  } else {
    message = scrubSensitiveText(String(raw));
  }
  return { status: statusCode, message };
}

function buildDiagnostic(params: {
  fallbackUsed: boolean;
  providerStatus: number | null;
  providerRaw: any;
}) {
  return {
    transport:
      "Base44 Core.SendPushNotification (platform push API; documented input schema only accepts user_id, title, content, action_label, action_url)",
    image_fields_set: params.fallbackUsed ? [] : [...RICH_IMAGE_FIELD_PATHS],
    image_url: params.fallbackUsed ? null : TEST_PUSH_IMAGE_URL,
    // Even though aps['mutable-content']=1 and apns.payload.aps['mutable-content']=1
    // were passed in image_fields_set, Core.SendPushNotification strips undocumented
    // keys and does not let app code set mutable-content on the outgoing APNs payload.
    mutable_content: false,
    transport_accepts_image: false,
    provider_response: summarizeProviderResponse(params.providerStatus, params.providerRaw),
    notes:
      "cannot tell from this project whether the iOS wrapper includes a Notification Service Extension, because the native Xcode/Capacitor project lives outside this repository in Base44's build pipeline.",
  };
}

export function buildRichTestPushFields(imageUrl: string = TEST_PUSH_IMAGE_URL) {
  return {
    // Base44 / generic snake_case & common top-level fields
    image: imageUrl,
    image_url: imageUrl,
    attachment_url: imageUrl,
    media_url: imageUrl,
    mutable_content: true,
    // FCM HTTP v1 fields
    notification: { image: imageUrl },
    fcm_options: { image: imageUrl },
    apns: {
      payload: { aps: { "mutable-content": 1 } },
      fcm_options: { image: imageUrl },
    },
    // APNs direct fields + custom payload keys a Notification Service Extension may inspect
    aps: { "mutable-content": 1 },
    data: {
      image: imageUrl,
      image_url: imageUrl,
      attachment_url: imageUrl,
      media_url: imageUrl,
    },
    // Common provider SDK fields (OneSignal / Expo / generic attachments)
    ios_attachments: { thumbnail: imageUrl },
    big_picture: imageUrl,
    richContent: { image: imageUrl },
    attachments: [{ url: imageUrl, type: "image/png" }],
  };
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
  nowMs: number = Date.now(),
  origin: string = DEFAULT_PUSH_ORIGIN
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

  let fallbackUsed = false;
  let providerRaw: any = null;
  let providerStatus: number | null = 200;

  try {
    const baseMessage = {
      user_id: user.id,
      title: TEST_PUSH_TITLE,
      content: TEST_PUSH_MESSAGE,
      action_url: `${String(origin || "").replace(/\/+$/, "") || DEFAULT_PUSH_ORIGIN}/`,
    };
    const richMessage = {
      ...baseMessage,
      ...buildRichTestPushFields(TEST_PUSH_IMAGE_URL),
    };
    console.log(
      JSON.stringify({
        diagStage: "PUSH_PAYLOAD_TEST",
        mode: "rich_image_diagnostic",
        fields: Object.keys(richMessage).sort(),
      })
    );
    try {
      const response = await base44.asServiceRole.integrations.Core.SendPushNotification(richMessage);
      if (response?.ok === false || response?.success === false) {
        throw Object.assign(new Error("extra fields rejected"), { status: 422 });
      }
      providerRaw = response;
      providerStatus = typeof response?.status === "number" ? response.status : 200;
    } catch (richError: any) {
      if (!isExtraFieldsRejection(richError)) {
        throw richError;
      }
      fallbackUsed = true;
      console.warn(
        JSON.stringify({
          diagStage: "PUSH_PAYLOAD_TEST_FALLBACK",
          status: richError?.status || null,
          detail: String(richError?.message || "").slice(0, 200),
          fields: Object.keys(baseMessage).sort(),
        })
      );
      const fallbackResponse = await base44.asServiceRole.integrations.Core.SendPushNotification(
        baseMessage
      );
      providerRaw = {
        rich_rejected_status: Number(richError?.status ?? richError?.statusCode ?? 422),
        rich_rejected_message: scrubSensitiveText(String(richError?.message || "rejected")),
        fallback_result: summarizeProviderResponse(200, fallbackResponse).message,
      };
      providerStatus = typeof fallbackResponse?.status === "number" ? fallbackResponse.status : 200;
    }
  } catch (error: any) {
    lastSendByUser.delete(user.id);
    const errStatus = Number(error?.status ?? error?.statusCode ?? 0) || null;
    console.error(
      "[sendMyTestPushNotification] push send failed:",
      errStatus || "",
      scrubSensitiveText(String(error?.message || ""))
    );
    const unavailable = isUnavailable(error);
    return {
      status: unavailable ? 503 : 502,
      body: {
        error: unavailable
          ? "Push notifications are not available for this app yet. Confirm native push is enabled for the iOS build, then try again."
          : "We could not submit the test notification. Please try again in a moment.",
        diagnostic: buildDiagnostic({
          fallbackUsed,
          providerStatus: errStatus,
          providerRaw: String(error?.message || "push send failed"),
        }),
      },
    };
  }

  // The API accepting the send is not proof of delivery, so only that is
  // reported — never "delivered" or "received".
  return {
    status: 200,
    body: {
      ok: true,
      diagnostic: buildDiagnostic({
        fallbackUsed,
        providerStatus,
        providerRaw,
      }),
    },
  };
}