// Owner-side changes to a sharing relationship.
//
// One guarded entry point for every change an owner can make, so the
// permission bump, the timestamp and the audit record can never be forgotten
// on one path. Ownership is verified against the authenticated caller before
// anything is read or written.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { encryptSharingValue } from '../../shared/sharingCrypto.ts';
import { sanitizeScopes, normalizePhoneDigits, normalizeCountryCode, maskPhone } from '../../shared/sharingCore.ts';
import {
  ok,
  fail,
  asArray,
  currentUser,
  readBody,
  loadOwnedRelationship,
  publicRelationship,
  scopePatch,
  alertScopePatch,
  audit,
} from '../../shared/sharingAccess.ts';

const EMPTY_SCOPES = { glucose: false, insulin: false, location: false, urgent_low_call: false };
const EMPTY_ALERTS = { urgent_low_email: false, urgent_low_sms: false };

export default async function (req: Request): Promise<Response> {
  try {
    if (req.method !== 'POST') return fail('method_not_allowed', 405);

    const base44 = createClientFromRequest(req);
    const user = await currentUser(base44);
    if (!user) return fail('unauthorized', 401);

    const body = await readBody(req);
    const action = typeof body.action === 'string' ? body.action : '';
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    // Saving a number on its own is a setting on the owner's account, not a
    // change to any one relationship, so it needs no access id. Everything else
    // changes a relationship and is verified against the caller first.
    const needsRelationship = action !== 'set_contact' || typeof body.release === 'boolean';
    let access: any = null;
    if (needsRelationship) {
      const loaded = await loadOwnedRelationship(base44, user.id, body.access_id);
      if (loaded.error) return fail(loaded.error, loaded.status || 400);
      access = loaded.access;
    }

    const sr = base44.asServiceRole;
    const db = base44.entities;
    let patch: Record<string, any> = {};
    let extra: Record<string, any> = {};

    if (action === 'set_scopes') {
      if (access.status === 'revoked') return fail('revoked', 409);
      const scopes = scopePatch(body.scopes);
      const alerts = sanitizeScopes(access.alert_scopes);
      const wasGlucoseOn = sanitizeScopes(access.scopes).glucose;

      patch.scopes = scopes;

      // Alert channels are only meaningful while the glucose scope is on, so
      // withdrawing glucose switches them off rather than leaving a switch that
      // claims to be armed when nothing can fire.
      if (wasGlucoseOn && !scopes.glucose) {
        const hadAlerts = Object.values(sanitizeScopes(access.alert_scopes)).some(Boolean);
        patch.alert_scopes = { ...EMPTY_ALERTS };
        extra.alerts_cleared = hadAlerts;
      } else if (!scopes.glucose) {
        patch.alert_scopes = { ...EMPTY_ALERTS };
      }
    } else if (action === 'set_alerts') {
      if (access.status === 'revoked') return fail('revoked', 409);
      const currentScopes = sanitizeScopes(access.scopes);
      const next = alertScopePatch(body.alert_scopes);
      const wantsAlerts = next.urgent_low_email || next.urgent_low_sms;
      if (wantsAlerts && !currentScopes.glucose) {
        return fail('glucose_scope_required_for_alerts', 409);
      }
      patch.alert_scopes = next;
    } else if (action === 'set_contact') {
      // Saving a number on its own arrives with no relationship loaded.
      if (access && access.status === 'revoked') return fail('revoked', 409);

      const hasPhone = typeof body.phone === 'string' && body.phone.trim() !== '';
      if (hasPhone) {
        const digits = normalizePhoneDigits(body.phone);
        if (digits.length < 6 || digits.length > 15) return fail('invalid_phone', 400);
        const countryCode = normalizeCountryCode(body.country_code);
        const phoneEnc = await encryptSharingValue(digits);
        const existing = asArray(await sr.entities.SharerContact.filter({ user_id: user.id }))[0];
        if (existing?.id) {
          await sr.entities.SharerContact.update(existing.id, {
            country_code: countryCode,
            phone_enc: phoneEnc,
            key_version: 'v1',
          });
        } else {
          await sr.entities.SharerContact.create({
            user_id: user.id,
            country_code: countryCode,
            phone_enc: phoneEnc,
            key_version: 'v1',
          });
        }
        extra.contact_masked = maskPhone(countryCode, digits);
      }

      if (typeof body.release === 'boolean') {
        if (body.release) {
          const row = asArray(await sr.entities.SharerContact.filter({ user_id: user.id }))[0];
          if (!row?.phone_enc) return fail('no_contact_number', 400);
          // Releasing to a follower also requires the call permission they
          // would use it for; refuse rather than hand out a number that has no
          // purpose on the relationship.
          const scopes = sanitizeScopes(access.scopes);
          if (!scopes.urgent_low_call) return fail('call_permission_required', 409);
        }
        patch.contact_shared = body.release;
      }
    } else if (action === 'pause') {
      if (access.status !== 'active') return fail('not_active', 409);
      patch.status = 'paused';
      patch.paused_at = nowIso;
    } else if (action === 'resume') {
      if (access.status !== 'paused') return fail('not_paused', 409);
      patch.status = 'active';
      patch.paused_at = null;
    } else if (action === 'revoke') {
      if (access.status === 'revoked') return fail('already_revoked', 409);
      patch = {
        status: 'revoked',
        revoked_at: nowIso,
        // Every grant is withdrawn; a permanent revocation keeps no scope armed.
        scopes: { ...EMPTY_SCOPES },
        alert_scopes: { ...EMPTY_ALERTS },
        contact_shared: false,
      };
      await db.SharedInvitation.updateMany(
        { shared_access_id: access.id, status: 'pending' },
        { $set: { status: 'canceled' } }
      ).catch(() => {});
    } else {
      return fail('unsupported_action', 400);
    }

    // A number saved on its own touches no relationship.
    if (!needsRelationship) return ok({ ...extra });

    patch.permission_version = (Number(access.permission_version) || 1) + 1;
    patch.last_scope_change_at = nowIso;

    await sr.entities.SharedAccess.update(access.id, patch);
    const updated = await sr.entities.SharedAccess.get(access.id);

    await audit(base44, {
      action: `sharing.${action}`,
      actor_user_id: user.id,
      actor_email: user.email,
      subject_user_email: access.invited_email,
      reason: action,
      metadata: { access_id: access.id, permission_version: patch.permission_version },
    });

    return ok({
      relationship: publicRelationship(updated, now),
      ...extra,
    });
  } catch (error: any) {
    console.error('[updateSharingScopes] failed:', error?.message || error);
    return fail('server_error', 500);
  }
}