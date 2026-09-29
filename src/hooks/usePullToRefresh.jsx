import { useEffect, useRef, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { triggerRefresh } from "@/lib/refreshRegistry";

// Native-style pull-to-refresh for the app's main scroll views.
//
// These pages scroll the document itself, so the gesture watches the top of the
// document and slides the whole <main> content down as the user pulls, then
// springs it back. The copper spinner is pinned just under the logo header and
// sinks slightly with the pull, then holds its spot while the refresh runs and
// fades away when content slides back up.
//
// overscroll-behavior: none suppresses native rubber-banding, so we translate
// the content purely visually. The touch listeners are passive and the <main>
// transform is written directly (no per-move React state), which keeps the
// gesture smooth and avoids the jank/janky re-render churn.

const PULL_THRESHOLD = 60;
const HEADER_OFFSET = "calc(3.5rem + env(safe-area-inset-top))";

export default function usePullToRefresh() {
  // Drawn only on gesture start/end and refresh-start, never every touchmove.
  const [pulling, setPulling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const refreshingRef = useRef(false);
  const mainRef = useRef(null);
  const spinnerRef = useRef(null);
  const idle = !pulling && !refreshing;

  const mainEl = () => {
    if (!mainRef.current) mainRef.current = document.querySelector("main");
    return mainRef.current;
  };

  // Apply the pull distance to <main> and the spinner directly. el transitions
  // are reset per move so the finger tracks 1:1, then restored on release.
  const applyPull = useCallback((dist) => {
    const el = mainEl();
    if (el) {
      el.style.transition = dist > 0 ? "none" : "transform 260ms cubic-bezier(0.16, 1, 0.3, 1)";
      el.style.transform = `translateY(${dist}px)`;
    }
    if (spinnerRef.current) {
      // Sink with the pull (capped) so the ring sits just below the header,
      // then settle back to its home right under the logo.
      const depth = refreshing ? 0 : Math.min(dist * 0.5, 22);
      spinnerRef.current.style.transform = `translateY(${depth}px)`;
    }
  }, [refreshing]);

  const handleStart = useCallback((e) => {
    if (refreshingRef.current) return;
    const atTop = typeof window !== "undefined" && (window.scrollY || window.pageYOffset) <= 0;
    startYRef.current = atTop ? (e.touches?.[0]?.clientY ?? null) : null;
  }, []);

  const handleMove = useCallback(
    (e) => {
      if (refreshingRef.current || startYRef.current == null) return;
      const dy = (e.touches?.[0]?.clientY ?? startYRef.current) - startYRef.current;
      if (dy <= 0) {
        if (pulling) {
          setPulling(false);
          applyPull(0);
        }
        return;
      }
      // Elastic resistance so the pull feels natural rather than rigid.
      const dist = Math.min(120, Math.round(Math.sqrt(dy) * 6));
      if (!pulling) setPulling(true);
      applyPull(dist);
    },
    [pulling, applyPull]
  );

  const handleEnd = useCallback(() => {
    startYRef.current = null;
    if (!pulling) return;
    setPulling(false);

    const el = mainEl();
    const current = el ? parseFloat((el.style.transform || "translateY(0)").replace(/[^0-9.-]/g, "")) || 0 : 0;
    if (current >= PULL_THRESHOLD && !refreshingRef.current) {
      refreshingRef.current = true;
      setRefreshing(true);
      applyPull(0);
      // Kick the app-wide refresh; Layout's handleRefresh re-pulls all data.
      triggerRefresh();
    } else {
      applyPull(0);
    }
  }, [pulling, applyPull]);

  useEffect(() => {
    const onStart = (e) => handleStart(e);
    const onMove = (e) => handleMove(e);
    const onEnd = () => handleEnd();
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
      applyPull(0);
    };
  }, [handleStart, handleMove, handleEnd, applyPull]);

  // End the refresh ring after a short settle window so the content slides
  // back up smoothly and the spinner fades.
  useEffect(() => {
    if (!refreshing) return;
    const id = window.setTimeout(() => {
      refreshingRef.current = false;
      setRefreshing(false);
    }, 850);
    return () => window.clearTimeout(id);
  }, [refreshing]);

  const overlay = (
    <AnimatePresence>
      {!idle && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center"
          style={{ top: HEADER_OFFSET, marginTop: 8 }}
        >
          <div
            ref={spinnerRef}
            className="flex items-center justify-center rounded-full"
            style={{
              height: 34,
              width: 34,
              background: "#fdf9f2",
              border: "1px solid #eadccf",
              boxShadow: "0 4px 16px rgba(63,56,48,0.10)",
              willChange: "transform",
            }}
          >
            <motion.svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              animate={{ rotate: refreshing ? 360 : 0 }}
              transition={
                refreshing ? { duration: 0.8, repeat: Infinity, ease: "linear" } : { duration: 0.3 }
              }
            >
              <path d="M12 4a8 8 0 1 1-6.9 3.9" stroke="#9c5228" strokeWidth="2.4" strokeLinecap="round" />
            </motion.svg>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { pullDistance: 0, refreshing, overlay };
}

export { PULL_THRESHOLD };