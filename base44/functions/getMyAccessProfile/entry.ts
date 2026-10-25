// What this account IS.
//
// Resolved server-side from authoritative data before any patient gate is
// applied: an account that only follows someone is a viewer, and never has to
// accept patient medical acknowledgments, pick an insulin library or connect a
// sensor. Nothing here is health data and nothing here is authority — every
// shared read is re-checked by getSharedView on its own.
//
// Deliberately narrow: "this person also tracks for themselves" is derived from
// AUTHORED records, a connected sensor, or an explicit opt-in the person pressed.
// It is never inferred from onboarding or settings flags, so an invited viewer
// who was accidentally walked through patient set-up is not mistaken for a
// patient — and no existing account is ever reclassified from a guess.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { normalizeEmail } from '../../shared/sharingCore.ts';
import {
  ok,
  fail,
  asArray,
  currentUser,
  publicRelationship,
  audit,
  readBody,
} from '../../shared/sharingAccess.ts';

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    const body = await readBody(req);
    const now = Date.now();
    const myEmail = normalizeEmail(user.email);
    const sr = base44.asServiceRole;

    // Explicit opt-in. Called only from a control the person themselves presses,
    // and it records intent only — no health record, no consent and no plan is
    // written on their behalf, so the full patient set-up still runs unchanged.
    if (body.action === 'enable_self_tracking') {
      const existing = asArray(
        await base44.entities.UserSettings.filter({ created_by_id: user.id }, { sort: '-updated_date', limit: 1 })
      );
      const settings = existing[0];
      if (settings?.id) {
        await base44.entities.UserSettings.update(settings.id, { self_tracking_enabled: true });
      } else {
        await base44.entities.UserSettings.create({
          self_tracking_enabled: true,
          username: user.full_name || myEmail,
        });
      }
      await audit(base44, {
        action: 'access.self_tracking_enabled',
        actor_user_id: user.id,
        actor_email: user.email,
      });
      return ok({ self_tracking_enabled: true, mode: 'patient' });
    }

    const [relationshipRows, invitationRows] = await Promise.all([
      sr.entities.SharedAccess.filter({ follower_user_id: user.id }, { sort: '-created_date', limit: 100 }),
      sr.entities.SharedInvitation.filter({ invited_email: myEmail }, { sort: '-created_date', limit: 50 }),
    ]);

    const following = asArray(relationshipRows).map((row: any) => publicRelationship(row, now));

    // Only invitations addressed to this verified address, and never the token
    // or its hash: the link itself stays in the recipient's inbox.
    const pendingInvitations = asArray(invitationRows)
      .filter((inv: any) => {
        if (inv.status !== 'pending') return false;
        if (!inv.expires_at) return true;
        return new Date(inv.expires_at).getTime() > now;
      })
      .map((inv: any) => ({
        id: inv.id,
        sharer_display_name: inv.sharer_display_name || null,
        shared_access_id: inv.shared_access_id || null,
        expires_at: inv.expires_at || null,
        delivery_status: inv.delivery_status || null,
      }));

    const isFollower = following.length > 0 || pendingInvitations.length > 0;

    // Not following anyone: a patient, exactly as before. No extra reads and no
    // behavioural change for every existing account.
    if (!isFollower) {
      return ok({
        mode: 'patient',
        is_follower: false,
        self_tracking_enabled: false,
        patient_signals: false,
        following: [],
        pending_invitations: [],
        notice: null,
      });
    }

    const [noticeRowList, settingsRows, glucoseRows, carbRows] = await Promise.all([
      sr.entities.FollowerNotice.filter({ created_by_id: user.id }, { sort: '-accepted_at', limit: 5 }).catch(() => []),
      sr.entities.UserSettings.filter({ created_by_id: user.id }, { sort: '-updated_date', limit: 1 }).catch(() => []),
      sr.entities.GlucoseReading.filter({ created_by_id: user.id }, { limit: 1 }).catch(() => []),
      sr.entities.CarbEntry.filter({ created_by_id: user.id }, { limit: 1 }).catch(() => []),
    ]);
    const [doseRows, journalRows, dexcomRows] = await Promise.all([
      sr.entities.InsulinDose.filter({ created_by_id: user.id }, { limit: 1 }).catch(() => []),
      sr.entities.JournalEntry.filter({ created_by_id: user.id }, { limit: 1 }).catch(() => []),
      sr.entities.DexcomConnection.filter({ created_by_id: user.id }, { limit: 1 }).catch(() => []),
    ]);

    const settings = asArray(settingsRows)[0] || null;
    const selfTracking = settings?.self_tracking_enabled === true;
    const authored =
      asArray(glucoseRows).length > 0 ||
      asArray(carbRows).length > 0 ||
      asArray(doseRows).length > 0 ||
      asArray(journalRows).length > 0;
    const hasSensor = asArray(dexcomRows).length > 0;
    const patientSignals = authored || hasSensor || selfTracking;

    const noticeRows = asArray(noticeRowList);
    const latestNotice = noticeRows.find((row: any) => !row.withdrawn_at) || null;

    return ok({
      mode: patientSignals ? 'patient' : 'follower',
      is_follower: true,
      self_tracking_enabled: selfTracking,
      patient_signals: patientSignals,
      following,
      pending_invitations: pendingInvitations,
      notice: latestNotice
        ? {
            version: latestNotice.notice_version || null,
            accepted_at: latestNotice.accepted_at || null,
            withdrawn_at: latestNotice.withdrawn_at || null,
          }
        : null,
    });
  } catch (error: any) {
    console.error('[getMyAccessProfile] failed:', error?.message || error);
    return fail('server_error', 500);
  }
}