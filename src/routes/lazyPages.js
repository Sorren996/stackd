import { lazy } from "react";

// ── Route-level chunks ──────────────────────────────────────────────────────
// The shell (Layout, its header and nav), the providers, auth, the startup
// gates and Home stay in the initial bundle, so the first screen paints
// without waiting for code. Everything whose only purpose is a report, a form,
// a sub-page or another tab lives in its own chunk: fetched when it is first
// needed, and warmed on idle or on a tab press so a tap does not wait for it.

// Tabs that the patient shell keeps alive. Home is deliberately absent: it is
// the eager path.
export const LazyHistory = lazy(() => import("@/pages/History"));
export const LazyAnalytics = lazy(() => import("@/pages/Analytics"));
export const LazySettings = lazy(() => import("@/pages/Settings"));

// Reports, forms and settings sub-pages.
export const LazyInsights = lazy(() => import("@/pages/Insights"));
export const LazyInsulinSettings = lazy(() => import("@/pages/InsulinSettingsPage"));
export const LazyProfileSettings = lazy(() => import("@/pages/ProfileSettingsPage"));
export const LazyPrivacyConsent = lazy(() => import("@/pages/PrivacyConsentPage"));
export const LazyDisplaySettings = lazy(() => import("@/pages/DisplaySettingsPage"));
export const LazyDexcomSettings = lazy(() => import("@/pages/DexcomSettingsPage"));
export const LazySensorSession = lazy(() => import("@/pages/SensorSessionPage"));
export const LazySharing = lazy(() => import("@/pages/SharingPage"));
export const LazyNotifications = lazy(() => import("@/pages/NotificationsPage"));
export const LazyReminders = lazy(() => import("@/pages/RemindersPage"));
export const LazyContactSupport = lazy(() => import("@/pages/ContactSupportPage"));
export const LazySupportInbox = lazy(() => import("@/pages/SupportInbox"));
export const LazySplitPlanReview = lazy(() => import("@/pages/SplitPlanReview"));

// The viewer's shell pages.
export const LazyFollowingHome = lazy(() => import("@/pages/FollowingHome"));
export const LazyFollowerSettings = lazy(() => import("@/pages/FollowerSettings"));
export const LazyFollowInvite = lazy(() => import("@/pages/FollowInvite"));

// Public pages other than the landing page.
export const LazyInstall = lazy(() => import("@/pages/Install"));
export const LazyPrivacy = lazy(() => import("@/pages/PrivacyPage"));
export const LazyTerms = lazy(() => import("@/pages/TermsPage"));
export const LazyPublicContact = lazy(() => import("@/pages/PublicContactPage"));
export const LazyHowItWorks = lazy(() => import("@/pages/HowItWorks"));
export const LazySharingExplained = lazy(() => import("@/pages/SharingExplained"));

// The tab destinations, by path. Home has no entry because it is eager, so a
// tab press on it needs no code.
const TAB_CHUNKS = {
  "/analytics": () => import("@/pages/Analytics"),
  "/history": () => import("@/pages/History"),
  "/settings": () => import("@/pages/Settings"),
  // The viewer's bar uses the same press handler.
  "/following/settings": () => import("@/pages/FollowerSettings"),
};

/** Start a tab's chunk fetch. Called from touchstart/pointerdown on a tab. */
export function prefetchTab(path) {
  const load = TAB_CHUNKS[path];
  if (load) load().catch(() => {});
}

/**
 * Warm the other tabs' chunks once the first screen has painted. Returns a
 * cleanup, so a shell that unmounts cancels the idle callback.
 */
export function prefetchTabsOnIdle() {
  if (typeof window === "undefined") return () => {};
  const run = () => Object.values(TAB_CHUNKS).forEach((load) => load().catch(() => {}));
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(run, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1200);
  return () => window.clearTimeout(id);
}