// Validates a user's Dexcom Share credentials and saves them to their
// DexcomConnection record. The credentials are authenticated against the
// Dexcom Share service before being stored, so invalid credentials are
// rejected immediately rather than saved and discovered by the next sync.
//
// Runs as the authenticated user — the DexcomConnection is created under
// the user's own created_by_id, and RLS ensures only they can read it.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getShareSessionId } from '../../shared/dexcomShareSync.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let body: any = {};
    try { body = await req.json(); } catch {}
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) {
      return Response.json({ error: 'Please enter your Dexcom username and password.' }, { status: 400 });
    }

    // Validate credentials by attempting a Share authentication. If this
    // succeeds, the credentials are correct and we can safely store them.
    try {
      await getShareSessionId(username, password);
    } catch (error: any) {
      const friendly = error.shareCode === 'AccountPasswordInvalid'
        ? 'Your Dexcom username or password is incorrect. Please double-check and try again.'
        : 'Unable to reach Dexcom with those credentials. Please try again in a moment.';
      return Response.json({ error: friendly, code: error.shareCode || 'auth_failed' }, { status: 400 });
    }

    // Replace any existing connection (handles re-connect with new credentials)
    await base44.entities.DexcomConnection.deleteMany({});
    await base44.entities.DexcomConnection.create({
      share_username: username,
      share_password: password,
      status: 'connected',
      connected_at: new Date().toISOString(),
      last_sync_status: null,
      last_sync_error: null,
    });

    return Response.json({ ok: true, status: 'connected' });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}