// A follower's own push choices for one person they follow.
//
// Two layers always apply: the relationship must be active and glucose-scoped,
// and the sharer must have permitted the category. Whatever the follower
// submits is CLAMPED to that grant on the server, so a crafted request can only
// narrow what they receive — never widen it. The follower id comes from the
// session, so another account cannot be written.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, asArray, currentUser, readBody, loadFollowedRelationship, audit } from "../../shared/sharingAccess.ts";
import {
  clampFollowerCategories,
  relationshipAllowsPush,
  sanitizeFollowerPreferences,
} from "../../shared/notificationCore.ts";

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return fail("method_not_allowed", 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail("unauthorized", 401);

    const body = await readBody(req);
    const sr = base44.asServiceRole;

    const loaded = await loadFollowedRelationship(base44, user.id, body.access_id);
    if (loaded.error) return fail(loaded.error, loaded.status || 400);
    const relationship = loaded.access;

    if (relationship.status === "revoked") return fail("revoked", 409);
    if (!relationshipAllowsPush(relationship, Date.now())) {
      // Not active yet, or glucose is not shared: nothing can be opted into.
      return fail("not_available", 409);
    }

    const existingRows = asArray(
      await sr.entities.FollowNotificationPreference.filter(
        { user_id: user.id, shared_access_id: relationship.id },
        { sort: "-created_date", limit: 1 }
      )
    );
    const existing = existingRows[0] || null;

    const { value, error } = sanitizeFollowerPreferences(body.preferences, existing as any, relationship);
    if (error) return fail(error, 400);

    const payload = {
      user_id: user.id,
      shared_access_id: relationship.id,
      master_enabled: value.master_enabled,
      // Re-clamped against the relationship as it stands right now.
      categories: clampFollowerCategories(relationship, value.categories),
      missing_delay_minutes: value.missing_delay_minutes,
      show_health_details: value.show_health_details,
      quiet_hours_enabled: value.quiet_hours_enabled,
      quiet_start_hour: value.quiet_start_hour,
      quiet_end_hour: value.quiet_end_hour,
      quiet_timezone: value.quiet_timezone,
      urgent_during_quiet: value.urgent_during_quiet,
    };

    const saved = existing?.id
      ? await sr.entities.FollowNotificationPreference.update(existing.id, payload)
      : await sr.entities.FollowNotificationPreference.create(payload);

    await ensureLedger(sr, user.id, `follow:${relationship.id}`);

    await audit(base44, {
      action: "notifications.follower_preferences_saved",
      actor_user_id: user.id,
      actor_email: user.email,
      subject_user_id: relationship.sharer_user_id,
      metadata: { access_id: relationship.id, master_enabled: value.master_enabled },
    });

    return ok({ preferences: { ...value, categories: payload.categories }, saved_at: saved?.updated_date || new Date().toISOString() });
  } catch (error: any) {
    console.error("[updateFollowNotificationPreferences] failed:", error?.message || "unexpected error");
    return fail("server_error", 500);
  }
}

async function ensureLedger(sr: any, userId: string, scopeKey: string) {
  const rows = asArray(
    await sr.entities.NotificationLedger.filter({ user_id: userId, scope_key: scopeKey }, { limit: 1 })
  );
  if (rows.length) return;
  try {
    await sr.entities.NotificationLedger.create({ user_id: userId, scope_key: scopeKey, claimed_keys: [] });
  } catch {
    // The evaluator creates it if needed; the atomic claim still holds.
  }
}