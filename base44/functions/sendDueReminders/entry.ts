// Sends anything due: the reminders a person set, and the three sensor session
// prompts. Runs from the scheduled workflow every 5 minutes, so it works with
// the app closed.
//
// Authorization: signed in AND admin — the platform's workflow run arrives as an
// admin, a client never can. No owner, time, name or payload is read from the
// request; the sweep decides everything from stored records.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, currentUser, appOrigin } from "../../shared/sharingAccess.ts";
import { assertSchedulerCaller } from "../../shared/notificationCore.ts";
import { runReminderSweep } from "../../shared/reminderDelivery.ts";

export default async function (req: Request): Promise<Response> {
  let stage = "start";
  try {
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const base44 = createClientFromRequest(req);
    stage = "auth";
    const user = await currentUser(base44);
    const guard = assertSchedulerCaller(user);
    if (guard.error) return fail(guard.error, guard.status);

    stage = "sweep";
    const origin = appOrigin(req);
    const counters = await runReminderSweep({
      sr: base44.asServiceRole,
      nowMs: Date.now(),
      absoluteUrl: (path: string) => `${origin}${path}`,
    });

    return ok({ mode: "reminders", ...counters });
  } catch (error: any) {
    console.error(JSON.stringify({
      diagStage: "SEND_DUE_REMINDERS_FAILED",
      stage,
      error_name: String(error?.name || "Error").slice(0, 40),
      stack_head: String(error?.stack || "").split("\n").slice(0, 4).join(" | ").slice(0, 400),
    }));
    return fail("reminder_send_failed", 500);
  }
}