// Marks the authenticated user's onboarding as completed and writes an
// AuditLog entry. Called from the frontend after the user finishes (or
// skips through) the 3-step post-signup walkthrough.
//
// Updates the user's UserSettings record with onboarding_completed = true
// so the flow never re-triggers on any device. Writes an audit log entry
// via the service role (AuditLog create is admin-only via RLS).

import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import { writeAuditLog } from "../../shared/auditLog.ts";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    // Update or create the user's UserSettings with onboarding_completed.
    const settings = await base44.entities.UserSettings.list("-created_date", 1);
    if (settings.length > 0) {
      await base44.entities.UserSettings.update(settings[0].id, {
        onboarding_completed: true,
      });
    } else {
      await base44.entities.UserSettings.create({
        onboarding_completed: true,
        username: user.full_name || user.email,
      });
    }

    // Write audit log — service role bypasses the admin-only create RLS.
    const sr = base44.asServiceRole;
    await writeAuditLog(sr, {
      action: "onboarding_completed",
      affected_user_id: user.id,
      affected_user_email: user.email,
      metadata: { completed_at: new Date().toISOString() },
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}