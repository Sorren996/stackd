/**
 * Back-navigation ledger — the pure, testable half of the shared Back mechanism.
 *
 * WHY THIS EXISTS
 * The app's page-level Back arrows used to call `navigate(-1)`, i.e. "whatever
 * the browser has behind me". That is only correct when the entry behind you is
 * the page you actually came from. In Stackd it often is not: the Journal keeps
 * its week/day position in the URL, so every drill-down is a PUSH, and the
 * bottom-nav tabs mean the entry behind a Journal view can be Insights, Home, or
 * several pages deep in another tab. The arrow therefore sometimes exited the
 * Journal into an unrelated page — most visibly Insights.
 *
 * WHAT IT IS
 * A bounded, per-tab, per-account record of the app's OWN history entries, kept
 * in sessionStorage and reconciled against the router's real entries on every
 * navigation. It never invents a destination: when it can prove the previous
 * entry is a real internal page the person visited, Back pops the browser
 * history (so system Back/Forward stay in charge). When it cannot prove that, it
 * uses the caller's deterministic fallback with `replace` — no synthetic entry,
 * no guess at an external referrer, no `returnTo` parameter.
 *
 * History semantics it mirrors exactly:
 *   PUSH    → a new entry (forward entries are discarded, as browsers do)
 *   REPLACE → the current entry is overwritten; depth is unchanged
 *   POP     → the pointer moves to the entry the router restored, found by key,
 *             so Back and Forward both stay in sync with the real stack
 */

export const LEDGER_LIMIT = 40;
export const STORAGE_PREFIX = "stackd:nav-ledger:";

/** Routes that are never a valid Back target (sign-in boundaries). */
const AUTH_PATHS = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/mfa",
  "/oauth-consent",
];

/** The surfaces a viewer (follower-only account) is allowed to return to. */
const FOLLOWER_ALLOWED = ["/", "/following", "/shared", "/follow", "/install"];

export function pathnameOf(href) {
  const value = typeof href === "string" ? href : "";
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

/** Same-app, absolute-path href — never an external URL. */
export function isInternalHref(href) {
  return typeof href === "string" && href.startsWith("/") && !href.startsWith("//");
}

export function isAuthHref(href) {
  const path = pathnameOf(href);
  return AUTH_PATHS.some((entry) => path === entry || path.startsWith(`${entry}/`));
}

/**
 * A destination may be returned to only if it is a same-app page this account
 * can actually open. A viewer can only land on the following surfaces.
 */
export function isAllowedTarget(href, mode = "patient") {
  if (!isInternalHref(href) || isAuthHref(href)) return false;
  if (mode !== "follower") return true;
  const path = pathnameOf(href);
  return FOLLOWER_ALLOWED.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

export function storageKey(userId) {
  return `${STORAGE_PREFIX}${userId || "anon"}`;
}

export function emptyLedger(userId = "", mode = "patient") {
  return { userId, mode, entries: [], index: -1 };
}

/** A different account or a different app surface never inherits a route path. */
function reconcileIdentity(ledger, userId, mode) {
  if (!ledger || ledger.userId !== userId || ledger.mode !== mode) {
    return emptyLedger(userId, mode);
  }
  return ledger;
}

function trim(entries) {
  return entries.length > LEDGER_LIMIT ? entries.slice(-LEDGER_LIMIT) : entries;
}

/**
 * Apply one navigation to the ledger. Returns a NEW ledger; identity is
 * preserved when nothing changed so subscribers do not re-render needlessly.
 */
export function recordNavigation(ledger, { href, key, type, userId = "", mode = "patient" }) {
  const base = reconcileIdentity(ledger, userId, mode);
  if (!isInternalHref(href)) return base;
  const entry = { href, key: String(key ?? "") };

  if (type === "POP") {
    // Forward AND Back both arrive as POP: find the restored entry by its key.
    const found = base.entries.findIndex((item) => item.key === entry.key);
    if (found >= 0) {
      return found === base.index ? base : { ...base, entries: base.entries, index: found };
    }

    // A same-tab reload gives the initial entry a fresh key while the browser
    // stack itself survives. If the stored pointer already sits on this exact
    // href, that provenance is still trustworthy — keep it and re-key the entry.
    const currentEntry = base.entries[base.index];
    if (currentEntry && currentEntry.href === entry.href) {
      const entries = base.entries.map((item, i) => (i === base.index ? entry : item));
      return { ...base, entries };
    }

    // Anything else is an entry this ledger cannot vouch for (a new tab, a
    // reload on an address we never recorded, an external jump). Start again
    // from the current page so Back falls back deterministically.
    return { ...base, entries: [entry], index: 0 };
  }

  if (type === "REPLACE") {
    // Overwrite in place: depth must not grow, or Back would rewind through
    // date paging and other in-view edits.
    if (base.index < 0) return { ...base, entries: [entry], index: 0 };
    const entries = base.entries.map((item, i) => (i === base.index ? entry : item));
    return { ...base, entries };
  }

  // PUSH
  const currentEntry = base.entries[base.index];
  if (currentEntry && currentEntry.href === entry.href) {
    // A push onto the identical view is not a new destination. Collapse it so
    // Back never has to unwrap duplicates of the page you are already on.
    const entries = base.entries.map((item, i) => (i === base.index ? entry : item));
    return { ...base, entries };
  }

  const entries = trim([...base.entries.slice(0, base.index + 1), entry]);
  return { ...base, entries, index: entries.length - 1 };
}

/**
 * Where Back should go. `pop` means: let the router/browser unwind one entry,
 * because the previous entry is a real internal page this account can open.
 * Anything else means: use the caller's deterministic fallback.
 */
export function resolveBack(ledger) {
  if (!ledger || ledger.index <= 0) return { action: "fallback", reason: "no-internal-previous" };
  const target = ledger.entries[ledger.index - 1];
  if (!target || !isAllowedTarget(target.href, ledger.mode)) {
    return { action: "fallback", reason: "unusable-previous" };
  }
  return { action: "pop", href: target.href };
}

export function serializeLedger(ledger) {
  return JSON.stringify({ userId: ledger.userId, mode: ledger.mode, entries: ledger.entries, index: ledger.index });
}

/** Parse a stored ledger, refusing anything malformed or from another identity. */
export function parseLedger(raw, { userId, mode }) {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.userId !== userId || parsed.mode !== mode) return null;
    if (!Array.isArray(parsed.entries) || !Number.isInteger(parsed.index)) return null;
    if (parsed.entries.length > LEDGER_LIMIT) return null;
    if (parsed.index < 0 || parsed.index >= parsed.entries.length) return null;
    const entries = parsed.entries.map((item) => ({ href: item?.href, key: item?.key }));
    if (entries.some((item) => !isInternalHref(item.href) || typeof item.key !== "string")) return null;
    return { userId, mode, entries, index: parsed.index };
  } catch {
    return null;
  }
}