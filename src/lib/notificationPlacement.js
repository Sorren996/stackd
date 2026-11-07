/**
 * ONE placement for every in-app banner Stackd draws itself.
 *
 * Both banner renderers in this app — Sonner (used across the app shell) and the
 * older Radix-style renderer (used by the sign-up screens) — read their geometry
 * from this file, so a message can never be placed by two different opinions.
 *
 * The order is the point:
 *
 *   status bar / Dynamic Island
 *   ├── env(safe-area-inset-top) .... what the OS says is unreachable
 *   ├── HEADER_BAR_PX .............. the fixed logo row
 *   └── BANNER_HEADER_GAP_PX ....... deliberate air before the first message
 *
 * Everything is expressed in CSS, not measured in JavaScript. `viewport-fit=cover`
 * is already set on the document, so `env(safe-area-inset-*)` is the supported,
 * OS-maintained source of truth — the same one the fixed header already uses. The
 * insets are never baked into a device height, and nothing is added twice: each
 * axis reads exactly one `env()` value.
 *
 * WHY THERE IS NO JAVASCRIPT FALLBACK:
 * The native shell is Capacitor, and this app only uses its platform detection
 * (see nativeShell.js). Capacitor exposes no inset API here — there is no bridge
 * value to fall back to. So if `env()` resolved to zero on a device, a JavaScript
 * guess would be worse than the truth: it would move banners to an arbitrary
 * height that agrees with nothing else on the screen, while the header (which
 * reads the same `env()`) stayed put. The honest response to a zero inset is to
 * keep the shared basis and report it, which is what reportBannerInsetsOnce()
 * does — one code-only diagnostic line, no fabricated number.
 */

// Sibling modules, imported relatively so this file can also be exercised by the
// plain `node --test` suite (which has no bundler alias resolution).
import { HEADER_BAR_PX } from "./layoutMetrics.js";
import { logStartup } from "./startupDiagnostics.js";

// Air between the logo bar's bottom edge and the first banner.
export const BANNER_HEADER_GAP_PX = 12;

// Minimum side margin. Widened by the inset on a notched phone held sideways,
// where the cut-out moves from the top edge to the left or right edge.
export const BANNER_SIDE_MIN_PX = 16;

// Space kept free at the bottom for the floating dock and the home indicator,
// so a tall stack can never sit on top of the navigation or the iOS bar.
export const BANNER_BOTTOM_RESERVE_PX = 104;

// Safe area + logo bar + air. The single top edge both renderers use.
const HEADER_CLEARANCE_PX = HEADER_BAR_PX + BANNER_HEADER_GAP_PX;

export const BANNER_TOP = `calc(env(safe-area-inset-top) + ${HEADER_CLEARANCE_PX}px)`;

export const BANNER_SIDE_LEFT = `max(${BANNER_SIDE_MIN_PX}px, env(safe-area-inset-left))`;
export const BANNER_SIDE_RIGHT = `max(${BANNER_SIDE_MIN_PX}px, env(safe-area-inset-right))`;

/** How tall a stack may grow before it scrolls instead of reaching the dock. */
export const BANNER_MAX_HEIGHT = `calc(100dvh - ${BANNER_TOP} - ${BANNER_BOTTOM_RESERVE_PX}px - env(safe-area-inset-bottom))`;

/** The same placement, in the shape Sonner's toaster takes. */
export const BANNER_SONNER_OFFSET = {
  top: BANNER_TOP,
  left: BANNER_SIDE_LEFT,
  right: BANNER_SIDE_RIGHT,
};

/**
 * What the document actually resolved for the top inset, in px. Used ONLY for
 * the diagnostic below — never to position anything.
 */
export function readSafeAreaInsetTop() {
  if (typeof document === "undefined") return null;
  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText =
    "position:fixed;top:0;left:0;width:0;height:env(safe-area-inset-top, 0px);visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  const resolved = probe.getBoundingClientRect().height || 0;
  probe.remove();
  return resolved;
}

let reported = false;

/**
 * One code-only line per launch, so a device that reports no inset can be
 * identified from the device itself. No values, no account data.
 */
export function reportBannerInsetsOnce() {
  if (reported) return;
  reported = true;
  const inset = readSafeAreaInsetTop();
  logStartup("in-app-banner", {
    outcome: "info",
    code: inset ? "SAFE_INSET_PRESENT" : "SAFE_INSET_ZERO",
  });
}