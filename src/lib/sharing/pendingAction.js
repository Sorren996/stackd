// Bounded, recoverable pending state for the owner's sharing actions.
//
// A pause, resume or withdrawal must never leave a control waiting forever:
// the request is bounded, a second tap while one is in flight is ignored, and
// the outcome is only ever taken from the server's own answer — never assumed.

/** How long one sharing action may stay in flight before it is treated as stalled. */
export const ACTION_TIMEOUT_MS = 20000;

/**
 * Race a request against a bound.
 *
 * A stalled request rejects with reason "timeout" so the caller can put its
 * controls back and say what happened. The underlying request is left to settle
 * on its own; its late answer is discarded rather than applied.
 */
export function withTimeout(promise, ms = ACTION_TIMEOUT_MS) {
  let timer;
  const bound = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("timeout");
      error.reason = "timeout";
      reject(error);
    }, ms);
  });
  return Promise.race([promise, bound]).finally(() => clearTimeout(timer));
}

/**
 * One submission at a time.
 *
 * enter() is false while something is already in flight, so a double tap can
 * never fire a second request; exit() always runs, so the control always comes
 * back — including after a failure or a stall.
 */
export function createSubmissionGate() {
  let pending = false;
  return {
    isPending: () => pending,
    enter: () => {
      if (pending) return false;
      pending = true;
      return true;
    },
    exit: () => {
      pending = false;
    },
  };
}