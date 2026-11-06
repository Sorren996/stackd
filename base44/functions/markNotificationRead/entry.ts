// Mark one of the caller's own notifications as read.
//
// Only the recipient may do this, and only on their own row: the id from the
// request is checked against the authenticated account. "Read" is bookkeeping
// for the list — it is never resolved, acknowledged or a care decision.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, currentUser, readBody } from "../../shared/sharingAccess.ts";

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail("unauthorized", 401);

    const body = await readBody(req);
    if (typeof body.delivery_id !== "string" || !body.delivery_id) return fail("missing_delivery_id", 400);

    const sr = base44.asServiceRole;
    const row = await sr.entities.NotificationDelivery.get(body.delivery_id).catch(() => null);
    if (!row?.id) return fail("not_found", 404);
    if (row.recipient_user_id !== user.id) return fail("forbidden", 403);

    if (row.read_at) return ok({ read_at: row.read_at });

    const readAt = new Date().toISOString();
    await sr.entities.NotificationDelivery.update(row.id, { read_at: readAt });
    return ok({ read_at: readAt });
  } catch (error: any) {
    console.error("[markNotificationRead] failed:", error?.message || "unexpected error");
    return fail("server_error", 500);
  }
}