import { useLayoutEffect, useRef } from "react";

// Browser/WebView signals only. No unsupported native plugin or background timer.
export function useVisibilityRefresh({ onRevalidate, onBackground } = {}) {
  const callbacks = useRef({ onRevalidate, onBackground });
  callbacks.current = { onRevalidate, onBackground };
  useLayoutEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') callbacks.current.onRevalidate?.();
    };
    const hide = () => callbacks.current.onBackground?.();
    const visibility = () => document.visibilityState === 'visible' ? refresh() : hide();
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', hide);
    window.addEventListener('pageshow', refresh);
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    refresh(); // Cold open, including restoration without a new pageshow event.
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pagehide', hide);
      window.removeEventListener('pageshow', refresh);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, []);
}