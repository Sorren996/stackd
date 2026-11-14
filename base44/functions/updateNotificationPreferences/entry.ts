// Save one person's own notification preferences.
//
// The owner is always the authenticated caller, so a request cannot write
// another account's settings. Timings are only stored when they are one of the
// offered values, and turning a category on without choosing its timing is
// refused rather than quietly defaulted.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { categoryActivation } from '../../shared/notificationOptions.ts';
import { ownerPreferencePayload } from '../../shared/notificationModel.ts';
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

    // The person's own range lets an older row's below/above-range choices be
    // read as the Low and High levels they meant before anything is saved.
    const settingsRows = asArray(
      await sr.entities.UserSettings.filter({ created_by_id: user.id }, { sort: "-updated_date", limit: 1 })
    );
    const settings = settingsRows[0] || null;

    const { value, error } = sanitizePersonalPreferences(body.preferences, existing as any, {
      targetLow: settings?.target_range_low ?? null,
      targetHigh: settings?.target_range_high ?? null,
    });
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
  // One row, written in both vocabularies: the six rows this screen shows and
  // the per-category mirrors the decision engine reads.
  const payload = {
    ...ownerPreferencePayload(value),
    category_activation: categoryActivation(existing, value),
    user_id: userId,
    model_version: value.model_version,
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