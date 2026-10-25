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

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    const sr = base44.asServiceRole;
    const now = Date.now();

    const [rows, invitations, contacts, locations, deliveries] = await Promise.all([
      sr.entities.SharedAccess.filter({ sharer_user_id: user.id }, { sort: '-created_date', limit: 100 }),
      sr.entities.SharedInvitation.filter({ sharer_user_id: user.id }, { sort: '-created_date', limit: 100 }),
      sr.entities.SharerContact.filter({ user_id: user.id }),
      sr.entities.LatestLocation.filter({ user_id: user.id }),
      sr.entities.FollowerAlertDelivery.filter({ sharer_user_id: user.id }, { sort: '-created_date', limit: 30 }),
    ]);

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