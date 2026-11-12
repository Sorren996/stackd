// Client for the account-capability endpoint.
//
// The server decides whether this account is a viewer (following someone else)
// or a person tracking their own glucose; the client only renders that answer.
// Nothing here is authority: every shared read is re-checked server-side.

import { base44 } from "@/api/base44Client";
import { runStartupCheck } from "@/lib/startupRequest";
import { startupJson } from '@/lib/startupHttp';

/** The viewer notice version this build expects. Bump to re-ask everyone. */
export const NOTICE_VERSION = "1.0";

async function call(payload, signal) {
  const data = signal
    ? await startupJson(base44.functions.fetch('getMyAccessProfile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal, redirect: 'error',
      }))
    : (await base44.functions.invoke('getMyAccessProfile', payload))?.data || {};
  if (data.ok !== true) {
    const error = new Error(data.reason || "request_failed");
    error.reason = data.reason || "request_failed";
    error.startupInvalid = true;
    throw error;
  }
  return data;
}

/** Capability facts for the signed-in account. Carries no health data. */
export const getMyAccessProfile = (userId, signal) => runStartupCheck(`profile:${userId}`, 'profile', async deadlineSignal => {
  const data = await call({}, deadlineSignal);
  if (!['patient', 'follower'].includes(data.mode)) throw Object.assign(new Error('Invalid account profile'), { startupInvalid: true });
  return data;
}, signal);

/**
 * Explicit opt-in: this viewer also wants Stackd for their own glucose.
 * Only ever called from a control the person themselves presses.
 */
export const enableSelfTracking = () => call({ action: "enable_self_tracking" });