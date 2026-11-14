// One-time migration to the six-row notification model (Nov 13 2026).
//
// Every saved preference row becomes one Low level, one High level, one
// Changing fast row, one Sensor problems row — with urgent low always on — while
// keeping the per-category mirrors the decision engine already reads. Nothing is
// deleted and nothing that was switched on is dropped:
//
//   • Low  = the LOWEST low threshold the account had enabled
//            (custom low, the fixed 70, or its own target-range floor)
//   • High = the LOWEST high threshold it had enabled
//            (custom high, or its target-range ceiling); default 180
//   • a saved "sustained" delay is kept as the optional fifteen minutes
//   • any low rule on means Low is on; likewise High
//
// Idempotent: a row already on model version 2 is skipped, so running it twice
// changes nothing and writes no second audit entry. Admin only, because it
// rewrites other accounts' settings.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";
import { writeAuditLog } from "../../shared/auditLog.ts";
import {
  OWNER_MODEL_VERSION,
  migrationSummary,
  ownerPreferencePayload,
  withLegacyMirrors,
} from "../../shared/notificationModel.ts";

const PAGE = 100;

async function allRows(entity: any) {
  const rows: any[] = [];
  let cursor: string | null = null;
  do {
    const page: any = await entity.filter({}, { sort: "-created_date", limit: PAGE, ...(cursor ? { cursor } : {}) });
    const items = Array.isArray(page) ? page : page?.items || [];
    rows.push(...items);
    cursor = page?.has_more ? page.next_cursor : null;
  } while (cursor);
  return rows;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch((error: any) => (error?.status === 401 ? null : Promise.reject(error)));
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    if (user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const dryRun = body?.dry_run === true;

    const sr = base44.asServiceRole;
    const rows = await allRows(sr.entities.NotificationPreference);

    const migrated: any[] = [];
    const skipped: string[] = [];
    const ranges = new Map<string, any>();

    for (const row of rows) {
      if (Number(row.model_version) === OWNER_MODEL_VERSION) {
        skipped.push(row.id);
        continue;
      }
      const ownerId = row.user_id || row.created_by_id;
      if (!ranges.has(ownerId)) {
        const settings: any = ownerId
          ? await sr.entities.UserSettings.filter({ created_by_id: ownerId }, { sort: "-updated_date", limit: 1 })
          : [];
        const held = Array.isArray(settings) ? settings[0] : settings?.items?.[0];
        ranges.set(ownerId, { targetLow: held?.target_range_low ?? null, targetHigh: held?.target_range_high ?? null });
      }
      const migratedRecord = withLegacyMirrors(row, ranges.get(ownerId));
      const summary = migrationSummary(row, migratedRecord);

      if (!dryRun) {
        await sr.entities.NotificationPreference.update(row.id, ownerPreferencePayload(migratedRecord));
        await writeAuditLog(sr, {
          action: "notifications.model_migrated",
          admin_user_id: user.id,
          admin_email: user.email,
          affected_user_id: ownerId,
          reason: "Six-row notification model (Nov 13 2026)",
          metadata: summary,
        });
      }
      migrated.push({ id: row.id, user_id: ownerId, ...summary });
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      model_version: OWNER_MODEL_VERSION,
      total: rows.length,
      migrated: migrated.length,
      skipped: skipped.length,
      accounts: migrated,
    });
  } catch (error: any) {
    console.error("[migrateNotificationModel] failed:", error?.message || "unexpected error");
    return Response.json({ error: "The migration could not be completed." }, { status: 500 });
  }
}