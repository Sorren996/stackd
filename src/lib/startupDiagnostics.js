// Privacy-safe startup diagnostics.
//
// One short line per launch stage, so a launch that fails can be placed:
// bootstrap, auth, profile, consent, data. Only stage names, outcome codes and
// durations are ever written — never a glucose value, dose, name, email, token
// or any other account or health payload. Nothing leaves the device: this is
// the device's own console, with no analytics integration and no telemetry.

// A finite technical deadline (not a clinical threshold). Past this, the launch
// stops waiting and offers the person a calm Retry rather than a spinner.
export const STARTUP_DEADLINE_MS = 12_000;

// Settings and the newest reading are all the shell needs, so they get a
// shorter wait than the session check itself.
export const STARTUP_DATA_DEADLINE_MS = 8_000;

export const STARTUP_CODES = {
  TIMEOUT: "TIMEOUT",
  UNAUTHORIZED: "UNAUTHORIZED",
  OFFLINE: "OFFLINE",
  UNAVAILABLE: "UNAVAILABLE",
};

/**
 * Classifies a startup failure without inspecting its payload. A timeout is a
 * deadline; a 401/403 is a definite session answer; anything else is an
 * unreachable service.
 */
export function startupErrorCode(error) {
  if (error?.startupCode === "TIMEOUT") return STARTUP_CODES.TIMEOUT;
  const status = error?.status || error?.response?.status;
  if (status === 401 || status === 403) return STARTUP_CODES.UNAUTHORIZED;
  return STARTUP_CODES.UNAVAILABLE;
}

export function logStartup(stage, { outcome = "ok", code = null, durationMs = null } = {}) {
  try {
    console.log(
      JSON.stringify({
        diagStage: "STARTUP",
        stage,
        outcome,
        code,
        durationMs: Number.isFinite(durationMs) ? Math.round(durationMs) : null,
      })
    );
  } catch {
    // Diagnostics must never be able to break a launch.
  }
}

/**
 * Races a startup request against the deadline. A rejected promise means the
 * step did not answer in time — never that the request succeeded or failed.
 */
export function withStartupDeadline(promise, ms = STARTUP_DEADLINE_MS) {
  let timer = null;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const error = new Error("startup-deadline");
      error.startupCode = "TIMEOUT";
      reject(error);
    }, ms);
  });

  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}