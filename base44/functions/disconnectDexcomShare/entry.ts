// Disconnects the caller's Dexcom source and permanently deletes their
// encrypted credentials from the server-only vault.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { deleteDexcomCredentials } from '../../shared/dexcomCredentials.ts';
import { writeAuditLog } from '../../shared/auditLog.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const sr = base44.asServiceRole;
    await base44.entities.DexcomConnection.deleteMany({});
    await deleteDexcomCredentials(sr, user.id);

    await writeAuditLog(sr, { action: 'dexcom_disconnect', affected_user_id: user.id });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[disconnectDexcomShare]', error?.message);
    return Response.json({ error: 'Unable to disconnect right now.' }, { status: 500 });
  }
}