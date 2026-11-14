// Writes a reminder for the signed-in person.
//
// The limits are enforced HERE, not in the browser: one basal row, one meal row
// and no more than three custom rows per account, a custom name that is real
// text of at most 40 characters, real days and a real time. An unrecognised
// value is refused rather than silently corrected.
//
// Records are written with the person's own client, so the entity's ownership
// rules decide what can be touched — this function never broadens that.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, currentUser, readBody, asArray } from "../../shared/sharingAccess.ts";
import { createLimitError, reminderPayload } from "../../shared/reminderSchedule.ts";

async function loadOwned(base44: any, id: string, userId: string) {
  try {
    const row = await base44.entities.Reminder.get(id);
    if (!row?.id) return null;
    return (row.user_id === userId || row.created_by_id === userId) ? row : null;
  } catch {
    return null;
  }
}

export default async function (req: Request): Promise<Response> {
  if (req.method !== "POST") return fail("method_not_allowed", 405);

  const base44 = createClientFromRequest(req);
  const user = await currentUser(base44);
  if (!user?.id) return fail("unauthorized", 401);

  const body = await readBody(req);
  const action = String(body?.action || "save");

  if (action === "delete") {
    const id = String(body?.id || "");
    if (!id) return fail("missing_id", 400);
    const row = await loadOwned(base44, id, user.id);
    if (!row) return fail("not_found", 404);
    await base44.entities.Reminder.delete(id);
    return ok({ deleted: id });
  }

  if (action === "toggle") {
    const id = String(body?.id || "");
    if (!id) return fail("missing_id", 400);
    const row = await loadOwned(base44, id, user.id);
    if (!row) return fail("not_found", 404);
    const updated = await base44.entities.Reminder.update(id, { enabled: body?.enabled === true });
    return ok({ reminder: updated });
  }

  const parsed = reminderPayload(body);
  if (parsed.error) return fail(parsed.error, 400);

  if (body?.id) {
    const row = await loadOwned(base44, String(body.id), user.id);
    if (!row) return fail("not_found", 404);
    if (String(row.type) !== String(parsed.value.type)) return fail("type_mismatch", 400);
    const updated = await base44.entities.Reminder.update(row.id, { ...parsed.value, user_id: user.id });
    return ok({ reminder: updated });
  }

  const existing = asArray(await base44.entities.Reminder.list({ limit: 20 }));
  const limitError = createLimitError(parsed.value.type, existing);
  if (limitError) return fail(limitError, 409);

  const created = await base44.entities.Reminder.create({ ...parsed.value, user_id: user.id });
  return ok({ reminder: created });
}