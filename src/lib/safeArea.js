/**
 * ONE safe-area contract for the shells that live OUTSIDE the signed-in app:
 * the public site (PublicShell → PublicNav / PublicFooter) and every account
 * screen (AuthLayout, plus the MfaScreen card page).
 *
 * WHY THIS FILE EXISTS
 * `viewport-fit=cover` is set in index.html, so the web view is allowed to
 * paint to the physical edges of the screen and the OS reports — in CSS, via
 * env(safe-area-inset-*) — how much of that edge is unreachable (status bar,
 * Dynamic Island, home indicator, landscape cut-out). The public header and the
 * auth card previously started at y = 0, so the clock and battery icons were
 * drawn over the logo and the card could scroll under them.
 *
 * The important lesson from the earlier attempts: initial padding alone is not
 * a reservation, because it scrolls away. Each shell therefore does TWO things
 * with the same single inset value — it RESERVES the strip (padding, so content
 * begins below it) and it PAINTS the strip (a solid, noninteractive region, so
 * nothing scrolled underneath can ever become visible beside the icons).
 *
 * OWNERSHIP — exactly one owner per edge, per shell:
 *
 *   public site    top     PublicNav: its sticky header reserves the strip with
 *                          padding and paints it with the solid field colour.
 *                  bottom  PublicFooter reserves and paints it.
 *                  sides   PublicNav / PublicFooter / page padding.
 *   account pages  top     AuthLayout reserves it as page padding and
 *                          SafeAreaBand paints the same strip.
 *                  bottom  AuthLayout reserves it as page padding.
 *                  sides   AuthLayout's page padding.
 *   mfa page       all     MfaScreen (same reserve-and-paint pattern).
 *   onboarding     top     OnboardingShell's header (opaque from y = 0).
 *                  bottom  OnboardingShell's footer.
 *                  sides   OnboardingShell's own side padding.
 *
 * No inset is added twice: an element never carries a safe-area offset that
 * another element in the same shell already applies, and the signed-in app
 * (Layout.jsx / layoutMetrics.js) keeps its own separate, established contract.
 *
 * WHY THERE IS NO JAVASCRIPT FALLBACK, AND NO HARDCODED DEVICE HEIGHT
 * The native shell is Capacitor, and this app only uses its platform detection
 * (see nativeShell.js). No inset bridge is exposed to the web content, so there
 * is no supported native value to fall back to. When env() reports zero — a
 * wrapper that does not propagate the inset, on a device that has one — the
 * honest response is to keep the shared CSS basis and record what the device
 * actually reported, never to invent a number: a guessed 44px or 59px would
 * agree with nothing else on screen and would also push every desktop browser
 * down by that amount. reportShellInsetsOnce() writes one code-only line, so a
 * zero-inset wrapper can be recognised from the device itself.
 *
 * A legitimate zero (desktop browser, a device whose status bar sits outside
 * the web view) is not a fault and is never "corrected" with padding.
 *
 * DIAGNOSED LIMITATION, STATED PLAINLY: if the WKWebView hosting the native
 * build adjusts content insets itself, or does not honour `viewport-fit=cover`,
 * then env() resolves to 0 inside the page while the OS still draws a status
 * bar over it. That is a native container configuration issue — it cannot be
 * measured or repaired from app CSS, and this file does not pretend otherwise.
 */

// Siblings imported relatively so this module also runs under plain `node --test`.
import { readSafeAreaInsetTop } from "./notificationPlacement.js";
import { logStartup } from "./startupDiagnostics.js";

/* ── The raw edges ───────────────────────────────────────── */

export const SAFE_TOP = "env(safe-area-inset-top)";
export const SAFE_BOTTOM = "env(safe-area-inset-bottom)";
export const SAFE_LEFT = "env(safe-area-inset-left)";
export const SAFE_RIGHT = "env(safe-area-inset-right)";

/* ── Public site ─────────────────────────────────────────── */

/** PublicNav's sticky header reserves the status strip with this padding. */
export const PUBLIC_HEADER_PAD_TOP = "env(safe-area-inset-top)";

/** Extra edge padding for a notched phone held sideways (zero otherwise). */
export const PUBLIC_HEADER_EDGE_LEFT = "env(safe-area-inset-left)";
export const PUBLIC_HEADER_EDGE_RIGHT = "env(safe-area-inset-right)";

/** PublicFooter reserves the home-indicator strip plus its own breathing room. */
export const PUBLIC_FOOTER_PAD_BOTTOM = "calc(env(safe-area-inset-bottom) + 3rem)";

/* ── Account screens ─────────────────────────────────────── */

/** AuthLayout page padding: the status strip plus deliberate air. */
export const AUTH_PAGE_PAD_TOP = "calc(env(safe-area-inset-top) + 2rem)";
export const AUTH_PAGE_PAD_BOTTOM = "calc(env(safe-area-inset-bottom) + 2.5rem)";

/** Side padding for the same page: the cut-out never clips the card. */
export const AUTH_PAGE_PAD_SIDE_LEFT = "max(1rem, env(safe-area-inset-left))";
export const AUTH_PAGE_PAD_SIDE_RIGHT = "max(1rem, env(safe-area-inset-right))";

/* ── The MFA card page ───────────────────────────────────── */

export const MFA_PAGE_PAD_TOP = "calc(env(safe-area-inset-top) + 2rem)";
export const MFA_PAGE_PAD_BOTTOM = "calc(env(safe-area-inset-bottom) + 2rem)";

/* ── Onboarding ────────────────────────────────────────────
   Every onboarding step lives in ONE shell
   (components/onboarding/OnboardingShell.jsx), pinned to the viewport, so the
   header cannot scroll and only the inner region does. Each edge has exactly
   one owner: top by the header, bottom by the footer, sides by the shell. No
   step applies its own env() offset, so nothing is counted twice in Safari, in
   the native host, or on a nested route. */

export const ONBOARDING_HEADER_PAD_TOP = `max(${SAFE_TOP}, 1rem)`;
export const ONBOARDING_FOOTER_PAD_BOTTOM = `max(${SAFE_BOTTOM}, 0.75rem)`;
export const ONBOARDING_PAD_SIDE_LEFT = SAFE_LEFT;
export const ONBOARDING_PAD_SIDE_RIGHT = SAFE_RIGHT;

/* ── Skip links ──────────────────────────────────────────── */

/** Where a focused skip link may sit: inside the page, never in the OS strip. */
export const SKIP_LINK_TOP = "calc(env(safe-area-inset-top) + 0.75rem)";
export const SKIP_LINK_LEFT = "max(1rem, env(safe-area-inset-left))";

/* ── Diagnostic ──────────────────────────────────────────── */

let reported = false;

/**
 * One code-only line per launch. It carries no values and no account data —
 * just whether this device handed the page a measurable top inset, so a
 * zero-inset native wrapper can be identified from the device itself.
 */
export function reportShellInsetsOnce() {
  if (reported) return;
  reported = true;
  try {
    const inset = readSafeAreaInsetTop();
    logStartup("public-shell", {
      outcome: "info",
      code: inset ? "SAFE_INSET_PRESENT" : "SAFE_INSET_ZERO",
    });
  } catch {
    // Diagnostics never affect layout.
  }
}