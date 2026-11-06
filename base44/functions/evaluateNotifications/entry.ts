// The single HTTP entry point for Stackd notifications.
//
// Two requests, one canonical evaluator (../shared/notificationEvaluation.ts):
//   • { reading_id } — a single record was saved; evaluate that owner now
//   • { mode: "sweep" } — the 5-minute backup: time-based conditions, fresh
//     readings that were stored without being evaluated, and retries
//
// Authorization: the caller must be signed in AND an admin. The platform's
// workflow run arrives as an admin; a client can never reach this. No owner,
// recipient, value or category is ever read from the request — the reading is
// fetched again from the database and the owner comes from the stored record.
//
// A failure returns a short sanitized reason code, and the diagnostic detail
// (code, name, top stack frames) goes to restricted server logs only. Never a
// message body, a token, or a glucose value.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, currentUser, readBody, appOrigin } from "../../shared/sharingAccess.ts";
import { assertSchedulerCaller } from "../../shared/notificationCore.ts";
import { evaluateOwnerNotifications, sweepOwnerIds } from "../../shared/notificationEvaluation.ts";
import { dispatchErrorCode, reconcilePendingDispatches } from "../../shared/notificationIngest.ts";

function logFailure(stage: string, error: any, code: string) {
  console.error(
    JSON.stringify({
      diagStage: "EVALUATE_NOTIFICATIONS_FAILED",
      stage,
      error_code: code,
      error_name: String(error?.name || "Error").slice(0, 40),
      stack_head: String(error?.stack || "").split("\n").slice(0, 4).join(" | ").slice(0, 400),
    })
  );
}

export default async function (req: Request): Promise<Response> {
  let stage = "start";
  try {
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const base44 = createClientFromRequest(req);
    stage = "auth";
    const user = await currentUser(base44);
    const guard = assertSchedulerCaller(user);
    if (guard.error) return fail(guard.error, guard.status);

    stage = "body";
    const body = await readBody(req);
    const sr = base44.asServiceRole;
    const nowMs = Date.now();
    const origin = appOrigin(req);
    const absoluteUrl = (path: string) => `${origin}${path}`;

    // ── A genuine saved reading ──────────────────────────────────────────
    if (typeof body.reading_id === "string" && body.reading_id) {
      stage = "reading";
      let reading: any = null;
      try {
        reading = await sr.entities.GlucoseReading.get(body.reading_id);
      } catch {
        reading = null;
      }
      if (!reading?.id) return ok({ mode: "reading", evaluated: 0, reason: "no_reading" });

      // The owner comes from the stored record, never from the request.
      const ownerId = reading.user_id || reading.created_by_id;
      if (!ownerId) return ok({ mode: "reading", evaluated: 0, reason: "no_owner" });

      // Always decides from the newest stored measurement, never the event's
      // historic reading, so a backlog callback cannot replay an old crossing.
      const result = await evaluateOwnerNotifications({ sr, ownerId, nowMs, absoluteUrl });
      return ok({ mode: "reading", evaluated: 1, recipients: result.recipients, ...result.counters });
    }

    // ── The periodic sweep ───────────────────────────────────────────────
    // Never depends on a reading arriving: this is how a silent sensor, a
    // sustained high, and a deferred notification hand-off are all noticed.
    stage = "sweep_owners";
    const owners = await sweepOwnerIds(sr, nowMs);
    const counters: Record<string, number> = {};
    stage = "sweep_evaluate";
    for (const ownerId of owners) {
      const result = await evaluateOwnerNotifications({ sr, ownerId, nowMs, absoluteUrl });
      for (const [key, value] of Object.entries(result.counters)) {
        counters[key] = (counters[key] || 0) + Number(value);
      }
    }

    // Reconcile work a failed hand-off deferred, from the newest stored state.
    stage = "sweep_retries";
    const retries = await reconcilePendingDispatches({ sr, origin, nowMs });

    return ok({ mode: "sweep", owners: owners.length, retries, ...counters });
  } catch (error: any) {
    const code = dispatchErrorCode(error);
    logFailure(stage, error, code);
    return fail(code, 500);
  }
}