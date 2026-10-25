// Redeem a sharing invitation.
//
// POST only: a link-preview scanner or email client issuing a GET can never
// change invitation state. The redemption itself is a one-shot atomic claim —
// the updateMany is scoped to `status: 'pending'`, and the claim is then
// re-read to confirm THIS caller won it, so two simultaneous redemptions grant
// access exactly once.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { hashInviteToken, isSharingCryptoConfigured } from '../../shared/sharingCrypto.ts';
import { invitationBlockReason, normalizeEmail, emailsMatch } from '../../shared/sharingCore.ts';
import {
  ok,
  fail,
  asArray,
  currentUser,
  readBody,
  publicRelationship,
  audit,
} from '../../shared/sharingAccess.ts';

const BLOCK_STATUS: Record<string, number> = {
  not_found: 404,
  expired: 410,
  already_claimed: 409,
  email_mismatch: 403,
  canceled: 409,
};

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    if (!isSharingCryptoConfigured()) return fail('sharing_not_configured', 503);

    const body = await readBody(req);
    const token = typeof body.token === 'string' ? body.token.trim() : '';
    if (!token) return fail('missing_token', 400);

    const sr = base44.asServiceRole;
    const tokenHash = await hashInviteToken(token);
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    const found = asArray(await sr.entities.SharedInvitation.filter({ token_hash: tokenHash }));
    const invitation = found[0] || null;

    const block = invitationBlockReason(invitation, user.email, now);
    if (block) return fail(block, BLOCK_STATUS[block] || 400);

    let access: any;
    try {
      access = await sr.entities.SharedAccess.get(invitation.shared_access_id);
    } catch {
      return fail('not_found', 404);
    }
    if (!access?.id) return fail('not_found', 404);

    // The relationship carries its own binding; both must agree, so a mutated
    // invitation row cannot redirect a redemption to another relationship.
    if (!emailsMatch(access.invited_email, user.email)) return fail('email_mismatch', 403);
    if (access.sharer_user_id === user.id) return fail('cannot_follow_self', 400);
    if (access.status === 'revoked') return fail('revoked', 403);

    // One-shot claim. Only a still-pending invitation can be taken.
    await sr.entities.SharedInvitation.updateMany(
      { id: invitation.id, status: 'pending' },
      {
        $set: {
          status: 'accepted',
          accepted_at: nowIso,
          accepted_by_user_id: user.id,
          shared_access_id: access.id,
        },
      }
    );

    const claimed = await sr.entities.SharedInvitation.get(invitation.id);
    if (claimed?.accepted_by_user_id !== user.id) {
      // Someone else won the race, or the invitation was already used.
      return fail('already_claimed', 409);
    }

    await sr.entities.SharedAccess.update(access.id, {
      follower_user_id: user.id,
      status: 'active',
      accepted_at: nowIso,
      invitation_expires_at: access.invitation_expires_at || null,
      permission_version: (Number(access.permission_version) || 1) + 1,
      last_scope_change_at: nowIso,
    });

    const updated = await sr.entities.SharedAccess.get(access.id);
    await audit(base44, {
      action: 'sharing.invitation_redeemed',
      actor_user_id: user.id,
      actor_email: user.email,
      subject_user_id: access.sharer_user_id,
      metadata: { access_id: access.id },
    });

    return ok({
      relationship: publicRelationship(updated, now),
      // Redemption binds the follower; it grants nothing on its own.
      shared_nothing_yet: true,
      invited_email_normalized: normalizeEmail(user.email),
    });
  } catch (error: any) {
    console.error('[redeemSharingInvitation] failed:', error?.message || error);
    return fail('server_error', 500);
  }
}