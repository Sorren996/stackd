// Validates a user's Dexcom Share credentials, then stores them ENCRYPTED
// (AES-256-GCM) in the server-only DexcomCredential vault. The user-visible
// DexcomConnection record holds status only — never credentials.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getShareSessionId } from '../../shared/dexcomShareSync.ts';
import { saveDexcomCredentials } from '../../shared/dexcomCredentials.ts';
import { writeAuditLog } from '../../shared/auditLog.ts';

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

    try {
      await getShareSessionId(username, password);
    } catch (error: any) {
      const friendly = error.shareCode === 'AccountPasswordInvalid'
        ? 'Your Dexcom username or password is incorrect. Please double-check and try again.'
        : 'Unable to reach Dexcom with those credentials. Please try again in a moment.';
      return Response.json({ error: friendly, code: error.shareCode || 'auth_failed' }, { status: 400 });
    }

    const sr = base44.asServiceRole;

    await base44.entities.DexcomConnection.deleteMany({});
    const conn = await base44.entities.DexcomConnection.create({
      status: 'connected',
      connected_at: new Date().toISOString(),
      last_sync_status: null,
      last_sync_error: null,
    });

    await saveDexcomCredentials(sr, user.id, conn.id, username, password);

    await writeAuditLog(sr, {
      action: 'dexcom_connect',
      affected_user_id: user.id,
      metadata: { connection_id: conn.id },
    });

    return Response.json({ ok: true, status: 'connected' });
  } catch (error) {
    console.error('[connectDexcomShare]', error?.message);
    return Response.json({ error: 'Unable to connect right now. Please try again.' }, { status: 500 });
  }
}