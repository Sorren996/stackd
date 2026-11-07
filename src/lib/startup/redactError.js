// What the crash screen is allowed to show.
//
// A stack trace is useful to diagnose and dangerous to display: it can carry an
// email address, a bearer token or an account identifier. Everything shown in
// "Technical details" therefore passes through here first, and is bounded so a
// long trace can never push the layout past the viewport.

const MESSAGE_LIMIT = 400;
const STACK_LIMIT = 1200;

function scrub(text) {
  return String(text ?? "")
    // Email addresses.
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    // JWTs.
    .replace(/ey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/g, "[token]")
    // Explicit bearer values.
    .replace(/bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [token]")
    // Long opaque identifiers and keys.
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[redacted]");
}

/** A one-line, redacted summary: "TypeError: something specific". */
export function redactError(error) {
  const name = typeof error?.name === "string" && error.name ? error.name : "Error";
  const message =
    typeof error?.message === "string" ? error.message : typeof error === "string" ? error : "";
  return `${name}: ${scrub(message) || "No further detail available."}`.slice(0, MESSAGE_LIMIT);
}

/** A bounded, redacted stack. Empty string when there is nothing safe to show. */
export function redactStack(stack) {
  if (typeof stack !== "string" || !stack) return "";
  return scrub(stack).slice(0, STACK_LIMIT);
}