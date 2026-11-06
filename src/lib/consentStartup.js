import { withStartupDeadline } from '@/lib/startupDiagnostics';

export const acknowledgmentKey = (userId) => ['latest-acknowledgment', userId];
export const onboardingKey = (userId) => ['onboarding-check', userId];
export const requestStatus = (error) => {
  const status = Number(error?.status ?? error?.response?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
};
const failure = (code, status) => Object.assign(new Error(code), { consentCode: code, status });

export function consentFailureCode(error) {
  if (error?.startupCode === 'TIMEOUT') return 'TIMEOUT';
  if (['INVALID_RESPONSE', 'OWNER_MISMATCH', 'ACCOUNT_CHANGED', 'SESSION_REQUIRED'].includes(error?.consentCode)) return error.consentCode;
  const status = requestStatus(error);
  return status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : status === 429 ? 'RATE_LIMITED' : status >= 500 ? 'SERVER_ERROR' : status ? 'REQUEST_REJECTED' : 'NETWORK_OR_UNAVAILABLE';
}

export function retryConsent(failureCount, error) {
  const status = requestStatus(error);
  return failureCount < 1 && !error?.consentCode && (status == null || status >= 500);
}

// Read-only, caller-authenticated SDK request. RLS remains the server boundary;
// created_by_id is its immutable ownership field, not the custom user_id.
export async function loadAcknowledgments(client, userId, limit = 1) {
  let operation = 'acknowledgment.filter';
  const startedAt = Date.now();
  try {
    if (!userId) throw failure('SESSION_REQUIRED', 401);
    const read = () => withStartupDeadline(client.entities.UserAcknowledgment.filter(
      { created_by_id: userId }, '-accepted_at', limit
    ));
    let rows;
    try {
      rows = await read();
    } catch (error) {
      if (requestStatus(error) !== 401) throw error;
      // The SDK exposes no refresh-token API. Revalidate through its auth API,
      // retry once only for the same valid identity, otherwise fail closed.
      operation = 'consent.session-check';
      const current = await withStartupDeadline(client.auth.me());
      if (!current?.id) throw failure('SESSION_REQUIRED', 401);
      if (current.id !== userId) throw failure('ACCOUNT_CHANGED', 409);
      operation = 'acknowledgment.filter';
      rows = await read();
    }
    if (!Array.isArray(rows)) throw failure('INVALID_RESPONSE');
    if (rows.some((row) => !row || row.created_by_id !== userId)) throw failure('OWNER_MISMATCH');
    return rows; // [] is a successful lookup, never an error fallback.
  } catch (error) {
    // Fixed operation names and locally classified codes only: no raw errors,
    // response bodies, account identifiers, URLs, tokens or consent contents.
    console.info(JSON.stringify({ diagStage: 'STARTUP', stage: 'consent', operation,
      outcome: 'error', status: requestStatus(error), code: consentFailureCode(error),
      durationMs: Date.now() - startedAt }));
    throw error;
  }
}