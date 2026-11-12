import { runStartupCheck, requestStatus } from '@/lib/startupRequest';
import { startupEntityRead } from '@/lib/startupHttp';
export { requestStatus } from '@/lib/startupRequest';

export const acknowledgmentKey = (userId) => ['latest-acknowledgment', userId];
export const onboardingKey = (userId) => ['onboarding-check', userId];

const failure = (code, status) => Object.assign(new Error(code), { consentCode: code, status });

export function consentFailureCode(error) {
  if (error?.startupCode === 'TIMEOUT') return 'TIMEOUT';
  if (['INVALID_RESPONSE', 'OWNER_MISMATCH', 'ACCOUNT_CHANGED', 'SESSION_REQUIRED'].includes(error?.consentCode)) return error.consentCode;
  const status = requestStatus(error);
  return status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'SERVER_ERROR' : status ? 'REQUEST_REJECTED' : 'NETWORK_OR_UNAVAILABLE';
}

// Retry is owned by runStartupCheck, not multiplied by each query observer.
export const retryConsent = false;

export async function loadAcknowledgments(client, userId, limit = 1, signal) {
  if (!userId) throw failure('SESSION_REQUIRED', 401);
  return runStartupCheck(`consent:${userId}:${limit}`, 'consent', async deadlineSignal => {
    const rows = await startupEntityRead(client, 'UserAcknowledgment', { created_by_id: userId }, '-accepted_at', limit, deadlineSignal);
    if (!Array.isArray(rows)) throw failure('INVALID_RESPONSE');
    if (rows.some(row => !row || row.created_by_id !== userId)) throw failure('OWNER_MISMATCH');
    return rows;
  }, signal);
}