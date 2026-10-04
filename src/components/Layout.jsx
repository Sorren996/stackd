import { memo, useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Dashboard from "../pages/Dashboard";
import HistoryPage from "../pages/History";
import SettingsPage from "../pages/Settings";
import AnalyticsPage from "../pages/Analytics";
import UnifiedBottomNav from "./UnifiedBottomNav";
import { useRealtimeLogSync } from "@/hooks/useRealtimeLogSync";
import { useDexcomRefresh } from "@/hooks/useDexcomRefresh";
import PullToRefresh from "@/components/PullToRefresh";

// iOS repaint bug after backgrounding: WebKit sometimes fails to repaint
// scrolled content when the WebView returns from the background, leaving
// sections invisible until touched. On visibilitychange / pageshow we nudge
// the compositor layer (translateZ toggle) and re-trigger any
// IntersectionObservers so hidden content re-renders.
function useForegroundRepaint() {
  useEffect(() => {
    const repaint = () => {
      if (document.visibilityState !== "visible") return;
      // Layer nudge — forces a repaint of the composited layer.
      document.body.style.transform = "translateZ(0)";
      // Force reflow so the transform commits, then clear it.
      void document.body.offsetHeight;
      document.body.style.transform = "";
      // Nudge any paused IntersectionObservers by emitting a scroll tick —
      // observers re-evaluate their targets on scroll.
      try {
        const scroller = document.querySelector("[data-refresh-scroll]");
        if (scroller) {
          const top = scroller.scrollTop;
          scroller.scrollTop = top + 1;
          scroller.scrollTop = top;
        }
        window.dispatchEvent(new Event("scroll"));
      } catch {
        // Non-fatal — repaint already forced via transform above.
      }
    };
    document.addEventListener("visibilitychange", repaint);
    window.addEventListener("pageshow", repaint);
    return () => {
      document.removeEventListener("visibilitychange", repaint);
      window.removeEventListener("pageshow", repaint);
    };
  }, []);
}

const CachedDashboard = memo(Dashboard);
const CachedHistoryPage = memo(HistoryPage);
const CachedSettingsPage = memo(SettingsPage);
const CachedAnalyticsPage = memo(AnalyticsPage);

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isSettingsRoute = location.pathname === "/settings";
  const isDashboardRoute = location.pathname === "/";
  const isHistoryRoute = location.pathname === "/history";
  const isAnalyticsRoute = location.pathname === "/analytics";
  const isKeepAliveRoute = isDashboardRoute || isHistoryRoute || isAnalyticsRoute || isSettingsRoute;
  const [visitedTabs, setVisitedTabs] = useState(() => ({
    dashboard: true,
    history: true,
    analytics: true,
    settings: true,
  }));

  // Keeps every page's cached log data fresh the instant a record changes —
  // including Dexcom syncs that land while the user is on Journal/Rhythms.
  useRealtimeLogSync();

  // iOS repaint nudge when returning to the foreground.
  useForegroundRepaint();

  const { requestRefresh } = useDexcomRefresh();

  const queryClient = useQueryClient();

  // Re-pulls the latest information from the database for every cached query
  // and triggers a forced Dexcom Share refresh so new readings are pulled
  // immediately. The Dexcom poll and the DB refetch run in parallel, and the
  // glucose caches are invalidated once the poll returns — so all data lands
  // in a single re-render rather than a sequence of partial updates.
  const handleRefresh = async () => {
    let timeoutId;
    try {
      // Trigger a forced Dexcom refresh (bypasses the reading-age gate, but
      // still respects the in-flight lock via the singleton promise). Runs in
      // parallel with the DB query refetch. requestRefresh invalidates the
      // glucose queries itself when a new reading arrives.
      const dexcomPromise = requestRefresh(true).catch(() => {});

      const refreshPromise = queryClient.refetchQueries({
        predicate: (query) => query.queryKey[0] !== "dexcom-connection",
      });
      // Guard against a hung connection — never leave the refresh spinning.
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("refresh-timeout")), 3000);
      });
      await Promise.race([refreshPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      // Wait for the Dexcom refresh to settle (it may have invalidated glucose
      // queries, which will refetch after this) so the indicator spins until
      // every source is updated.
      await dexcomPromise;
    } catch {
      clearTimeout(timeoutId);
    }
  };

  useEffect(() => {
    if (isDashboardRoute) {
      setVisitedTabs((tabs) => (tabs.dashboard ? tabs : { ...tabs, dashboard: true }));
    } else if (isHistoryRoute) {
      setVisitedTabs((tabs) => (tabs.history ? tabs : { ...tabs, history: true }));
    } else if (isAnalyticsRoute) {
      setVisitedTabs((tabs) => (tabs.analytics ? tabs : { ...tabs, analytics: true }));
    } else if (isSettingsRoute) {
      setVisitedTabs((tabs) => (tabs.settings ? tabs : { ...tabs, settings: true }));
    }
  }, [isDashboardRoute, isHistoryRoute, isAnalyticsRoute, isSettingsRoute]);

  const handleLogoClick = () => {
    navigate("/");
  };

  return (
    <div className="isolate relative min-h-screen overflow-x-hidden text-foreground">
      <header
        className="fixed inset-x-0 top-0 z-50"
        style={{ paddingTop: "env(safe-area-inset-top)", background: "transparent" }}
      >
        <div
          className="mx-auto flex h-14 max-w-6xl items-center justify-center px-4"
          style={{ background: "transparent" }}
        >
          <button
            type="button"
            onClick={handleLogoClick}
            aria-label="Stackd home"
            className="relative flex items-center justify-center rounded-full transition-all"
          >
            {isDashboardRoute &&
            <img
              src="https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png"
              alt="Stackd Logo"
              className="relative z-10 h-9 w-auto object-contain"
            />
            }
          </button>
        </div>
      </header>

      {/* The feed is the only scrollable, translated region. The fixed header
          and bottom nav sit outside it, so they never move during a pull. */}
      <main
        className="relative mx-auto w-full max-w-6xl px-4 overflow-visible"
        style={{
          // Bottom clearance lifts the scroll viewport's bottom edge clear of
          // the floating pill nav (60px tall + 16px bottom inset + safe-area)
          // plus a small breathing gap so the last card isn't flush against
          // the pill. The copper Log pill floats above the nav's right edge.
          height: "100dvh",
        }}
      >
        <PullToRefresh onRefresh={handleRefresh}>
          {/* Clearance lives inside the scroll content (not on the viewport)
              so cards scroll visibly beneath the frosted nav, while the last
              card can still scroll fully clear of it. The nav sits at 28px
              from the bottom (60px tall), so the last card needs ~60+28+32px
              of breathing room to scroll fully above the frosted bar. */}
          <div
            className="min-w-0 w-full"
            style={{
              paddingTop: "calc(3.5rem + env(safe-area-inset-top))",
              paddingBottom: "calc(60px + 60px + env(safe-area-inset-bottom))",
            }}
          >
            <div hidden={!isDashboardRoute}>
              <CachedDashboard />
            </div>
            {visitedTabs.history && (
              <div hidden={!isHistoryRoute}>
                <CachedHistoryPage />
              </div>
            )}
            {visitedTabs.analytics && (
              <div hidden={!isAnalyticsRoute}>
                <CachedAnalyticsPage />
              </div>
            )}
            {visitedTabs.settings && (
              <div hidden={!isSettingsRoute}>
                <CachedSettingsPage />
              </div>
            )}
            {!isKeepAliveRoute && <Outlet />}
          </div>
        </PullToRefresh>
      </main>

      <UnifiedBottomNav />
    </div>
  );
}