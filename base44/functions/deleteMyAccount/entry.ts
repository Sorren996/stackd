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
        ? 'Some of your records could not be removed, so your account is still open. Please try again.'
        : 'Your records were removed, but the sign-in could not be closed. Please try again.';
      return Response.json({ ok: false, code: result.code, error: message }, { status: 500 });
    }

    // One non-clinical record of the deletion is kept for the audit log. It
    // carries the account id and nothing else — no health data, no email.
    return Response.json({ ok: true, identityRemoved: true, residual: result.residual ?? 0 });
  } catch (error: any) {
    console.error('[deleteMyAccount]', error?.message);
    return Response.json(
      { ok: false, code: 'failed', error: 'Unable to close the account right now.' },
      { status: 500 },
    );
  }
}