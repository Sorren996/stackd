// Everything the Notifications screen needs, for the account that asked.
//
// The recipient is always the authenticated caller: no id is accepted from the
// request, no other account's preferences are readable here, and follower rows
// are dropped the moment the relationship is no longer active so a revoked
// person never appears in the list.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { ok, fail, asArray, currentUser, readBody } from "../../shared/sharingAccess.ts";
import {
  EMPTY_FOLLOWER_PREFERENCES,
  EMPTY_PERSONAL_PREFERENCES,
  URGENT_LOW_MGDL,
  effectiveFollowerCategories,
  relationshipAllowsPush,
  sanitizePersonalPreferences,
  sharerGrants,
  type FollowerPreferences,
  type PersonalPreferences,
} from "../../shared/notificationCore.ts";

const RECENT_LIMIT = 20;

function personalPreferencesFrom(row: any): PersonalPreferences {
  const { value } = sanitizePersonalPreferences({}, row || {});
  return value;
}

function followerPreferencesFrom(row: any): FollowerPreferences {
  if (!row) return { ...EMPTY_FOLLOWER_PREFERENCES, categories: { ...EMPTY_FOLLOWER_PREFERENCES.categories } };
  return {
    master_enabled: row.master_enabled === true,
    categories: {
      urgent_low: row.categories?.urgent_low === true,
      below_range: row.categories?.below_range === true,
      above_range: row.categories?.above_range === true,
      missing_readings: row.categories?.missing_readings === true,
    },
    missing_delay_minutes: row.missing_delay_minutes ?? null,
    show_health_details: row.show_health_details === true,
    quiet_hours_enabled: row.quiet_hours_enabled === true,
    quiet_start_hour: row.quiet_start_hour ?? null,
    quiet_end_hour: row.quiet_end_hour ?? null,
    quiet_timezone: row.quiet_timezone ?? null,
    urgent_during_quiet: row.urgent_during_quiet === true,
  };
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
      sr.entities.NotificationPreference.filter({ user_id: user.id }, { sort: "-created_date", limit: 1 }).catch(() => []),
      sr.entities.UserSettings.filter({ created_by_id: user.id }, { sort: "-updated_date", limit: 1 }).catch(() => []),
      sr.entities.SharedAccess.filter({ follower_user_id: user.id }, { sort: "-created_date", limit: 100 }).catch(() => []),
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

    const followingWithPrefs = following.map((person: any) => {
      const row = prefsByAccess[person.access_id] || null;
      const follower = followerPreferencesFrom(row);
      const relationshipRow = asArray(relationshipRows).find((r: any) => r.id === person.access_id);
      return {
        ...person,
        preferences: follower,
        effective: effectiveFollowerCategories(relationshipRow, follower.categories),
        has_saved_preferences: Boolean(row),
      };
    });

    // Recent history: this account's own rows only. Follower rows survive only
    // while the relationship is still active, so a revoke hides them here too.
    const activeAccessIds = new Set(
      followingWithPrefs.filter((p: any) => p.status === "active").map((p: any) => p.access_id)
    );
    const deliveryRows = asArray(
      await sr.entities.NotificationDelivery.filter(
        { recipient_user_id: user.id },
        { sort: "-created_date", limit: RECENT_LIMIT }
      )
    );

    const namesByAccess: Record<string, string> = {};
    for (const person of followingWithPrefs) namesByAccess[person.access_id] = person.name;

    const recent = deliveryRows
      .filter((row: any) => {
        if (row.audience !== "follower") return true;
        return row.shared_access_id ? activeAccessIds.has(row.shared_access_id) : false;
      })
      .map((row: any) => ({
        id: row.id,
        category: row.category,
        audience: row.audience,
        status: row.status,
        occurred_at: row.occurred_at || null,
        submitted_at: row.submitted_at || null,
        read_at: row.read_at || null,
        detail_shown: row.detail_shown === true,
        destination: row.destination || (row.audience === "follower" ? "/shared" : "/"),
        person_name:
          row.audience === "follower" ? namesByAccess[row.shared_access_id] || "Someone you follow" : null,
      }));

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
      recent,
      server_time: new Date(now).toISOString(),
    });
  } catch (error: any) {
    console.error("[getNotificationCenter] failed:", error?.message || "unexpected error");
    return fail("server_error", 500);
  }
}