// Evaluate and deliver urgent-low notices to the sharer's followers.
//
// Authorised for the sharer themselves (their own glucose event) or an admin —
// a user can only ever trigger evaluation for their own account, so this cannot
// be used to probe or notify about someone else's data.
//
// Every attempt is recorded in FollowerAlertDelivery under an idempotency key,
// so one event produces at most one notice per channel. Revocation, pausing and
// withdrawn scope are all re-checked immediately before each send, so a change
// made in the meantime cancels it. SMS is reported as not_configured because no
// SMS provider is integrated — never faked as sent.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  STALE_READING_MINUTES,
  URGENT_LOW_THRESHOLD,
  alertEventKey,
  decideAlert,
  isUrgentLow,
  readingAgeMinutes,
  sanitizeFollowerPrefs,
} from '../../shared/sharingCore.ts';
import {
  ok,
  fail,
  asArray,
  currentUser,
  readBody,
  appOrigin,
  recordDelivery,
} from '../../shared/sharingAccess.ts';

const CHANNELS = ['email', 'sms'];
const MGDL_PER_MMOL = 18.0182;

function formatReadingTime(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    const body = await readBody(req);
    const isAdmin = user.role === 'admin';
    let sharerId: string | null =
      typeof body.sharer_user_id === 'string' && body.sharer_user_id ? body.sharer_user_id : null;

    // A plain caller may only ever have notices evaluated for their OWN account.
    if (!sharerId && !isAdmin) sharerId = user.id;
    if (sharerId && sharerId !== user.id && !isAdmin) return fail('forbidden', 403);

    const sr = base44.asServiceRole;
    const now = Date.now();

    let reading: any = null;
    if (typeof body.reading_id === 'string' && body.reading_id) {
      try {
        reading = await sr.entities.GlucoseReading.get(body.reading_id);
      } catch {
        reading = null;
      }
    } else if (sharerId) {
      reading = asArray(
        await sr.entities.GlucoseReading.filter({ user_id: sharerId }, { sort: '-recorded_at', limit: 1 })
      )[0] || null;
    }

    if (!reading) return ok({ evaluated: 0, reason: 'no_reading' });

    // The account a notice is evaluated for is the OWNER OF THE READING — never
    // an id supplied by the caller.
    const ownerId = reading.user_id || reading.created_by_id || null;
    if (ownerId) {
      if (sharerId && sharerId !== ownerId) return fail('forbidden', 403);
      sharerId = ownerId;
    }
    if (!sharerId) return fail('missing_sharer', 400);

    const settings = asArray(
      await sr.entities.UserSettings.filter({ created_by_id: sharerId }, { sort: '-updated_date', limit: 5 })
    )[0];

    const value = Number(reading.value);
    if (!isUrgentLow(value)) return ok({ evaluated: 0, reason: 'not_urgent' });

    // A stale or backfilled sample never produces an urgent notice.
    const ageMinutes = readingAgeMinutes(reading, now);
    const readingIsFresh = Number.isFinite(ageMinutes) && ageMinutes <= STALE_READING_MINUTES;
    if (!readingIsFresh) return ok({ evaluated: 0, reason: 'not_fresh' });

    // A carry-forward reading is the same measurement repeated, so it must not
    // be able to raise a second notice for one event.
    const isSynthesised = String(reading.source || '').toLowerCase() === 'system';
    if (isSynthesised) return ok({ evaluated: 0, reason: 'synthesised_reading' });

    const followers = asArray(await sr.entities.SharedAccess.filter({ sharer_user_id: sharerId })).filter(
      (row: any) => row.status === 'active' || row.status === 'paused'
    );
    if (followers.length === 0) return ok({ evaluated: 0, reason: 'no_followers' });

    // One query for every prior attempt, instead of one per follower.
    const priorRows = asArray(await sr.entities.FollowerAlertDelivery.filter({ sharer_user_id: sharerId }));
    const priorByKey: Record<string, any> = {};
    for (const row of priorRows) priorByKey[`${row.event_key}|${row.channel}`] = row;

    const units = settings?.glucose_units === 'mmol/L' ? 'mmol/L' : 'mg/dL';
    const displayValue = units === 'mmol/L' ? (value / MGDL_PER_MMOL).toFixed(1) : String(Math.round(value));
    const timeZone = settings?.timezone || null;
    const readingTime = formatReadingTime(reading.recorded_at, timeZone);
    const eventId = reading.id;
    const actionUrl = `${appOrigin(req)}/shared`;

    const summary: Record<string, number> = { sent: 0, skipped: 0, failed: 0, not_configured: 0, duplicate: 0 };
    const pending: any[] = [];

    for (const follower of followers) {
      const followerId = follower.follower_user_id;
      if (!followerId) continue;

      const prefs = sanitizeFollowerPrefs(follower.follower_prefs);

      for (const channel of CHANNELS) {
        const eventKey = alertEventKey(sharerId, followerId, eventId, channel);
        const prior = priorByKey[`${eventKey}|${channel}`];

        // Idempotency: any prior record for this event key and channel means the
        // event was already evaluated for this follower. A skipped or failed
        // attempt is deliberately not retried, so duplicate notices can never
        // build up for the same event.
        if (prior) {
          summary.duplicate += 1;
          continue;
        }

        // Re-read the relationship state for THIS decision, so a revoke or a
        // withdrawn scope made moments ago cancels the send.
        let fresh: any = follower;
        try {
          fresh = await sr.entities.SharedAccess.get(follower.id);
        } catch {
          fresh = follower;
        }

        // SMS has no configured provider, so it is never reported as sent.
        const channelConfigured = channel === 'email';

        const decision = decideAlert({
          access: fresh,
          channel,
          channelConfigured,
          glucoseValue: value,
          readingIsFresh,
          followerPrefs: prefs,
          sharerTimeZone: timeZone,
          now,
        });

        if (!decision.dispatch) {
          if (decision.reason === 'no_delivery_capability') {
            summary.not_configured += 1;
            await recordDelivery(base44, {
              sharer_user_id: sharerId,
              follower_user_id: followerId,
              shared_access_id: fresh.id,
              event_key: eventKey,
              channel,
              status: 'not_configured',
              reason: 'no_delivery_capability',
              glucose_value: value,
              attempts: 0,
              permission_version: Number(fresh.permission_version) || 1,
            });
          } else {
            summary.skipped += 1;
            await recordDelivery(base44, {
              sharer_user_id: sharerId,
              follower_user_id: followerId,
              shared_access_id: fresh.id,
              event_key: eventKey,
              channel,
              status: 'skipped',
              reason: decision.reason,
              glucose_value: value,
              attempts: 0,
              permission_version: Number(fresh.permission_version) || 1,
            });
          }
          continue;
        }

        pending.push({
          record: {
            sharer_user_id: sharerId,
            follower_user_id: followerId,
            shared_access_id: fresh.id,
            event_key: eventKey,
            channel,
            glucose_value: value,
            permission_version: Number(fresh.permission_version) || 1,
          },
          to: fresh.invited_email,
          sharerName: fresh.sharer_display_name || 'Your contact',
          eventKey,
          channel,
        });
      }
    }

    // Sends are independent network calls — run them together, bounded by the
    // follower cap, never one sequential round trip per follower.
    const results = await Promise.allSettled(
      pending.map(async (item) => {
        try {
          await sr.integrations.Core.SendEmail({
            to: item.to,
            template_name: 'UrgentLowNotice',
            variables: {
              sharer_name: item.sharerName,
              glucose_value: displayValue,
              glucose_units: units,
              reading_time: readingTime,
              action_url: actionUrl,
            },
          });
          return { item, status: 'sent', reason: 'ok' };
        } catch (error: any) {
          console.error('[deliverFollowerAlerts] send failed:', error?.message || error);
          return { item, status: 'failed', reason: 'send_failed' };
        }
      })
    );

    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const { item, status, reason } = result.value;
      if (status === 'sent') summary.sent += 1;
      else summary.failed += 1;
      await recordDelivery(base44, {
        ...item.record,
        status,
        reason,
        attempts: 1,
        delivered_at: status === 'sent' ? new Date().toISOString() : null,
      });
    }

    return ok({
      evaluated: followers.length,
      threshold: URGENT_LOW_THRESHOLD,
      summary,
    });
  } catch (error: any) {
    console.error('[deliverFollowerAlerts] failed:', error?.message || error);
    return fail('server_error', 500);
  }
}