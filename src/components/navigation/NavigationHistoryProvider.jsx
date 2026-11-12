import { useEffect } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import useAccessProfile from "@/hooks/useAccessProfile";
import { trackNavigation, resetNavigation } from "@/lib/navigation/navHistoryStore";

/**
 * Feeds the shared Back ledger every real navigation the router performs.
 *
 * Mounted once, inside the Router and above every route tree, so the public
 * pages, the follower shell and the patient shell all record into the same
 * per-tab ledger. It only observes — it never navigates — so opening the app,
 * refreshing data, closing a sheet or logging a reading cannot create a
 * synthetic history entry.
 */
export default function NavigationHistoryProvider({ children }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const { user, isAuthenticated } = useAuth();
  const profile = useAccessProfile();

  const userId = isAuthenticated ? user?.id || "" : "";
  // Until the account's surface is resolved this stays null, so a viewer is
  // never recorded as a patient (or the reverse).
  const mode = profile.mode === "follower" ? "follower" : profile.mode ? "patient" : null;

  useEffect(() => {
    if (!userId) {
      resetNavigation();
      return;
    }
    if (!mode) return;
    trackNavigation({
      href: `${location.pathname}${location.search}${location.hash}`,
      key: location.key,
      type: navigationType,
      userId,
      mode,
    });
  }, [location.pathname, location.search, location.hash, location.key, navigationType, userId, mode]);

  return children;
}