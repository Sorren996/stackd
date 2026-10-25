// Create (or re-send) a sharing invitation.
//
// The sharer's own session does the write, so the new SharedAccess and
// SharedInvitation records are owned by them and pass RLS for their own reads.
// The raw invitation token is returned ONLY here and only to the sharer who
// created it — it is never stored, never logged, and never sent to a third
// party (a re-send replaces it, so the previous link dies immediately).

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import {
  generateInviteToken,
  hashInviteToken,
  isSharingCryptoConfigured,
  missingSharingSecrets,
} from '../../shared/sharingCrypto.ts';
import {
  ok,
  fail,
  asArray,
  currentUser,
  readBody,
  readInviteEmail,
  readDisplayName,
  buildInviteUrl,
  publicRelationship,
  audit,
  invitesThisHour,
  MAX_INVITES_PER_HOUR,
  MAX_FOLLOWERS,
  INVITE_TTL_HOURS,
} from '../../shared/sharingAccess.ts';

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    if (!isSharingCryptoConfigured()) {
      return fail('sharing_not_configured', 503, { missing_secrets: missingSharingSecrets() });
    }

    const body = await readBody(req);
    const email = readInviteEmail(body.invited_email);
    if (!email) return fail('invalid_email', 400);

    const ownEmail = String(user.email || '').trim().toLowerCase();
    if (email === ownEmail) return fail('cannot_invite_self', 400);

    const db = base44.entities;
    const sr = base44.asServiceRole;
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Only one relationship per invited address, so re-inviting re-issues the
    // link instead of stacking duplicates.
    const existing = asArray(
      await sr.entities.SharedAccess.filter({ sharer_user_id: user.id, invited_email: email })
    );
    const live = existing.find((r: any) => r.status === 'pending');

    if (!live) {
      const alreadyFollowing = existing.find((r: any) => r.status === 'active' || r.status === 'paused');
      if (alreadyFollowing) return fail('already_shared', 409);

      const activeCount = asArray(await sr.entities.SharedAccess.filter({ sharer_user_id: user.id })).filter(
        (r: any) => r.status === 'active' || r.status === 'paused'
      ).length;
      if (activeCount >= MAX_FOLLOWERS) return fail('too_many_followers', 429);

      if ((await invitesThisHour(base44, user.id)) >= MAX_INVITES_PER_HOUR) {
        return fail('too_many_invitations', 429);
      }
    }

    const displayName = readDisplayName(body.sharer_display_name, user.full_name || 'Your contact');
    const token = generateInviteToken();
    const tokenHash = await hashInviteToken(token);
    const expiresAt = new Date(now + INVITE_TTL_HOURS * 3600 * 1000).toISOString();

    let accessId: string;
    let resendCount = 0;

    if (live) {
      accessId = live.id;
      await db.SharedAccess.update(accessId, {
        sharer_display_name: displayName,
        invitation_expires_at: expiresAt,
        permission_version: (Number(live.permission_version) || 1) + 1,
        last_scope_change_at: nowIso,
      });
      // Only the newest link may be redeemed.
      await db.SharedInvitation.updateMany(
        { shared_access_id: accessId, status: 'pending' },
        { $set: { status: 'canceled' } }
      ).catch(() => {});
      const prior = asArray(await db.SharedInvitation.filter({ shared_access_id: accessId }));
      resendCount = prior.length ? Math.max(...prior.map((i: any) => Number(i.resend_count) || 0)) + 1 : 0;
    } else {
      const access = await db.SharedAccess.create({
        sharer_user_id: user.id,
        sharer_display_name: displayName,
        invited_email: email,
        scopes: { glucose: false, insulin: false, location: false, urgent_low_call: false },
        alert_scopes: { urgent_low_email: false, urgent_low_sms: false },
        contact_shared: false,
        status: 'pending',
        permission_version: 1,
        invitation_expires_at: expiresAt,
        // The follower's own notification choice starts ON, because the owner's
        // authorization is the primary consent gate and a follower who has just
        // accepted would otherwise be silently unreachable.
        follower_prefs: { notify_email: true, notify_sms: false, quiet_hours_start: 21, quiet_hours_end: 7 },
      });
      accessId = access.id;
    }

    const invitation = await db.SharedInvitation.create({
      sharer_user_id: user.id,
      sharer_display_name: displayName,
      invited_email: email,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt,
      shared_access_id: accessId,
      resend_count: resendCount,
      last_sent_at: nowIso,
    });

    await db.SharedAccess.update(accessId, { invitation_id: invitation.id }).catch(() => {});

    const inviteUrl = buildInviteUrl(req, token);
    let deliveryStatus = 'failed';
    let deliveryDetail = '';

    try {
      await sr.integrations.Core.SendEmail({
        to: email,
        template_name: 'SharingInvitation',
        variables: {
          sharer_name: displayName,
          action_url: inviteUrl,
          expires_hours: String(INVITE_TTL_HOURS),
        },
      });
      deliveryStatus = 'sent';
    } catch (error: any) {
      // An invitation to someone who is not yet an app user may be refused.
      // That is recorded honestly rather than reported as sent.
      deliveryStatus = 'not_configured';
      deliveryDetail =
        'The invitation email could not be sent from this app. Share the personal link below instead.';
      console.error('[createSharingInvitation] email failed:', error?.message || error);
    }

    await db.SharedInvitation.update(invitation.id, {
      delivery_status: deliveryStatus,
      delivery_detail: deliveryDetail,
    }).catch(() => {});

    const access = await sr.entities.SharedAccess.get(accessId);
    await audit(base44, {
      action: 'sharing.invitation_created',
      actor_user_id: user.id,
      actor_email: user.email,
      reason: resendCount > 0 ? 'resend' : 'invite',
      metadata: { access_id: accessId, delivery_status: deliveryStatus },
    });

    return ok({
      relationship: publicRelationship(access, now),
      delivery_status: deliveryStatus,
      delivery_detail: deliveryDetail,
      // Handed back only when the app could not email it, so the sharer can
      // pass it on personally.
      invite_link: deliveryStatus === 'sent' ? null : inviteUrl,
    });
  } catch (error: any) {
    console.error('[createSharingInvitation] failed:', error?.message || error);
    return fail('server_error', 500);
  }
}