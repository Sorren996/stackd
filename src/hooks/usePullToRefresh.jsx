import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { triggerRefresh } from "@/lib/refreshRegistry";

// Native-style pull-to-refresh for the app's main scroll views.
//
// These pages scroll the document itself (the fixed header + padded <main>
// flow with window scroll), so the gesture listens to window scroll offsets
// rather than an inner container. When the user pulls down past PULL_THRESHOLD
// pixels while already at the very top of the page, we slide the whole <main>
// content down so the pull feels native, then trigger the app-wide refresh
// through refreshRegistry (which Layout wires to its handleRefresh).
//
// Because overscroll-behavior: none is set globally, native rubber-banding is
// already suppressed — so we can translate the content purely visually without
// preventDefault (which previously broke normal touch scrolling). A dedicated
// matching-copper spinner floats above the surface while the refresh runs.

const PULL_THRESHOLD = 60;
const MAX_OVERDRAW = 120;

export default function usePullToRefresh() {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startYRef = useRef(null);
  const refreshingRef = useRef(false);
  const mainRef = useRef(null);

  const clamp = (v) => Math.min(MAX_OVERDRAW, Math.max(0, v));

  // Apply the current pull distance to the app's <main> content so the pull
  // visibly moves the screen. Nothing is translated while idle or refreshing.
  const applyTransform = useCallback((dist) => {
    if (typeof document === "undefined") return;
    if (!mainRef.current) {
      mainRef.current = document.querySelector("main");
    }
    const el = mainRef.current;
    if (!el) return;
    if (dist > 0) {
      el.style.transform = `translateY(${dist}px)`;
      el.style.transition = "none";
    } else {
      el.style.transition = "transform 220ms cubic-bezier(0.16, 1, 0.3, 1)";
      el.style.transform = "translateY(0)";
    }
  }, []);

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
      applyTransform(0);
      return;
    }
    // Resist as the pull grows so it feels elastic rather than linear.
    const eased = Math.round(Math.sqrt(dy) * 6);
    const next = clamp(eased);
    setPullDistance(next);
    applyTransform(next);
  }, [applyTransform]);

  const finishPull = useCallback(() => {
    setPullDistance((dist) => {
      const shouldRefresh = dist >= PULL_THRESHOLD && !refreshingRef.current;
      applyTransform(0);
      if (shouldRefresh) {
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
  }, [applyTransform]);

  const handleEnd = useCallback(() => {
    startYRef.current = null;
    finishPull();
  }, [finishPull]);

  useEffect(() => {
    const onTouchStart = (e) => handleStart(e);
    const onTouchMove = (e) => handleMove(e);
    const onTouchEnd = () => handleEnd();

    // Attach passive touch listeners so we never block native scrolling —
    // the pull is purely visual on top of the already-suppressed overscroll.
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });

    // Clear any leftover transform if the page unmounts mid-pull.
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      applyTransform(0);
    };
  }, [handleStart, handleMove, handleEnd, applyTransform]);

  // The spinner shown while pulling / refreshing — floats above the surface
  // and drops in line with the pull so the feedback stays in view.
  const overlay =
    pullDistance > 0 || refreshing ? (
      <div className="pointer-events-none fixed inset-x-0 z-[45] flex justify-center">
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
            marginTop: Math.max(10, 52 - pullDistance + (refreshing ? 12 : 0)),
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
      </div>
    ) : null;

  return { pullDistance, refreshing, overlay };
}

export { PULL_THRESHOLD };