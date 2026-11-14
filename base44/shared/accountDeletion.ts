// Account deletion pipeline.
//
// The sequence lives here, not in the function, so the exact order can be
// exercised by an isolated fixture with a mocked service role: every row is
// scoped to one user id, the auth identity is removed only after the data
// purge is clean, and a final sweep closes the window for a write that was
// already in flight when the identity was removed.
//
// Nothing here ever reads or writes a password. Credentials that exist are
// removed as ciphertext rows; the plaintext never leaves the server.
//
// ── WHY THE PLAN IS SHAPED THIS WAY ─────────────────────────────────────────
// Every call this pipeline makes is a delete, and the platform meters deletes
// per caller: 60 `deleteMany` calls per 30 seconds (this workspace's plan
// doubles the base limit). A service-role function is ONE caller for every
// account it serves, so the whole plan has to fit inside a single burst.
//
// The first version issued 55 scoped deletes and then repeated every pass until
// an entity was empty — around 65 calls before any looping. A small account
// squeaked under the limit; a real account (tens of thousands of readings) added
// passes, crossed it, and the resulting 429 was counted as "these records could
// not be removed". That is the failure the owner saw.
//
// So: fields that used to be deleted one query at a time are now ONE merged
// `$or` query per entity, the plan is paced, and a transient rejection (429,
// 5xx, network) is retried with a wait instead of being reported as data we
// could not remove. A permission refusal is never retried and never skipped.
//
// The result is still a multi-step saga, not an atomic transaction: the purge
// can partially succeed, which is exactly why a partial purge keeps the account
// open, keeps the sign-in working, and is safe to retry.

export type ServiceRole = any;
export type DeletionEvent = (
  action: string,
  metadata?: Record<string, any>,
) => Promise<void>;

/** One redacted description of a step that failed. Never a message, never data. */
export type DeleteFailure = {
  label: string;
  code: 'rate_limited' | 'permission_denied' | 'not_found' | 'unavailable' | 'network' | 'incomplete' | 'unknown';
  status: number | null;
};

export type DeletionQuery = { label: string; entity: string; query: Record<string, any> };

/* ── The plan ────────────────────────────────────────────── */

/** Rows owned through created_by_id only. */
const CREATOR_OWNED = [
  'InsulinDose', 'CarbEntry', 'JournalEntry', 'UserSettings', 'DexcomConnection',
  'SplitDosePlan', 'SplitDosePreset', 'UserAcknowledgment', 'SupportTicket', 'CreatorSupport',
  'FollowerNotice', 'AuditLog',
];

/** Rows that may be user-created OR server-created with an explicit user_id. */
const CREATOR_OR_USER_ID = [
  'GlucoseReading', 'DailySummary', 'GlucoseEvent', 'MealResponseAnalysis', 'MealMatchFeedback',
  'UserPatternProfile', 'AnalysisJob', 'GlucoseProjection', 'ProjectionModelState',
  'MealResponseModelState', 'AbsorptionAdjustment', 'CoachInsight',
];

/**
 * Server-written rows and the fields that can point at an account. Each entry
 * is ONE merged query: a row only has to match any one of the fields.
 *
 * Sharing rows are removed on both sides: a relationship this person shared
 * ends their follower's access, and a relationship they followed ends their own
 * view. No other account, and no other person's health records, are touched.
 */
const KEYED: Array<{ entity: string; fields: string[] }> = [
  { entity: 'DexcomCredential', fields: ['user_id', 'created_by_id'] },
  { entity: 'SharerContact', fields: ['user_id', 'created_by_id'] },
  { entity: 'LatestLocation', fields: ['user_id', 'created_by_id'] },
  { entity: 'NotificationPreference', fields: ['user_id', 'created_by_id'] },
  { entity: 'FollowNotificationPreference', fields: ['user_id', 'created_by_id'] },
  { entity: 'NotificationLedger', fields: ['user_id'] },
  { entity: 'ProjectionResidual', fields: ['user_id'] },
  { entity: 'ProjectionBandState', fields: ['user_id'] },
  { entity: 'ProjectionInputChange', fields: ['user_id'] },
  { entity: 'SharedAccess', fields: ['sharer_user_id', 'follower_user_id'] },
  { entity: 'SharedInvitation', fields: ['sharer_user_id'] },
  { entity: 'NotificationDelivery', fields: ['recipient_user_id', 'owner_user_id'] },
  { entity: 'NotificationDispatchJob', fields: ['owner_user_id'] },
  { entity: 'FollowerAlertDelivery', fields: ['sharer_user_id', 'follower_user_id'] },
];

