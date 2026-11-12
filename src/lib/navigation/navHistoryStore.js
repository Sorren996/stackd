import {
  emptyLedger,
  recordNavigation,
  resolveBack,
  parseLedger,
  serializeLedger,
  storageKey,
} from "./backLedger.js";

/**
 * The app's single Back ledger, shared by every page-level Back arrow.
 *
 * One instance per tab: held in memory for the session and mirrored into
 * sessionStorage so the same-tab reload case keeps its provenance. It is keyed
 * by account and app surface, so it can never carry one person's route path to
 * another account, and it is cleared outright at an auth boundary.
 *
 * It does not compete with system Back: it records what the router actually did
 * (PUSH/REPLACE/POP) and only ever asks the router to unwind one entry, so
 * browser Back/Forward and the iOS back gesture stay authoritative.
 */

let current = emptyLedger();
const listeners = new Set();
let lastIssued = null;

function readStored(userId, mode) {
  try {
    const raw = window.sessionStorage.getItem(storageKey(userId));
    return raw ? parseLedger(raw, { userId, mode }) : null;
  } catch {
    return null;
  }
}

function writeStored(ledger) {
  try {
    if (!ledger.userId || !ledger.entries.length) return;
    window.sessionStorage.setItem(storageKey(ledger.userId), serializeLedger(ledger));
  } catch {
    // Storage unavailable (private mode) — the in-memory ledger still works.
  }
}

function clearStored(userId) {
  try {
    if (userId) window.sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing to clear.
  }
}

function emit() {
  listeners.forEach((listener) => listener(current));
}

export function getLedger() {
  return current;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Record the router's own navigation. Never navigates. */
export function trackNavigation({ href, key, type, userId, mode }) {
  if (!userId || !mode) return;

  // Account or surface change: start from that identity's own record, never
  // from the previous person's path.
  if (current.userId !== userId || current.mode !== mode) {
    current = readStored(userId, mode) || emptyLedger(userId, mode);
    lastIssued = null;
  }

  const next = recordNavigation(current, { href, key, type, userId, mode });
  const unchanged =
    next === current ||
    (next.index === current.index &&
      next.entries.length === current.entries.length &&
      next.entries[next.index]?.key === current.entries[current.index]?.key);
  if (unchanged) return;

  current = next;
  writeStored(current);
  emit();
}

/** Auth boundary: forget everything this tab knew about the route path. */
export function resetNavigation() {
  const previousUserId = current.userId;
  if (!previousUserId && !current.entries.length) return;
  current = emptyLedger();
  lastIssued = null;
  clearStored(previousUserId);
  emit();
}

/**
 * Decide what Back should do right now.
 *
 * `suppressed` guards a rapid double tap: the second press lands before the
 * router has settled the first unwind, and obeying it would skip a page.
 */
export function requestBack(now = Date.now()) {
  const ledger = current;
  const decision = resolveBack(ledger);
  if (decision.action !== "pop") {
    lastIssued = null;
    return decision;
  }
  if (lastIssued && lastIssued.index === ledger.index && now - lastIssued.at < 800) {
    return { action: "suppressed" };
  }
  lastIssued = { index: ledger.index, at: now };
  return decision;
}

/** Test/reset helper: nothing outside this module should need it at runtime. */
export function __resetForTests() {
  current = emptyLedger();
  lastIssued = null;
  listeners.clear();
}