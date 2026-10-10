// Centralized audit logging utility.
// Writes AuditLog records for significant user/admin actions.
// NEVER logs credentials, PHI, or sensitive values — only the event
// descriptor and non-sensitive metadata (entity IDs, action type,
// timestamps).

export async function writeAuditLog(sr: any, entry: {
  action: string;
  admin_user_id?: string;
  admin_email?: string;
  affected_user_id?: string;
  affected_user_email?: string;
  reason?: string;
  metadata?: Record<string, any>;
}): Promise<void> {
  try {
    await sr.entities.AuditLog.create({
      action: entry.action,
      admin_user_id: entry.admin_user_id || null,
      admin_email: entry.admin_email || null,
      affected_user_id: entry.affected_user_id || null,
      affected_user_email: entry.affected_user_email || null,
      reason: entry.reason || null,
      metadata: entry.metadata || {},
    });
  } catch (error) {
    // Audit log failure must never break the user flow — log and continue.
    console.error("[auditLog] failed to write:", error?.message || error);
  }
}