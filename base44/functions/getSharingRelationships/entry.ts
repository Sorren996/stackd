// Owner's sharing dashboard data.
//
// Returns every relationship this account owns, the delivery state of its
// invitation, and whether a contact number / location is on file. The contact
// number is NEVER returned here — only a masked form — and the location is
// summarised by its own timestamp without coordinates.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  decryptSharingValue,
  isSharingCryptoConfigured,
  missingSharingSecrets,
} from '../../shared/sharingCrypto.ts';
import { maskPhone } from '../../shared/sharingCore.ts';
import { ok, fail, asArray, currentUser, publicRelationship } from '../../shared/sharingAccess.ts';
import { followerPushReady, sharerGrants } from '../../shared/notificationCore.ts';
import { reachabilityFromRows } from '../../shared/notificationReachability.ts';

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    const sr = base44.asServiceRole;
    const now = Date.now();

    const [rows, invitations, contacts, locations, deliveries, pushDeliveries] = await Promise.all([
      sr.entities.SharedAccess.filter({ sharer_user_id: user.id }, { sort: '-created_date', limit: 100 }),
      sr.entities.SharedInvitation.filter({ sharer_user_id: user.id }, { sort: '-created_date', limit: 100 }),
      sr.entities.SharerContact.filter({ user_id: user.id }),
      sr.entities.LatestLocation.filter({ user_id: user.id }),
      sr.entities.FollowerAlertDelivery.filter({ sharer_user_id: user.id }, { sort: '-created_date', limit: 30 }),
      // What the push transport actually recorded for the people following this
      // account. A sharer must never be told alerts are arriving when they are not.
      sr.entities.NotificationDelivery.filter({ audience: 'follower', owner_user_id: user.id }, { sort: '-created_date', limit: 200 }),
    ]);

    // Whether each follower is still an app member at all. A removed account can
    // never receive a push, and saying so is kinder than silence.
    const memberIds = new Set<string>();
    let membershipKnown = false;
    try {
      for (let skip = 0; skip < 2000; skip += 200) {
        const page = asArray(await sr.entities.User.list('-created_date', 200, skip));
        for (const account of page) if (account?.id) memberIds.add(account.id);
        if (page.length < 200) break;
      }
      membershipKnown = true;
    } catch (error: any) {
      console.error('[getSharingRelationships] membership check unavailable:', error?.message || error);
    }

    const deliveriesByAccess: Record<string, any[]> = {};
    for (const delivery of asArray(pushDeliveries)) {
      if (!delivery?.shared_access_id) continue;
      (deliveriesByAccess[delivery.shared_access_id] ||= []).push(delivery);
    }

    // The follower's own push choice, so the owner's screen can say honestly
    // "permission saved, waiting for them" instead of showing a permission as
    // off when it is on. Their choice is read, never written, here.
    const accessIds = asArray(rows).map((row: any) => row.id).filter(Boolean);
    const followPrefs = accessIds.length
      ? asArray(await sr.entities.FollowNotificationPreference.filter({ shared_access_id: { $in: accessIds } }, { limit: 200 }))
      : [];
    const followerPrefByAccess: Record<string, any> = {};
    for (const pref of followPrefs) {
      if (pref?.shared_access_id) followerPrefByAccess[pref.shared_access_id] = pref;
    }

    const inviteByAccess: Record<string, any> = {};
    for (const invite of asArray(invitations)) {
      const prior = inviteByAccess[invite.shared_access_id];
      if (!prior || new Date(invite.created_date) > new Date(prior.created_date)) {
        inviteByAccess[invite.shared_access_id] = invite;
      }
    }

    const relationships = asArray(rows).map((row: any) => {
      const invite = inviteByAccess[row.id];
      const base = publicRelationship(row, now);
      return {
        ...base,
        // Per category: the owner's permission is saved, but is this follower
        // ready to receive it? Derived from their own stored choice only.
        follower_push_ready: followerPushReady(followerPrefByAccess[row.id]),
        // Can a push actually reach them? Reachable only once a notice has been
        // submitted; no_device when the transport said there is no device yet
        // (or you granted push and not one notice has ever been submitted);
        // not_member when that account is no longer an app member.
        push_reachability: (() => {
          const followerId = row.follower_user_id;
          if (!followerId) return 'unknown';
          if (membershipKnown && !memberIds.has(followerId)) return 'not_member';
          const recorded = reachabilityFromRows(deliveriesByAccess[row.id] || []);
          const granted = Object.values(sharerGrants(row)).some(Boolean);
          if (recorded === 'unknown' && granted && row.status === 'active') return 'no_device';
          return recorded;
        })(),
        // What would actually reach this follower right now: the owner's
        // authorization AND the follower's own choice. A channel that is armed
        // but not yet allowed by the follower is reported as armed, never as
        // live, so the owner is never told a notice will arrive when it will not.
        effective_alerts: {
          urgent_low_email: base.alert_scopes.urgent_low_email && base.follower_prefs.notify_email,
          urgent_low_sms: base.alert_scopes.urgent_low_sms && base.follower_prefs.notify_sms,
        },
        invitation: invite
          ? {
              id: invite.id,
              status: invite.status,
              delivery_status: invite.delivery_status || null,
              delivery_detail: invite.delivery_detail || null,
              expires_at: invite.expires_at || null,
              resend_count: Number(invite.resend_count) || 0,
              last_sent_at: invite.last_sent_at || null,
            }
          : null,
      };
    });

    // A masked number is enough for the owner to recognise which line is on
    // file; the full number is never sent to the browser.
    let contactMasked: string | null = null;
    const contactRow = asArray(contacts)[0];
    if (contactRow?.phone_enc) {
      try {
        const digits = await decryptSharingValue(contactRow.phone_enc);
        contactMasked = maskPhone(contactRow.country_code || '', digits);
      } catch (error: any) {
        console.error('[getSharingRelationships] contact decrypt failed:', error?.message || error);
        contactMasked = null;
      }
    }

    const locationRow = asArray(locations)[0];

    const recentDeliveries = asArray(deliveries);
    const alertSummary = {
      sent: recentDeliveries.filter((d: any) => d.status === 'sent').length,
      not_configured: recentDeliveries.filter((d: any) => d.status === 'not_configured').length,
      failed: recentDeliveries.filter((d: any) => d.status === 'failed').length,
      total: recentDeliveries.length,
      last_attempt_at: recentDeliveries[0]?.created_date || null,
      last_reason: recentDeliveries[0]?.reason || null,
    };

    return ok({
      relationships,
      contact: {
        on_file: Boolean(contactRow?.phone_enc),
        masked: contactMasked,
        country_code: contactRow?.country_code || null,
      },
      location: {
        published: Boolean(locationRow),
        captured_at: locationRow?.captured_at || null,
      },
      alert_summary: alertSummary,
      crypto_configured: isSharingCryptoConfigured(),
      missing_secrets: missingSharingSecrets(),
    });
  } catch (error: any) {
    console.error('[getSharingRelationships] failed:', error?.message || error);
    return fail('server_error', 500);
  }
}