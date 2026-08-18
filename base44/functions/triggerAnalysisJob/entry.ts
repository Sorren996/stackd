// Analysis job creation.
// Triggered by an entity automation when a GlucoseReading, InsulinDose, or
// CarbEntry is created. Creates a single incremental AnalysisJob (debounced)
// so runAnalysisJobs can drain it on its schedule. Uses the service role since
// entity automations run without a user in the request.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { ANALYSIS_VERSION } from '../../shared/analysisVersion.ts';

const DEBOUNCE_MS = 5 * 60 * 1000;
const SCHEDULE_DELAY_MS = 2 * 60 * 1000;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let payload: any = {};
    try { payload = await req.json(); } catch { /* entity automation always sends JSON */ }

    const event = payload.event || {};
    const data = payload.data || {};
    const userId = data.created_by_id || data.user_id;
    if (!userId) return Response.json({ ok: false, reason: 'no user_id' });

    const entityName = event.entity_name;
    const triggerType =
      entityName === 'GlucoseReading' ? 'glucose' :
      entityName === 'InsulinDose' ? 'insulin' :
      entityName === 'CarbEntry' ? 'carb' : 'unknown';

    const sr = base44.asServiceRole;

    // Debounce: if an incremental job for this user is already pending or
    // processing and scheduled within the debounce window, skip creating a
    // duplicate. This collapses rapid multi-log bursts into one analysis pass.
    const recent = await sr.entities.AnalysisJob.filter(
      { user_id: userId, job_type: 'incremental' },
      '-scheduled_for', 5
    );
    const now = Date.now();
    const activeStatuses = ['pending', 'processing', 'retry_scheduled'];
    const hasRecent = recent.some((j: any) =>
      activeStatuses.includes(j.status) &&
      Math.abs(now - new Date(j.scheduled_for).getTime()) < DEBOUNCE_MS
    );
    if (hasRecent) return Response.json({ ok: true, deduped: true });

    await sr.entities.AnalysisJob.create({
      user_id: userId,
      created_by_id: userId,
      job_type: 'incremental',
      trigger_record_id: event.entity_id,
      trigger_record_type: triggerType,
      scheduled_for: new Date(now + SCHEDULE_DELAY_MS).toISOString(),
      status: 'pending',
      analysis_version: ANALYSIS_VERSION,
    });

    return Response.json({ ok: true, created: true });
  } catch (error) {
    console.error('[triggerAnalysisJob] error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}