// Admin-only delivery test for native push notifications.
//
// The request payload is never read: the recipient is the authenticated
// admin's own verified user id, and the title and message are fixed, so no
// client value can change who is notified or what is sent.
//
// The service role is reached only after the sign-in and admin checks pass,
// in base44/shared/testPushNotification.ts.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { runTestPushNotification } from "../../shared/testPushNotification.ts";
import { appOrigin } from "../../shared/sharingAccess.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth
      .me()
      .catch((e: any) => (e?.status === 401 ? null : Promise.reject(e)));

    // The app's own public origin, taken from the platform-set header, so the
    // rich-attachment diagnostic test carries the same tapping link a real alert carries.
    const { status, body } = await runTestPushNotification(base44, user, Date.now(), appOrigin(req));
    return Response.json(body, { status });
  } catch (error: any) {
    console.error("[sendMyTestPushNotification]", error?.message || "unexpected error");
    return Response.json(
      { error: "Something went wrong submitting the test notification." },
      { status: 500 }
    );
  }
}