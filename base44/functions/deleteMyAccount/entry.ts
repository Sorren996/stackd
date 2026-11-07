// Closes the caller's Stackd account.
//
// The user is always the authenticated identity from the request — never a
// user_id from the body. Sequence and scoping live in
// base44/shared/accountDeletion.ts: purge the account's own rows (including
// sharing relationships, invites and follower access), remove the app's auth
// user record through the documented service-role capability, confirm it is
// gone, then sweep records the app re-creates on demand.
//
// A deletion is only reported as successful once the identity has actually
// been removed. A partial purge keeps the account open and asks for a retry,
// because telling someone their account is gone while the sign-in still works
// would be false.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { closeAccount } from '../../shared/accountDeletion.ts';
import { writeAuditLog } from '../../shared/auditLog.ts';

// Fixed, non-secret confirmation token: a deliberate second step in the client,
// not a credential. Authenticating the caller is what protects the endpoint.
const CONFIRMATION = 'delete-my-account';

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    // A signed-out caller rejects rather than resolving null; that is a 401,
    // not a crash.
    const user = await base44.auth.me().catch((error: any) => {
      if (error?.status === 401) return null;
      throw error;
    });
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== CONFIRMATION) {
      return Response.json({ error: 'Please confirm the deletion.', code: 'not_confirmed' }, { status: 400 });
    }

    // Authorization is the verified session, so the scope is this user only.
    const userId = user.id;
    const sr = base44.asServiceRole;

    await writeAuditLog(sr, { action: 'account_deletion_requested', affected_user_id: userId });

    const result = await closeAccount(sr, userId, (action, metadata) =>
      writeAuditLog(sr, { action, affected_user_id: userId, metadata }),
    );

    if (!result.ok) {
      const message = result.code === 'purge_incomplete'
        ? 'Some records could not be removed, so your account is still open. Nothing was signed out, and trying again picks up where it stopped.'
        : 'Your records were removed, but the sign-in could not be closed. Nothing was signed out. Please try again.';
      // Stage + class only — the entity that failed and why (rate_limited,
      // permission_denied, unavailable…), never a message, a credential or a
      // health value. The same codes sit in the audit metadata.
      console.error('[deleteMyAccount] stage_failure', {
        support_ref: result.supportRef,
        code: result.code,
        stages: (result.failed || []).map((f) => `${f.label}:${f.code}${f.status ? `:${f.status}` : ''}`),
      });
      return Response.json(
        {
          ok: false,
          code: result.code,
          error: message,
          support_ref: result.supportRef,
          failed_steps: result.failed?.length ?? 0,
          retryable: true,
        },
        { status: 503 },
      );
    }

    // One non-clinical record of the deletion is kept for the audit log. It
    // carries the account id and nothing else — no health data, no email.
    return Response.json({ ok: true, identityRemoved: true, residual: result.residual ?? 0 });
  } catch (error: any) {
    // The error class only: the request carries no health data, and the
    // provider's own message is not ours to log.
    console.error('[deleteMyAccount] unexpected', { name: error?.name ?? 'Error' });
    return Response.json(
      {
        ok: false,
        code: 'failed',
        error: 'We could not finish closing your account just now. Your account is still open. Please try again.',
        retryable: true,
      },
      { status: 500 },
    );
  }
}