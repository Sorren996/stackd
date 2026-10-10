// Records an audit event for an action performed in the frontend.
// Only allowlisted actions are accepted; the affected user is always the
// caller (never client-supplied). Admin actions require the admin role.
// Metadata is reduced to short scalar values — never credentials or PHI.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { writeAuditLog } from '../../shared/auditLog.ts';

const USER_ACTIONS = new Set([
  'consent_withdrawn',
  'consent_acknowledged',
  'settings_confirmed',
  'settings_unconfirmed',
]);

const ADMIN_ACTIONS = new Set([
  'support_ticket_updated',
  'support_data_accessed',
]);

function sanitizeMetadata(raw: any) {
  const out: Record<string, string | number | boolean> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [k, v] of Object.entries(raw).slice(0, 8)) {
    if (typeof v === 'boolean' || typeof v === 'number') out[k] = v;
    else if (typeof v === 'string') out[k] = v.slice(0, 64);
  }
  return out;
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const isAdminAction = ADMIN_ACTIONS.has(action);

    if (!USER_ACTIONS.has(action) && !isAdminAction) {
      return Response.json({ error: 'Unsupported action' }, { status: 400 });
    }
    if (isAdminAction && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    await writeAuditLog(base44.asServiceRole, {
      action,
      admin_user_id: isAdminAction ? user.id : undefined,
      affected_user_id: isAdminAction ? (typeof body.target_user_id === 'string' ? body.target_user_id : undefined) : user.id,
      metadata: sanitizeMetadata(body.metadata),
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[logAuditEvent]', error?.message);
    return Response.json({ error: 'Unable to record event' }, { status: 500 });
  }
}