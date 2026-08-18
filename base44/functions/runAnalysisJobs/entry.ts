// Analysis job orchestrator.
// Drains due AnalysisJob records (pending / retry_scheduled), runs the
// deterministic glucose-event detection, dedups against existing events,
// and stores GlucoseEvent records. Runs on a schedule with no user context,
// so it uses the service role and only reads data for users with active
// health-data consent. Meal-response analysis is handled by processMealAnalyses,
// so meal_completion jobs are a no-op here.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import {
  detectHighEvents,
  detectLowEvents,
  analyzeCorrectionResponse,
  analyzeOvernightWindow,
  isCorrectionDose,
  GlucoseEventDraft,
} from '../../shared/glucoseEventDetection.ts';
import { AnalysisSettings } from '../../shared/mealResponseAnalysis.ts';
import { ANALYSIS_VERSION, MAX_JOB_ATTEMPTS, RETRY_BASE_SECONDS } from '../../shared/analysisVersion.ts';


const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const BATCH_LIMIT = 10;
const DEDUP_BUCKET_MS = 5 * MINUTE_MS;

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    let body: any = {};
    try { body = await req.json(); } catch { /* scheduler may send empty body */ }
    const limit = Math.min(Number(body.limit) || BATCH_LIMIT, BATCH_LIMIT);
    const sr = base44.asServiceRole;
    const now = new Date();
    const nowISO = now.toISOString();

    // Fetch due jobs (avoid top-level $or — two simple queries).
    const [pending, retrying] = await Promise.all([
      sr.entities.AnalysisJob.filter(
        { status: 'pending', scheduled_for: { $lte: nowISO } },
        'scheduled_for', limit
      ),
      sr.entities.AnalysisJob.filter(
        { status: 'retry_scheduled', scheduled_for: { $lte: nowISO } },
        'scheduled_for', limit
      ),
    ]);
    const jobs = [...pending, ...retrying].slice(0, limit);

    let processed = 0;
    let eventsCreated = 0;
    let failed = 0;
    const errors: any[] = [];

    for (const job of jobs) {
      processed++;
      const userId = job.user_id || job.created_by_id;
      if (!userId) {
        await markFailed(sr, job, 'job has no user_id', now);
        failed++;
        continue;
      }

      // Respect health-data consent — withdrawing consent must stop analysis.
      try {
        const users = await sr.entities.User.filter({ id: userId }, '-created_date', 1);
        if (!users[0] || users[0].health_data_consent_active === false) {
          await sr.entities.AnalysisJob.update(job.id, {
            status: 'completed_no_insight',
            completed_at: nowISO,
            result_summary: { reason: 'consent' },
          });
          continue;
        }
      } catch (consentError: any) {
        await markFailed(sr, job, `consent check failed: ${consentError.message}`, now);
        failed++;
        errors.push({ jobId: job.id, error: consentError.message });
        continue;
      }

      // Lock the job.
      try {
        await sr.entities.AnalysisJob.update(job.id, { status: 'processing', locked_at: nowISO });
      } catch {
        continue; // another worker may have locked it
      }

      try {
        const settings = await loadSettings(sr, userId);
        const windowDays = windowDaysForJob(job.job_type);
        const windowStart = new Date(now.getTime() - windowDays * DAY_MS);
        const windowStartISO = windowStart.toISOString();
        const insulinWindowISO = new Date(now.getTime() - 5 * DAY_MS).toISOString();

        const [glucose, carbs, insulin] = await Promise.all([
          sr.entities.GlucoseReading.filter(
            { recorded_at: { $gte: windowStartISO }, created_by_id: userId },
            '-recorded_at', 2000
          ),
          sr.entities.CarbEntry.filter(
            { consumed_at: { $gte: windowStartISO }, created_by_id: userId },
            '-consumed_at', 1000
          ),
          sr.entities.InsulinDose.filter(
            { administered_at: { $gte: insulinWindowISO }, created_by_id: userId },
            '-administered_at', 2000
          ),
        ]);

        const drafts: GlucoseEventDraft[] = [];

        if (job.job_type !== 'meal_completion') {
          drafts.push(...detectHighEvents(glucose, insulin, carbs, settings));
          drafts.push(...detectLowEvents(glucose, insulin, carbs, settings));

          if (job.job_type === 'incremental' || job.job_type === 'daily' || job.job_type === 'manual') {
            const correctionDoses = insulin.filter((d: any) =>
              isCorrectionDose(d) &&
              new Date(d.administered_at).getTime() >= windowStart.getTime()
            );
            for (const dose of correctionDoses) {
              const draft = analyzeCorrectionResponse(dose, glucose, insulin, carbs, settings);
              if (draft) drafts.push(draft);
            }
          }

          if (job.job_type === 'daily' || job.job_type === 'backfill' || job.job_type === 'manual') {
            const nights = Math.min(windowDays, 3);
            for (let d = 0; d < nights; d++) {
              const date = new Date(now.getTime() - d * DAY_MS);
              const draft = analyzeOvernightWindow(glucose, date.toISOString(), insulin, carbs, settings);
              if (draft) drafts.push(draft);
            }
          }
        }

        // Dedup against existing events in the window.
        const existing = await sr.entities.GlucoseEvent.filter(
          { user_id: userId, start_time: { $gte: windowStartISO } },
          '-start_time', 2000
        );
        const existingKeys = new Set(
          existing.map((e: any) => dedupKey(e.event_type, e.start_time))
        );
        const fresh = drafts.filter(
          (d) => !existingKeys.has(dedupKey(d.event_type, d.start_time))
        );

        let created = 0;
        if (fresh.length) {
          const records = fresh.map((d) => ({
            user_id: userId,
            created_by_id: userId,
            event_type: d.event_type,
            start_time: d.start_time,
            end_time: d.end_time,
            starting_glucose: d.starting_glucose,
            peak_glucose: d.peak_glucose,
            peak_time: d.peak_time,
            lowest_glucose: d.lowest_glucose,
            lowest_time: d.lowest_time,
            ending_glucose: d.ending_glucose,
            duration_minutes: d.duration_minutes,
            rate_of_rise: d.rate_of_rise,
            associated_meal_ids: d.associated_meal_ids,
            associated_insulin_ids: d.associated_insulin_ids,
            associated_activity_ids: d.associated_activity_ids,
            active_insulin_at_start: d.active_insulin_at_start,
            additional_insulin_units: d.additional_insulin_units,
            rescue_carbs: d.rescue_carbs,
            metrics: d.metrics,
            time_to_return_to_range_minutes: d.time_to_return_to_range_minutes,
            remained_unresolved: d.remained_unresolved,
            confounders: d.confounders,
            classification: d.classification,
            confidence: d.confidence,
            analysis_version: ANALYSIS_VERSION,
            source_analysis_job_id: job.id,
          }));
          await sr.entities.GlucoseEvent.bulkCreate(records);
          created = records.length;
        }

        eventsCreated += created;

        await sr.entities.AnalysisJob.update(job.id, {
          status: created > 0 ? 'completed' : 'completed_no_insight',
          completed_at: nowISO,
          analysis_version: ANALYSIS_VERSION,
          result_summary: {
            eventsCreated: created,
            drafts: drafts.length,
            byType: groupByType(drafts),
          },
        });
      } catch (err: any) {
        await handleJobError(sr, job, err, now);
        failed++;
        errors.push({ jobId: job.id, error: err.message });
      }
    }

    console.log(`[runAnalysisJobs] processed=${processed} eventsCreated=${eventsCreated} failed=${failed}`);

    return Response.json({
      processed,
      eventsCreated,
      failed,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('[runAnalysisJobs] fatal:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function dedupKey(eventType: string, startTime: string): string {
  const t = new Date(startTime).getTime();
  const bucket = Number.isFinite(t) ? Math.round(t / DEDUP_BUCKET_MS) * DEDUP_BUCKET_MS : startTime;
  return `${eventType}:${bucket}`;
}

function windowDaysForJob(type: string): number {
  switch (type) {
    case 'incremental': return 2;
    case 'daily': return 1;
    case 'backfill': return 14;
    case 'manual': return 1;
    default: return 1;
  }
}

function groupByType(drafts: GlucoseEventDraft[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of drafts) out[d.event_type] = (out[d.event_type] || 0) + 1;
  return out;
}

async function loadSettings(sr: any, userId: string): Promise<AnalysisSettings> {
  const rows = await sr.entities.UserSettings.filter({ created_by_id: userId }, '-created_date', 1);
  const s = rows[0] || {};
  return {
    targetLow: Number(s.target_range_low) || 70,
    targetHigh: Number(s.target_range_high) || 180,
    preMealWindowMinutes: Number(s.meal_prebolus_window_minutes) || 45,
    postMealWindowMinutes: Number(s.meal_postbolus_window_minutes) || 90,
  };
}

async function markFailed(sr: any, job: any, message: string, now: Date) {
  await handleJobError(sr, job, new Error(message), now);
}

async function handleJobError(sr: any, job: any, err: Error, now: Date) {
  const attempt = (Number(job.attempt_count) || 0) + 1;
  if (attempt >= MAX_JOB_ATTEMPTS) {
    await sr.entities.AnalysisJob.update(job.id, {
      status: 'failed',
      completed_at: now.toISOString(),
      attempt_count: attempt,
      last_error: err.message,
    });
  } else {
    const retryAt = new Date(now.getTime() + RETRY_BASE_SECONDS * Math.pow(2, attempt - 1) * 1000);
    await sr.entities.AnalysisJob.update(job.id, {
      status: 'retry_scheduled',
      attempt_count: attempt,
      next_retry_at: retryAt.toISOString(),
      last_error: err.message,
    });
  }
}