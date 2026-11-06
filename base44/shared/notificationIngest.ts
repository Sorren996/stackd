// Server-side hand-off from "a reading was stored" to "the notification rules
// ran".
//
// Why this exists: every real CGM path (Share sync, API sync, the manual fetch
// helper) persists readings with GlucoseReading.bulkCreate. A bulk write does
// not emit per-record entity `create` events, so the GlucoseReading entity
// trigger never fires for them — verified in this app: readings stored every 5
// minutes while no GlucoseReading create-trigger had run since the last
// single-record write. Ingestion therefore calls this itself, in-process.
//
// Contract:
//   • awaited by ingestion, never fire-and-forget, so it cannot be killed when
//     the ingestion function returns;
//   • cannot throw — a notification problem never blocks or rolls back a
//     successfully stored reading; it is deferred to the sweep instead;
//   • no client can reach it: it is imported by server ingestion modules and
//     never exposed as an endpoint, and the owner always comes from the stored
//     connection record, never from a request body;
//   • duplicate protection is the atomic per-recipient claim inside
//     notificationDispatch.ts, shared by this path, the entity trigger and the
//     sweep, so multiple routes cannot send the same event twice.

import { asArray } from './sharingAccess.ts';
import { evaluateOwnerNotifications } from './notificationEvaluation.ts';

const RETRY_ENTITY = 'NotificationDispatchJob';
/** Bounded so a permanently broken send cannot retry for ever. */
export const MAX_DISPATCH_ATTEMPTS = 6;
const RETRY_BASE_MS = 2 * 60 * 1000;

/** Published app origin, used when a caller has no request to read it from. */
export const FALLBACK_APP_ORIGIN = 'https://stackdinsight.base44.app';

/**
 * A short, non-sensitive classification of a dispatch failure. The message is
 * never stored or returned: it can carry query fragments or values.
 */
export function dispatchErrorCode(error: any): string {
  const status = Number(error?.status ?? error?.code);
  if (status === 401 || status === 403) return 'dispatch_unauthorized';
  if (status === 429) return 'dispatch_rate_limited';
  if (status === 408 || status === 504) return 'dispatch_timeout';
  if (status >= 500) return 'dispatch_upstream_error';
  return 'dispatch_error';
}

function originFor(origin?: string) {
  const base = typeof origin === 'string' && origin.startsWith('http')
    ? origin.replace(/\/+$/, '')
    : FALLBACK_APP_ORIGIN;
  return (path: string) => `${base}${path}`;
}

/**
 * Retain a recoverable job so the next sweep can try again. Deliberately
 * best-effort: if even this write fails, the sweep's reconciliation of stored
 * readings is still the safety net.
 */
export async function enqueueDispatchRetry({
  sr,
  ownerId,
  readingIds = [],
  code,
  errorName = null,
  nowMs = Date.now(),
}: {
  sr: any;
  ownerId: string;
  readingIds?: string[];
  code: string;
  errorName?: string | null;
  nowMs?: number;
}) {
  try {
    return await sr.entities[RETRY_ENTITY].create({
      owner_user_id: ownerId,
      reading_ids: readingIds.filter(Boolean).slice(0, 20),
      status: 'pending',
      attempts: 0,
      last_error_code: code,
      last_error_name: errorName ? String(errorName).slice(0, 40) : null,
      next_attempt_at: new Date(nowMs + RETRY_BASE_MS).toISOString(),
    });
  } catch {
    return null;
  }
}

/**
 * Run the shared evaluator for one owner right after real readings are stored.
 * Returns a small status; it never throws.
 */
export async function notifyAfterPersist({
  sr,
  ownerId,
  readingIds = [],
  origin,
  nowMs = Date.now(),
}: {
  sr: any;
  ownerId?: string | null;
  readingIds?: string[];
  origin?: string;
  nowMs?: number;
}) {
  if (!ownerId) return { dispatched: false, reason: 'no_owner' };
  const absoluteUrl = originFor(origin);
  try {
    const result = await evaluateOwnerNotifications({ sr, ownerId, nowMs, absoluteUrl });
    return { dispatched: true, recipients: result.recipients, counters: result.counters };
  } catch (error: any) {
    const code = dispatchErrorCode(error);
    await enqueueDispatchRetry({ sr, ownerId, readingIds, code, errorName: error?.name, nowMs });
    // Sanitized: a code, never the message, never a reading or a value.
    console.error(
      JSON.stringify({
        diagStage: 'NOTIFICATION_DISPATCH_DEFERRED',
        function: 'notifyAfterPersist',
        error_code: code,
        error_name: String(error?.name || 'Error').slice(0, 40),
        stack_head: String(error?.stack || '').split('\n').slice(0, 3).join(' | ').slice(0, 300),
      })
    );
    return { dispatched: false, reason: 'dispatch_deferred', code };
  }
}

/**
 * Retry deferred dispatches and reconcile readings that were stored but never
 * evaluated. Runs inside the 5-minute sweep.
 *
 * A retry re-evaluates from the newest stored measurement, so a job left over
 * from an old incident can never be delivered as a current alert.
 */
export async function reconcilePendingDispatches({
  sr,
  origin,
  nowMs = Date.now(),
  limit = 25,
}: {
  sr: any;
  origin?: string;
  nowMs?: number;
  limit?: number;
}) {
  const absoluteUrl = originFor(origin);
  const jobs = asArray(
    await sr.entities[RETRY_ENTITY].filter({ status: 'pending' }, { sort: 'created_date', limit })
  );
  const result = { attempted: 0, recovered: 0, rescheduled: 0, exhausted: 0 };

  for (const job of jobs) {
    if (Date.parse(job.next_attempt_at || 0) > nowMs) continue;
    const attempts = Number(job.attempts) || 0;
    const ownerId = job.owner_user_id;

    if (!ownerId) {
      await sr.entities[RETRY_ENTITY].update(job.id, { status: 'failed', last_error_code: 'no_owner' });
      result.exhausted++;
      continue;
    }

    result.attempted++;
    try {
      await evaluateOwnerNotifications({ sr, ownerId, nowMs, absoluteUrl });
      await sr.entities[RETRY_ENTITY].update(job.id, {
        status: 'done',
        attempts: attempts + 1,
        last_attempt_at: new Date(nowMs).toISOString(),
        last_error_code: null,
      });
      result.recovered++;
    } catch (error: any) {
      const code = dispatchErrorCode(error);
      const nextAttempts = attempts + 1;
      const exhausted = nextAttempts >= MAX_DISPATCH_ATTEMPTS;
      await sr.entities[RETRY_ENTITY].update(job.id, {
        status: exhausted ? 'failed' : 'pending',
        attempts: nextAttempts,
        last_error_code: code,
        last_error_name: error?.name ? String(error.name).slice(0, 40) : null,
        last_attempt_at: new Date(nowMs).toISOString(),
        next_attempt_at: new Date(nowMs + RETRY_BASE_MS * nextAttempts).toISOString(),
      });
      if (exhausted) result.exhausted++;
      else result.rescheduled++;
      console.error(
        JSON.stringify({
          diagStage: 'NOTIFICATION_RETRY_FAILED',
          function: 'reconcilePendingDispatches',
          error_code: code,
          attempt: nextAttempts,
          exhausted,
        })
      );
    }
  }

  return result;
}