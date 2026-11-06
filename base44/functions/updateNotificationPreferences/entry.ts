// Save one person's own notification preferences.
//
// The owner is always the authenticated caller, so a request cannot write
// another account's settings. Timings are only stored when they are one of the
// offered values, and turning a category on without choosing its timing is
// refused rather than quietly defaulted.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, asArray, currentUser, readBody, audit } from "../../shared/sharingAccess.ts";
import {
  sanitizePersonalPreferences,
  type PersonalPreferences,
} from "../../shared/notificationCore.ts";

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail("unauthorized", 401);

    const body = await readBody(req);
    const sr = base44.asServiceRole;

    const existingRows = asArray(
      await sr.entities.NotificationPreference.filter({ user_id: user.id }, { sort: "-created_date", limit: 1 })
    );
    const existing = existingRows[0] || null;

    const { value, error } = sanitizePersonalPreferences(body.preferences, existing as any);
    if (error) return fail(error, 400);

    const stored = await savePreferences(sr, existing, user.id, value);

    // The claim ledger is created by the opt-in itself, never by a concurrent
    // evaluator, so the anchor a notification claims on has one identity.
    await ensureLedger(sr, user.id, "self");

    await audit(base44, {
      action: "notifications.preferences_saved",
      actor_user_id: user.id,
      actor_email: user.email,
      metadata: {
        master_enabled: value.master_enabled,
        categories: value.categories,
      },
    });

    return ok({ preferences: value, saved_at: stored?.updated_date || new Date().toISOString() });
  } catch (error: any) {
    console.error("[updateNotificationPreferences] failed:", error?.message || "unexpected error");
    return fail("server_error", 500);
  }
}

async function savePreferences(sr: any, existing: any, userId: string, value: PersonalPreferences) {
  const payload = {
    user_id: userId,
    master_enabled: value.master_enabled,
    categories: value.categories,
    above_range_minutes: value.above_range_minutes,
    missing_delay_minutes: value.missing_delay_minutes,
    show_health_details: value.show_health_details,
    quiet_hours_enabled: value.quiet_hours_enabled,
    quiet_start_hour: value.quiet_start_hour,
    quiet_end_hour: value.quiet_end_hour,
    quiet_timezone: value.quiet_timezone,
    urgent_during_quiet: value.urgent_during_quiet,
  };
  if (existing?.id) return sr.entities.NotificationPreference.update(existing.id, payload);
  return sr.entities.NotificationPreference.create(payload);
}

async function ensureLedger(sr: any, userId: string, scopeKey: string) {
  const rows = asArray(
    await sr.entities.NotificationLedger.filter({ user_id: userId, scope_key: scopeKey }, { limit: 1 })
  );
  if (rows.length) return;
  try {
    await sr.entities.NotificationLedger.create({ user_id: userId, scope_key: scopeKey, claimed_keys: [] });
  } catch {
    // A ledger that cannot be made here is made by the evaluator instead; the
    // claim itself is what guarantees one notification per event.
  }
}