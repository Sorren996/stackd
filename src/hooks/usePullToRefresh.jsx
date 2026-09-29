import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { triggerRefresh } from "@/lib/refreshRegistry";

// Native-style pull-to-refresh for the app's main scroll views.
//
// These pages scroll the document itself (the fixed header + padded <main>
// flows with window scroll), so the gesture listens to window scroll offsets
// rather than an inner container. When the user pulls down past PULL_THRESHOLD
// pixels while already at the very top of the page, we show a subtle matching
// spinner and trigger the app-wide refresh through refreshRegistry (which
// Layout wires to its handleRefresh).
//
// The hook attaches window-level touch listeners and returns a fixed overlay
// that translates with the pull distance, snapping back if the threshold
// isn't reached.

const PULL_THRESHOLD = 60;
const MAX_OVERDRAW = 120;

export default function usePullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const refreshingRef = useRef(false);

  const clamp = (v) => Math.min(MAX_OVERDRAW, Math.max(0, v));

  const handleStart = useCallback((e) => {
    if (refreshingRef.current) return;
    // Only begin a pull when the document is at the very top so we never
    // fight natural scrolling mid-page.
    const atTop = typeof window !== "undefined" && (window.scrollY || window.pageYOffset) <= 0;
    if (!atTop) {
      startYRef.current = null;
      return;
    }
    startYRef.current = e.touches?.[0]?.clientY ?? null;
  }, []);

  const handleMove = useCallback((e) => {
    if (refreshingRef.current || startYRef.current == null) return;
    const dy = (e.touches?.[0]?.clientY ?? startYRef.current) - startYRef.current;
    if (dy <= 0) {
      setPullDistance(0);
      return;
    }
    // Resist as the pull grows so it feels elastic rather than linear.
    const eased = Math.round(Math.sqrt(dy) * 6);
    setPullDistance(clamp(eased));
  }, []);

  const finishPull = useCallback(() => {
    setPullDistance((dist) => {
      if (dist >= PULL_THRESHOLD && !refreshingRef.current && !refreshing) {
        refreshingRef.current = true;
        setRefreshing(true);
        // Release the gesture state; triggerRefresh drives Layout's
        // handleRefresh, which manages its own isRefreshing lock.
        triggerRefresh();
        window.setTimeout(() => {
          refreshingRef.current = false;
          setRefreshing(false);
        }, 900);
      }
      return 0;
    });
  }, [refreshing]);

  const handleEnd = useCallback(() => {
    startYRef.current = null;
    finishPull();
  }, [finishPull]);

  useEffect(() => {
    const onTouchStart = (e) => handleStart(e);
    const onTouchMove = (e) => {
      if (startYRef.current != null && !refreshingRef.current) {
        // Prevent the browser's native overscroll/refresh while pulling.
        if (e.cancelable) e.preventDefault();
      }
      handleMove(e);
    };
    const onTouchEnd = () => handleEnd();

    // Attach non-passive so preventDefault works for the pull gesture.
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [handleStart, handleMove, handleEnd]);

  // The overlay shown while pulling / refreshing. Matching-copper spinner.
  const overlay =
    pullDistance > 0 || refreshing ? (
      <AnimatePresence>
        <motion.div
          key="pull-indicator"
          className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center"
          style={{ top: Math.max(8, 70 - pullDistance) }}
          initial={false}
          animate={{ opacity: pullDistance > 0 || refreshing ? 1 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            style={{
              height: 40,
              width: 40,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#fdf9f2",
              border: "1px solid #eadccf",
              boxShadow: "0 4px 16px rgba(63,56,48,0.10)",
            }}
            animate={{ rotate: refreshing ? 360 : pullDistance * 2 }}
            transition={
              refreshing
                ? { duration: 0.8, repeat: Infinity, ease: "linear" }
                : { duration: 0.2, ease: "easeOut" }
            }
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4a8 8 0 1 1-6.9 3.9"
                stroke="#9c5228"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    ) : null;

  return { pullDistance, refreshing, overlay };
}

export { PULL_THRESHOLD };