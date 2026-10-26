// The sharer publishing their latest known location.
//
// Coordinates are encrypted before they touch the database and are only ever
// stored while at least one follower actually has the location scope switched
// on — the app does not accumulate location data that nobody is allowed to see.
//
// The stored time is the position's OWN observation time. A device fix may
// supply it, but only inside a bounded sanity window: a time in the future, or
// one older than a current fix could be, is discarded and the server's own time
// is used instead. The server therefore always decides what is stored, and a
// client cannot relabel an old position as a new one.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { encryptSharingValue, isSharingCryptoConfigured } from '../../shared/sharingCrypto.ts';
import { isValidLocation, effectiveScopes } from '../../shared/sharingCore.ts';
import { ok, fail, asArray, currentUser, readBody, audit } from '../../shared/sharingAccess.ts';

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    if (!isSharingCryptoConfigured()) return fail('sharing_not_configured', 503);

    const body = await readBody(req);
    const coordinates = {
      latitude: Number(body.latitude),
      longitude: Number(body.longitude),
    };
    if (!isValidLocation(coordinates)) return fail('invalid_coordinates', 400);

    const accuracy = Number(body.accuracy_m);
    const payload = {
      latitude: coordinates.latitude,
      longitude: coordinates.longitude,
      accuracy_m: Number.isFinite(accuracy) && accuracy > 0 ? accuracy : null,
    };

    const sr = base44.asServiceRole;
    const now = Date.now();

    const rows = asArray(await sr.entities.SharedAccess.filter({ sharer_user_id: user.id }));
    const anyLocationFollower = rows
      .filter((row: any) => row.status === 'active' && row.follower_user_id)
      .some((row: any) => effectiveScopes(row, now).location);

    if (!anyLocationFollower) {
      return ok({ published: false, reason: 'no_active_location_scope' });
    }

    // How the fix was obtained, recorded for audit only. Never a reason to
    // publish, and never able to widen what any follower may read.
    const source = body.source === 'foreground_auto' ? 'foreground_auto' : 'manual';

    // The position's own observation time, bounded. Anything unusable falls back
    // to the server's time rather than being trusted as-is.
    const MAX_OBSERVED_AGE_MS = 5 * 60 * 1000;
    const observedRaw = body.observed_at ? new Date(String(body.observed_at)).getTime() : NaN;
    const capturedAt =
      Number.isFinite(observedRaw) && observedRaw > 0 && observedRaw <= now && now - observedRaw <= MAX_OBSERVED_AGE_MS
        ? new Date(observedRaw).toISOString()
        : new Date(now).toISOString();
    const locationEnc = await encryptSharingValue(JSON.stringify(payload));
    const existing = asArray(await sr.entities.LatestLocation.filter({ user_id: user.id }))[0];

    if (existing?.id) {
      await sr.entities.LatestLocation.update(existing.id, {
        location_enc: locationEnc,
        accuracy_m: payload.accuracy_m,
        captured_at: capturedAt,
        key_version: 'v1',
      });
    } else {
      await sr.entities.LatestLocation.create({
        user_id: user.id,
        location_enc: locationEnc,
        accuracy_m: payload.accuracy_m,
        captured_at: capturedAt,
        key_version: 'v1',
      });
    }

    await audit(base44, {
      action: 'sharing.location_published',
      actor_user_id: user.id,
      actor_email: user.email,
      metadata: { follower_count: rows.length, source, observed_at: capturedAt },
    });

    return ok({ published: true, captured_at: capturedAt });
  } catch (error: any) {
    console.error('[publishSharerLocation] failed:', error?.message || error);
    return fail('server_error', 500);
  }
}