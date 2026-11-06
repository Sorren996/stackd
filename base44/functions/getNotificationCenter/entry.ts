// Everything the Notifications screen needs, for the account that asked.
//
// The recipient is always the authenticated caller: no id is accepted from the
// request, no other account's preferences are readable here, and follower rows
// are dropped the moment the relationship is no longer active so a revoked
// person never appears in the list.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, asArray, currentUser, readBody } from "../../shared/sharingAccess.ts";
import {
  EMPTY_PERSONAL_PREFERENCES,
  URGENT_LOW_MGDL,
  effectiveFollowerCategories,
  relationshipAllowsPush,
  sanitizePersonalPreferences,
  sanitizeFollowerPreferences,
  sharerGrants,
  type FollowerPreferences,
  type PersonalPreferences,
} from "../../shared/notificationCore.ts";


function personalPreferencesFrom(row: any): PersonalPreferences {
  const { value } = sanitizePersonalPreferences({}, row || {});
  return value;
}

function followerPreferencesFrom(row: any, relationship: any): FollowerPreferences {
  return sanitizeFollowerPreferences({}, row || {}, relationship).value;
}

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== "POST") return fail("method_not_allowed", 405);
    await readBody(req);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail("unauthorized", 401);

    const sr = base44.asServiceRole;
    const now = Date.now();

    const [prefRows, settingsRows, relationshipRows] = await Promise.all([
      sr.entities.NotificationPreference.filter({ user_id: user.id }, { sort: "-created_date", limit: 1 }),
      sr.entities.UserSettings.filter({ created_by_id: user.id }, { sort: "-updated_date", limit: 1 }),
      sr.entities.SharedAccess.filter({ follower_user_id: user.id }, { sort: "-created_date", limit: 100 }),
    ]);

    const ownPrefs = asArray(prefRows)[0] || null;
    const settings = asArray(settingsRows)[0] || null;

    const following = asArray(relationshipRows)
      .filter((row: any) => row.status === "active" || row.status === "paused")
      .map((row: any) => {
        const grants = sharerGrants(row);
        return {
          access_id: row.id,
          name: row.sharer_display_name || "Someone you follow",
          status: row.status,
          permission_version: Number(row.permission_version) || 1,
          glucose_shared: row.scopes?.glucose === true,
          grants,
        };
      });

    // This follower's own choices, per relationship, for the relationships above.
    const followPrefRows = asArray(
      await sr.entities.FollowNotificationPreference.filter({ user_id: user.id }, { sort: "-created_date", limit: 100 })
    );
    const prefsByAccess: Record<string, any> = {};
    for (const row of followPrefRows) {
      if (!prefsByAccess[row.shared_access_id]) prefsByAccess[row.shared_access_id] = row;
    }

    const ownerIds = [...new Set(asArray(relationshipRows).filter(r => relationshipAllowsPush(r, now)).map(r => r.sharer_user_id))];
    const [ownerSettingPage, ownerPreferencePage] = ownerIds.length ? await Promise.all([
      sr.entities.UserSettings.filter({ created_by_id: { $in: ownerIds } }, { sort: '-updated_date', limit: 500 }),
      sr.entities.NotificationPreference.filter({ user_id: { $in: ownerIds } }, { sort: '-created_date', limit: 500 }),
    ]) : [[], []];
    const ownerSettings = asArray(ownerSettingPage);
    const ownerPreferences = asArray(ownerPreferencePage);
    const followingWithPrefs = following.map((person: any) => {
      const row = prefsByAccess[person.access_id] || null;
      const relationshipRow = asArray(relationshipRows).find((r: any) => r.id === person.access_id);
      const authorized = relationshipAllowsPush(relationshipRow, now);
      const inheritedMinutes = ownerPreferences.find(p => p.user_id === relationshipRow.sharer_user_id)?.above_range_minutes ?? null;
      const follower = followerPreferencesFrom({ ...row, above_range_minutes: row?.above_range_minutes ?? inheritedMinutes }, relationshipRow);
      const owner = authorized ? ownerSettings.find(s => s.created_by_id === relationshipRow.sharer_user_id) : null;
      const effective = authorized ? effectiveFollowerCategories(relationshipRow, follower.categories) : Object.fromEntries(Object.keys(person.grants).map(key => [key, false]));
      return {
        ...person,
        preferences: { ...follower, categories: effective },
        thresholds: { target_low: owner?.target_range_low ?? null, target_high: owner?.target_range_high ?? null, units: settings?.glucose_units || 'mg/dL', urgent_low: URGENT_LOW_MGDL },
        grants: Object.fromEntries(Object.entries(person.grants).map(([key, value]) => [key, authorized && value === true])),
        effective,
        has_saved_preferences: Boolean(row),
      };
    });

    // Delivery, episode and audit records stay internal; no history fetch.
    return ok({
      personal: ownPrefs ? personalPreferencesFrom(ownPrefs) : { ...EMPTY_PERSONAL_PREFERENCES },
      has_saved_preferences: Boolean(ownPrefs),
      thresholds: {
        target_low: settings?.target_range_low ?? null,
        target_high: settings?.target_range_high ?? null,
        units: settings?.glucose_units || "mg/dL",
        urgent_low: URGENT_LOW_MGDL,
        timezone: settings?.timezone || null,
      },
      following: followingWithPrefs,
      server_time: new Date(now).toISOString(),
    });
  } catch (error: any) {
    console.error("[getNotificationCenter] failed:", error?.message || "unexpected error");
    return fail("server_error", 500);
  }
}