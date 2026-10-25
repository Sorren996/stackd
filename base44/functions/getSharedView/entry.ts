// The follower's data read.
//
// The caller is bound to the relationship from their own session, the
// relationship is re-checked for this instant, and ONLY the resources with an
// enabled scope are read at all — a disabled scope costs no query and returns
// no field. Scope decisions come entirely from the shared core, so there is no
// second place where a scope could be misread.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { decryptSharingValue } from '../../shared/sharingCrypto.ts';
import {
  GLUCOSE_WINDOW_HOURS,
  STALE_READING_MINUTES,
  effectiveScopes,
  projectResource,
} from '../../shared/sharingCore.ts';
import {
  ok,
  fail,
  asArray,
  currentUser,
  readBody,
  loadFollowedRelationship,
  relationshipBlockReason,
  publicRelationship,
} from '../../shared/sharingAccess.ts';

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    const body = await readBody(req);
    const loaded = await loadFollowedRelationship(base44, user.id, body.access_id);
    if (loaded.error) return fail(loaded.error, loaded.status || 400);
    const access = loaded.access;

    const now = Date.now();

    // Paused, revoked, expired or not-yet-accepted stop every subsequent
    // request — the follower's cached copy must not survive it.
    const blocked = relationshipBlockReason(access, now);
    if (blocked) {
      return fail(blocked, 403, { relationship: publicRelationship(access, now) });
    }

    const scopes = effectiveScopes(access, now);
    const sharerId = access.sharer_user_id;
    const sr = base44.asServiceRole;

    const [settingsRows, readingRows, doseRows, locationRows, contactRows] = await Promise.all([
      sr.entities.UserSettings.filter({ created_by_id: sharerId }, { sort: '-updated_date', limit: 5 }),
      scopes.glucose
        ? sr.entities.GlucoseReading.filter({ user_id: sharerId }, { sort: '-recorded_at', limit: 400 })
        : Promise.resolve([]),
      scopes.insulin
        ? sr.entities.InsulinDose.filter({ created_by_id: sharerId }, { sort: '-administered_at', limit: 200 })
        : Promise.resolve([]),
      scopes.location ? sr.entities.LatestLocation.filter({ user_id: sharerId }) : Promise.resolve([]),
      scopes.urgent_low_call ? sr.entities.SharerContact.filter({ user_id: sharerId }) : Promise.resolve([]),
    ]);

    const settings = asArray(settingsRows)[0] || null;

    // The day boundary is the SHARER's local midnight and the target range is
    // the SHARER's plan, so the follower's own time zone and settings can never
    // change the number they see.
    const glucoseCtx = {
      access,
      now,
      readings: asArray(readingRows),
      targetLow: settings?.target_range_low ?? null,
      targetHigh: settings?.target_range_high ?? null,
      timeZone: settings?.timezone || null,
    };

    const insulinCtx = {
      access,
      now,
      doses: asArray(doseRows),
      // Dose-derived figures stay unavailable until the sharer has confirmed
      // their own plan.
      settingsConfirmed: settings?.settings_confirmed === true,
    };

    // The contact number is decrypted only when the call permission is granted
    // AND the sharer released it to this follower specifically.
    let contact: any = null;
    if (scopes.urgent_low_call && access.contact_shared) {
      const row = asArray(contactRows)[0];
      if (row?.phone_enc) {
        try {
          contact = {
            country_code: row.country_code || '',
            phone: await decryptSharingValue(row.phone_enc),
          };
        } catch (error: any) {
          console.error('[getSharedView] contact decrypt failed:', error?.message || error);
        }
      }
    }

    let location: any = null;
    const locationRow = asArray(locationRows)[0];
    if (locationRow?.location_enc) {
      try {
        const parsed = JSON.parse(await decryptSharingValue(locationRow.location_enc));
        location = {
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          accuracy_m: locationRow.accuracy_m ?? parsed.accuracy_m ?? null,
          captured_at: locationRow.captured_at,
        };
      } catch (error: any) {
        console.error('[getSharedView] location decrypt failed:', error?.message || error);
      }
    }

    const glucose = projectResource('glucose', glucoseCtx);
    const insulin = projectResource('insulin', insulinCtx);
    const place = projectResource('location', { access, now, location });
    const summary = projectResource('summary', { access, now, contact });

    return ok({
      relationship: publicRelationship(access, now),
      glucose: glucose.ok ? glucose.data : null,
      glucose_reason: glucose.ok ? null : glucose.reason,
      insulin: insulin.ok ? insulin.data : null,
      insulin_reason: insulin.ok ? null : insulin.reason,
      location: place.ok ? place.data.location : null,
      location_reason: place.ok ? place.data.reason : place.reason,
      summary: summary.data,
      window_hours: GLUCOSE_WINDOW_HOURS,
      stale_minutes: STALE_READING_MINUTES,
      computed_at: new Date(now).toISOString(),
    });
  } catch (error: any) {
    console.error('[getSharedView] failed:', error?.message || error);
    return fail('server_error', 500);
  }
}