/** Records the app re-creates on demand. Swept once more after the identity is gone. */
const PROVISIONED_ON_USE = new Set([
  'UserSettings', 'UserAcknowledgment', 'DexcomCredential', 'NotificationPreference',
  'SharerContact', 'LatestLocation',
]);

/** Any-of-the-given-fields match, still scoped to the one account id. */
function matchAny(fields: string[], userId: string): Record<string, any> {
  if (fields.length === 1) return { [fields[0]]: userId };
  return { $or: fields.map((field) => ({ [field]: userId })) };
}

/**
 * The complete, fixed set of scoped deletes for one account. Built from the
 * authenticated user id only — never from a client-supplied value — so a retry
 * can never widen beyond that account.
 */
export function deletionQueries(userId: string): DeletionQuery[] {
  if (!userId) throw new Error('userId is required');
  const out: DeletionQuery[] = [];
  for (const entity of CREATOR_OWNED) {
    out.push({ label: `${entity}.created_by_id`, entity, query: { created_by_id: userId } });
  }
  for (const entity of CREATOR_OR_USER_ID) {
    out.push({
      label: `${entity}.created_by_id|user_id`,
      entity,
      query: matchAny(['created_by_id', 'user_id'], userId),
    });
  }
  for (const { entity, fields } of KEYED) {
    out.push({ label: `${entity}.${fields.join('|')}`, entity, query: matchAny(fields, userId) });
  }
  return out;
}

/* ── Failure handling ────────────────────────────────────── */

/**
 * The pipeline's pacing, in one place so it can be reasoned about (and shortened
 * in tests, which must not spend real seconds waiting out a window).
 *
 *   retryDelaysMs  bounded waits for a transient rejection only.
 *   batchSize      deletes run in flight at once. Deliberately small: the burst
 *   batchGapMs     stays far below 60 deletes per 30 seconds for one caller.
 *   maxPasses      an entity that still matches after this is reported as a
 *                  failed step rather than silently left behind.
 */
export const deletionTuning = {
  retryDelaysMs: [2000, 6000, 15000],
  batchSize: 4,
  batchGapMs: 150,
  maxPasses: 40,
};

class DeletionStepError extends Error {
  code: DeleteFailure['code'];
  status: number | null;
  constructor(code: DeleteFailure['code'], status: number | null, message: string) {
    super(message);
    this.name = 'DeletionStepError';
    this.code = code;
    this.status = status;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Turns a thrown error into a redacted classification. The status code and the
 * class of failure are kept so the exact step can be identified later; the
 * provider message is not, because it is not ours and can carry request detail.
 */
export function classifyFailure(error: any): { code: DeleteFailure['code']; status: number | null } {
  const status = Number(
    error?.status ?? error?.statusCode ?? error?.response?.status ?? error?.status_code ?? 0,
  ) || null;
  const text = `${error?.name || ''} ${error?.message || ''}`.toLowerCase();
  if (status === 429 || text.includes('rate limit') || text.includes('too many requests')) {
    return { code: 'rate_limited', status: status ?? 429 };
  }
  if (status === 401 || status === 403) return { code: 'permission_denied', status };
  if (status === 404) return { code: 'not_found', status };
  if (status && status >= 500) return { code: 'unavailable', status };
  if (text.includes('timeout') || text.includes('network') || text.includes('fetch failed') || text.includes('econn')) {
    return { code: 'network', status };
  }
  return { code: 'unknown', status };
}

/** Only genuinely transient failures are worth another attempt. */
function isRetryable(code: DeleteFailure['code']): boolean {
  return code === 'rate_limited' || code === 'unavailable' || code === 'network';
}

/**
 * Runs one call, retrying a transient rejection with a bounded wait.
 * A permission refusal, a malformed request or a "not found" is never retried:
 * those are answers, not blips.
 */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  let lastError: any;
  const delays = deletionTuning.retryDelaysMs;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await run();
    } catch (error: any) {
      lastError = error;
      const { code, status } = classifyFailure(error);
      if (!isRetryable(code) || attempt === delays.length) {
        throw new DeletionStepError(code, status, `step failed: ${code}`);
      }
      // Never retry before the wait.
      await sleep(delays[attempt]);
    }
  }
  throw lastError;
}

async function deletePass(sr: ServiceRole, entity: string, query: Record<string, any>): Promise<number> {
  const res = await withRetry(() => sr.entities[entity].deleteMany(query));
  return Number(res?.deleted ?? res?.count ?? 0) || 0;
}

async function deleteAll(sr: ServiceRole, entity: string, query: Record<string, any>): Promise<number> {
  let removed = 0;
  for (let pass = 0; pass < deletionTuning.maxPasses; pass++) {
    const n = await deletePass(sr, entity, query);
    removed += n;
    if (n === 0) return removed;
  }
  // Refusing to report success here matters: stopping early would leave rows
  // behind while the sign-in was still closed.
  throw new DeletionStepError(
    'incomplete',
    null,
    `${entity} still matched after ${deletionTuning.maxPasses} passes`,
  );
}

