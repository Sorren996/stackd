// The one place a glucose refresh is started.
//
// Launch, foreground, focus, the periodic timer and a manual retry all come
// through here, so duplicates are coalesced instead of stacking transports.
// State is per account and per generation:
//
//   - one in-flight request per user; a second caller joins it
//   - every new request starts a new generation and resets the verdict, so a
//     completed check from a previous lifecycle is never reused as if it just
//     happened
//   - a late or out-of-order result cannot overwrite a newer generation, and
//     cannot resurrect a request that already timed out
//   - the request is bounded; loading always ends
//
// `run` is supplied by the caller, so this module holds no SDK, no credentials
// and no glucose data — only the lifecycle of one request.

import { normalizeSourceVerification, VERIFICATION } from "./verification.js";

const DEFAULT_TIMEOUT_MS = 8000;

const IDLE = Object.freeze({
  generation: 0,
  status: "idle", // idle | checking | settled
  verification: VERIFICATION.IDLE,
  trigger: null,
  sourceCheckSuccess: false,
  sourceCheckedAt: null,
  latestSourceMeasurementAt: null,
  errorCode: null,
  startedAt: 0,
  settledAt: 0,
});

const states = new Map();
const inflight = new Map();
const listeners = new Map();

function stateFor(userId) {
  if (!userId) return IDLE;
  if (!states.has(userId)) states.set(userId, IDLE);
  return states.get(userId);
}

function publish(userId) {
  const set = listeners.get(userId);
  if (!set) return;
  set.forEach((listener) => {
    try {
      listener();
    } catch {
      // A listener's own failure must not break the coordinator.
    }
  });
}

function commit(userId, generation, patch) {
  const current = stateFor(userId);
  // Same generation only, and never once this generation has reported.
  if (current.generation !== generation || current.status === "settled") return;
  states.set(userId, Object.freeze({ ...current, ...patch, generation }));
  publish(userId);
}

export function getGlucoseRefreshState(userId) {
  return stateFor(userId);
}

export function subscribeGlucoseRefresh(userId, listener) {
  if (!userId || typeof listener !== "function") return () => {};
  if (!listeners.has(userId)) listeners.set(userId, new Set());
  listeners.get(userId).add(listener);
  return () => {
    const set = listeners.get(userId);
    if (!set) return;
    set.delete(listener);
    if (!set.size) listeners.delete(userId);
  };
}

/**
 * Starts (or joins) one bounded refresh for this account.
 * Never throws: a failure is reported as the UNVERIFIED verdict.
 */
export async function requestGlucoseRefresh({
  userId,
  run,
  trigger = "opportunity",
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  if (!userId || typeof run !== "function") return stateFor(userId);

  // Coalesce duplicate lifecycle, focus and manual events onto one request.
  const existing = inflight.get(userId);
  if (existing) return existing;

  const generation = stateFor(userId).generation + 1;
  states.set(
    userId,
    Object.freeze({
      ...stateFor(userId),
      generation,
      status: "checking",
      verification: VERIFICATION.PENDING,
      trigger,
      errorCode: null,
      startedAt: Date.now(),
      settledAt: 0,
    })
  );
  publish(userId);

  const work = (async () => {
    let timer;
    try {
      const payload = await Promise.race([
        Promise.resolve().then(run),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            const error = new Error("Refresh timed out");
            error.code = "timeout";
            reject(error);
          }, timeoutMs);
        }),
      ]);
      const outcome = normalizeSourceVerification(payload);
      commit(userId, generation, {
        status: "settled",
        verification: outcome.verification,
        sourceCheckSuccess: outcome.sourceCheckSuccess,
        sourceCheckedAt: outcome.sourceCheckedAt,
        latestSourceMeasurementAt: outcome.latestSourceMeasurementAt,
        settledAt: Date.now(),
      });
    } catch (error) {
      commit(userId, generation, {
        status: "settled",
        verification: VERIFICATION.UNVERIFIED,
        sourceCheckSuccess: false,
        errorCode: (error && (error.code || error.name)) || "error",
        settledAt: Date.now(),
      });
    } finally {
      clearTimeout(timer);
      if (inflight.get(userId) === work) inflight.delete(userId);
    }
    return stateFor(userId);
  })();

  inflight.set(userId, work);
  return work;
}