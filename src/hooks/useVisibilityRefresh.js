import { useLayoutEffect, useRef } from "react";

// Browser/WebView signals only. No unsupported native plugin or background timer.
//
// A single resume on iOS fires visibilitychange, pageshow and focus within a few
// milliseconds. Each of those used to start its own revalidation round, so the
// same six queries plus the upstream poll were requested three times over. The
// triggers are now collapsed into one: a signal arriving inside the dedupe
// window joins the round that already started.
const DEDUPE_MS = 1200;

export function useVisibilityRefresh({ onRevalidate, onBackground } = {}) {
  const callbacks = useRef({ onRevalidate, onBackground });
  callbacks.current = { onRevalidate, onBackground };
  const lastRunRef = useRef(0);

  useLayoutEffect(() => {
    const refresh = (reason) => {
      if (document.visibilityState === "visible") {
        const now = Date.now();
        if (now - lastRunRef.current < DEDUPE_MS) return;
        lastRunRef.current = now;
        callbacks.current.onRevalidate?.(reason);
      }
    };
    const hide = () => callbacks.current.onBackground?.();
    const visibility = () => (document.visibilityState === "visible" ? refresh("visible") : hide());
    const pageShow = () => refresh("pageshow");
    const focus = () => refresh("focus");
    const online = () => refresh("online");

    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", pageShow);
    window.addEventListener("focus", focus);
    window.addEventListener("online", online);
    refresh("mount"); // Cold open, including restoration without a new pageshow event.
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", pageShow);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", online);
    };
  }, []);
}