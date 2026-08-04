// Bridges the glowing-logo insight indicator (Layout) to the Coach chat.
// When the logo is tapped for a new insight, we "request" that the Coach page
// surface that insight as an in-chat message instead of a card/modal.
// A module-level pending slot handles the first visit (Coach not yet mounted);
// a window event handles the case where Coach is already kept-alive.

let pendingId = null;
const EVENT = "coach-surface-insight";

export function requestSurfaceInsight(insightId) {
  if (!insightId) return;
  pendingId = insightId;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { insightId } }));
}

export function consumeSurfaceInsight() {
  const id = pendingId;
  pendingId = null;
  return id;
}

export function onSurfaceInsight(handler) {
  const listener = (e) => handler(e?.detail?.insightId);
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}