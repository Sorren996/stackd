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

export type ServiceRole = any;
export type DeletionEvent = (
  action: string,
  metadata?: Record<string, any>,
) => Promise<void>;

// Rows owned through created_by_id only.
const CREATOR_OWNED = [
  'InsulinDose', 'CarbEntry', 'JournalEntry', 'UserSettings', 'DexcomConnection',
  'SplitDosePlan', 'SplitDosePreset', 'UserAcknowledgment', 'SupportTicket', 'CreatorSupport',
  'FollowerNotice', 'AuditLog',
];

// Rows that may be user-created or server-created with an explicit user_id.
const CREATOR_OR_USER_ID = [
  'GlucoseReading', 'DailySummary', 'GlucoseEvent', 'MealResponseAnalysis', 'MealMatchFeedback',
  'UserPatternProfile', 'AnalysisJob', 'GlucoseProjection', 'ProjectionModelState',
  'MealResponseModelState', 'AbsorptionAdjustment', 'CoachInsight',
];

// Server-written rows keyed by an explicit id field. Sharing rows are removed
// on both sides: a relationship this person shared ends their follower's
// access, and a relationship they followed ends their own view. No other
// account, and no other person's health records, are touched.
const KEYED: Array<[string, string]> = [
  ['DexcomCredential', 'user_id'],
  ['SharerContact', 'user_id'],
  ['LatestLocation', 'user_id'],
  ['NotificationPreference', 'user_id'],
  ['FollowNotificationPreference', 'user_id'],
  ['NotificationLedger', 'user_id'],
  ['SharedAccess', 'sharer_user_id'],
  ['SharedAccess', 'follower_user_id'],
  ['SharedInvitation', 'sharer_user_id'],
  ['NotificationDelivery', 'recipient_user_id'],
  ['NotificationDelivery', 'owner_user_id'],
  ['NotificationDispatchJob', 'owner_user_id'],
  ['FollowerAlertDelivery', 'sharer_user_id'],
  ['FollowerAlertDelivery', 'follower_user_id'],
];

// Records the app re-creates on demand (settings, consent, credentials,
// location, contact). These are swept once more after the identity is gone.
const PROVISIONED_ON_USE = new Set([
  'UserSettings', 'UserAcknowledgment', 'DexcomCredential', 'NotificationPreference',
  'SharerContact', 'LatestLocation',
]);

export type DeletionQuery = { label: string; entity: string; query: Record<string, any> };

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
    out.push({ label: `${entity}.created_by_id`, entity, query: { created_by_id: userId } });
    out.push({ label: `${entity}.user_id`, entity, query: { user_id: userId } });
  }
  for (const [entity, field] of KEYED) {
    out.push({ label: `${entity}.${field}`, entity, query: { [field]: userId } });
  }
  // Server-written rows can also carry a creator, so both forms are cleared.
  for (const entity of ['DexcomCredential', 'SharerContact', 'LatestLocation', 'NotificationPreference', 'FollowNotificationPreference']) {
    out.push({ label: `${entity}.created_by_id`, entity, query: { created_by_id: userId } });
  }
  return out;
}

async function deleteAll(sr: ServiceRole, entity: string, query: Record<string, any>): Promise<number> {
  let removed = 0;
  // deleteMany is bounded per call; repeat until nothing matches.
  for (let pass = 0; pass < 200; pass++) {
    const res = await sr.entities[entity].deleteMany(query);
    const n = Number(res?.deleted ?? res?.count ?? 0);
    removed += n;
    const more = n > 0 && res?.has_more !== false;
    if (!more) break;
  }
  return removed;
}

/** Removes every account-scoped row. Reports the labels that failed. */
export async function purgeUserData(
  sr: ServiceRole,
  userId: string,
): Promise<{ failed: string[]; removed: number }> {
  const queries = deletionQueries(userId);
  const failed: string[] = [];
  let removed = 0;
  for (let i = 0; i < queries.length; i += 6) {
    const batch = queries.slice(i, i + 6);
    const results = await Promise.allSettled(
      batch.map((q) => deleteAll(sr, q.entity, q.query)),
    );
    results.forEach((result, j) => {
      if (result.status === 'fulfilled') removed += Number(result.value) || 0;
      else failed.push(batch[j].label);
    });
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
  await sr.entities.User.delete(userId);
  const remaining = await sr.entities.User.get(userId).catch((e: any) => {
    if (e?.status === 404) return null;
    throw e;
  });
  return remaining == null;
}

/** Second pass over records the app re-creates on demand. */
export async function sweepRecreatedRecords(sr: ServiceRole, userId: string): Promise<string[]> {
  const failures: string[] = [];
  const targets = deletionQueries(userId).filter((q) => PROVISIONED_ON_USE.has(q.entity));
  const results = await Promise.allSettled(targets.map((q) => deleteAll(sr, q.entity, q.query)));
  results.forEach((result, i) => {
    if (result.status === 'rejected') failures.push(targets[i].label);
  });
  return failures;
}

export type CloseAccountResult = {
  ok: boolean;
  code: 'deleted' | 'purge_incomplete' | 'identity_removal_failed';
  failed?: number;
  residual?: number;
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
    await onEvent('account_deletion_partial', { failed_steps: purge.failed.length });
    return { ok: false, code: 'purge_incomplete', failed: purge.failed.length };
  }

  const identityRemoved = await deleteAuthIdentity(sr, userId).catch(() => false);
  if (!identityRemoved) {
    await onEvent('account_deletion_identity_failed');
    return { ok: false, code: 'identity_removal_failed' };
  }

  const residual = await sweepRecreatedRecords(sr, userId);
  await onEvent('account_deleted', { residual_steps: residual.length });
  return { ok: true, code: 'deleted', residual: residual.length };
}