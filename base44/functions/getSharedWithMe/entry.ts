// Follower's own list of relationships, plus their notification preferences.
//
// The follower id always comes from the authenticated session, so swapping an
// id in the body reaches nothing. A follower may narrow what they receive but
// can never widen what the sharer granted — every returned scope is resolved
// from the stored relationship for this instant.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { sanitizeFollowerPrefs, effectiveScopes, effectiveAlertScopes } from '../../shared/sharingCore.ts';
import {
  ok,
  fail,
  asArray,
  currentUser,
  readBody,
  loadFollowedRelationship,
  publicRelationship,
  audit,
} from '../../shared/sharingAccess.ts';

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    const sr = base44.asServiceRole;
    const body = await readBody(req);
    const now = Date.now();

    if (body.action === 'set_prefs') {
      const loaded = await loadFollowedRelationship(base44, user.id, body.access_id);
      if (loaded.error) return fail(loaded.error, loaded.status || 400);
      const access = loaded.access;
      if (access.status === 'revoked') return fail('revoked', 409);

      const prefs = sanitizeFollowerPrefs(body.follower_prefs);
      await sr.entities.SharedAccess.update(access.id, { follower_prefs: prefs });
      await audit(base44, {
        action: 'sharing.follower_prefs',
        actor_user_id: user.id,
        actor_email: user.email,
        metadata: { access_id: access.id },
      });
      const updated = await sr.entities.SharedAccess.get(access.id);
      return ok({ relationship: publicRelationship(updated, now) });
    }

    const rows = asArray(
      await sr.entities.SharedAccess.filter(
        { follower_user_id: user.id },
        { sort: '-created_date', limit: 100 }
      )
    );

    const relationships = rows.map((row: any) => {
      const scopes = effectiveScopes(row, now);
      // What the follower would actually receive, given both the owner's
      // grants and their own preferences.
      const alerts = effectiveAlertScopes(row, now);
      const prefs = sanitizeFollowerPrefs(row.follower_prefs);
      return {
        ...publicRelationship(row, now),
        deliverable: {
          glucose: scopes.glucose,
          insulin: scopes.insulin,
          location: scopes.location,
          urgent_low_email: alerts.urgent_low_email && prefs.notify_email,
          urgent_low_sms: alerts.urgent_low_sms && prefs.notify_sms,
        },
      };
    });

    return ok({ relationships });
  } catch (error: any) {
    console.error('[getSharedWithMe] failed:', error?.message || error);
    return fail('server_error', 500);
  }
}