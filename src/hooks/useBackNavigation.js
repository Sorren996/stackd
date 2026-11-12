import { useCallback, useSyncExternalStore } from "react";
import { useNavigate } from "react-router-dom";
import { getLedger, subscribe, requestBack } from "@/lib/navigation/navHistoryStore";
import { isAllowedTarget } from "@/lib/navigation/backLedger";

/**
 * The app's one page-level Back behaviour.
 *
 * With a trustworthy internal previous entry it unwinds the real browser
 * history, so the page you land on is the page you actually came from and
 * system Back/Forward stay consistent. Without one (direct link, new tab,
 * expired session, a previous route this account may not open) it uses the
 * caller's documented fallback with `replace`, which never stacks an entry.
 */
export default function useBackNavigation() {
  const navigate = useNavigate();
  const ledger = useSyncExternalStore(subscribe, getLedger, getLedger);

  const goBack = useCallback(
    (fallback = "/") => {
      const decision = requestBack();
      if (decision.action === "pop") {
        navigate(-1);
        return;
      }
      if (decision.action === "suppressed") return;
      const target = isAllowedTarget(fallback, getLedger().mode) ? fallback : "/";
      navigate(target, { replace: true });
    },
    [navigate]
  );

  return { goBack, canGoBack: ledger.index > 0 };
}