/** Removes every account-scoped row. Reports the redacted steps that failed. */
export async function purgeUserData(
  sr: ServiceRole,
  userId: string,
): Promise<{ failed: DeleteFailure[]; removed: number }> {
  const queries = deletionQueries(userId);
  const failed: DeleteFailure[] = [];
  let removed = 0;
  const { batchSize, batchGapMs } = deletionTuning;
  for (let i = 0; i < queries.length; i += batchSize) {
    const batch = queries.slice(i, i + batchSize);
    const results = await Promise.allSettled(
      batch.map((q) => deleteAll(sr, q.entity, q.query)),
    );
    results.forEach((result, j) => {
      if (result.status === 'fulfilled') {
        removed += Number(result.value) || 0;
        return;
      }
      const reason: any = result.reason;
      const { code, status } = reason instanceof DeletionStepError
        ? { code: reason.code, status: reason.status }
        : classifyFailure(reason);
      failed.push({ label: batch[j].label, code, status });
    });
    if (i + batchSize < queries.length && batchGapMs > 0) await sleep(batchGapMs);
  }
  return { failed, removed };
}

/**
 * Removes the app's auth user record (the documented service-role capability
 * for taking a user out of the app) and confirms it is gone. A record that
 * still resolves means the identity survived, which is reported honestly
 * rather than treated as a successful deletion.
 */
export async function deleteAuthIdentity(sr: ServiceRole, userId: string): Promise<boolean> {
  try {
    await withRetry(() => sr.entities.User.delete(userId));
  } catch (error: any) {
    // Already absent is already the outcome we wanted.
    if (classifyFailure(error).code !== 'not_found') throw error;
  }
  const remaining = await sr.entities.User.get(userId).catch((e: any) => {
    if (e?.status === 404) return null;
    throw e;
  });
  return remaining == null;
}

/** Second pass over records the app re-creates on demand. */
export async function sweepRecreatedRecords(sr: ServiceRole, userId: string): Promise<DeleteFailure[]> {
  const failures: DeleteFailure[] = [];
  const targets = deletionQueries(userId).filter((q) => PROVISIONED_ON_USE.has(q.entity));
  const results = await Promise.allSettled(targets.map((q) => deleteAll(sr, q.entity, q.query)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      const { code, status } = classifyFailure(result.reason);
      failures.push({ label: targets[i].label, code, status });
    }
  });
  return failures;
}

/* ── Support reference ───────────────────────────────────── */

const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * A short, random, non-identifying reference the person can quote. It carries
 * no account id, no health data and no key material; the server keeps the
 * matching stage codes in its own logs.
 */
export function makeSupportRef(): string {
  try {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => REF_ALPHABET[b % REF_ALPHABET.length]).join('');
  } catch {
    return String(Date.now()).slice(-8);
  }
}

export type CloseAccountResult = {
  ok: boolean;
  code: 'deleted' | 'purge_incomplete' | 'identity_removal_failed';
  failed?: DeleteFailure[];
  residual?: number;
  supportRef?: string;
};

/**
 * Full sequence: purge → confirm → remove identity → sweep.
 *
 * Order is the guarantee. The identity is removed only after every purge step
 * succeeded, so a partial purge leaves a still-working account the person can
 * retry (the purge is idempotent and scoped), and a removal that does not take
 * effect is never reported as success.
 */
export async function closeAccount(
  sr: ServiceRole,
  userId: string,
  onEvent: DeletionEvent,
): Promise<CloseAccountResult> {
  const purge = await purgeUserData(sr, userId);
  if (purge.failed.length) {
    await onEvent('account_deletion_partial', {
      failed_steps: purge.failed.length,
      // Stage + class only: enough to find the exact step, nothing sensitive.
      stages: purge.failed.map((f) => `${f.label}:${f.code}${f.status ? `:${f.status}` : ''}`),
    });
    return {
      ok: false,
      code: 'purge_incomplete',
      failed: purge.failed,
      supportRef: makeSupportRef(),
    };
  }

  const identityRemoved = await deleteAuthIdentity(sr, userId).catch(() => false);
  if (!identityRemoved) {
    await onEvent('account_deletion_identity_failed');
    return { ok: false, code: 'identity_removal_failed', supportRef: makeSupportRef() };
  }

  const residual = await sweepRecreatedRecords(sr, userId);
  await onEvent('account_deleted', { residual_steps: residual.length });
  return { ok: true, code: 'deleted', residual: residual.length };
}