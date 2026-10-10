// Permanently purges every record belonging to the caller, including
// server-created records (keyed by user_id) and encrypted Dexcom
// credentials. Writes an audit event (no PHI) before purging.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.52';
import { deleteDexcomCredentials } from '../../shared/dexcomCredentials.ts';
import { writeAuditLog } from '../../shared/auditLog.ts';

// Entities owned via created_by_id only.
const OWNED = [
  'InsulinDose', 'CarbEntry', 'JournalEntry', 'UserSettings', 'DexcomConnection',
  'SplitDosePlan', 'SplitDosePreset', 'UserAcknowledgment', 'SupportTicket', 'CreatorSupport',
];
// Entities that may also be server-created with an explicit user_id.
const OWNED_OR_USER_ID = [
  'GlucoseReading', 'DailySummary', 'GlucoseEvent', 'MealResponseAnalysis', 'MealMatchFeedback',
  'UserPatternProfile', 'AnalysisJob', 'GlucoseProjection', 'ProjectionModelState',
  'MealResponseModelState', 'AbsorptionAdjustment',
];

async function purge(sr: any, entity: string, query: any) {
  // deleteMany is bounded per call; loop until nothing matches.
  for (let i = 0; i < 200; i++) {
    const res = await sr.entities[entity].deleteMany(query);
    const n = Number(res?.deleted ?? res?.count ?? 0);
    if (!n || res?.has_more === false) break;
  }
}

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const sr = base44.asServiceRole;

    await writeAuditLog(sr, { action: 'account_deletion_requested', affected_user_id: user.id });

    const failures: string[] = [];
    const tasks: Array<() => Promise<void>> = [
      ...OWNED.map((e) => () => purge(sr, e, { created_by_id: user.id })),
      ...OWNED_OR_USER_ID.map((e) => async () => {
        await purge(sr, e, { created_by_id: user.id });
        await purge(sr, e, { user_id: user.id });
      }),
      () => deleteDexcomCredentials(sr, user.id),
    ];

    for (let i = 0; i < tasks.length; i += 6) {
      const results = await Promise.allSettled(tasks.slice(i, i + 6).map((t) => t()));
      results.forEach((r, j) => { if (r.status === 'rejected') failures.push(String(i + j)); });
    }

    await writeAuditLog(sr, {
      action: failures.length ? 'account_deletion_partial' : 'account_deleted',
      affected_user_id: user.id,
      metadata: { failed_steps: failures.length },
    });

    if (failures.length) {
      return Response.json({ ok: false, error: 'Some data could not be removed. Please try again.' }, { status: 500 });
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[deleteMyAccount]', error?.message);
    return Response.json({ error: 'Unable to delete account right now.' }, { status: 500 });
  }
}