import { useEffect, useRef, useState, useCallback } from "react";

// Native-style pull-to-refresh for the app's main scroll view.
//
// The app scrolls the document itself (the <main> element is the scrolling
// container). The gesture watches the top of the page and, when the user pulls
// down from scroll position zero, slides <main> down to follow the finger —
// the classic iOS/Android reveal (Mail, Instagram, etc.). A small circular
// indicator appears in the space opened up between the sticky header and the
// first card: it fades/scales in with the pull, spins while data refreshes,
// then fades out as the content springs back.
//
// Performance: every per-frame visual update (content translation + spinner
// opacity/scale) is a single requestAnimationFrame pass that mutates
// transform/opacity directly on ref'd DOM elements. No React state is touched
// during the gesture, so there are no re-renders and no dropped frames. React
// state only changes at gesture boundaries (refresh start / completion).

const PULL_THRESHOLD = 70;
const MAX_PULL = 120;
const HEADER_OFFSET = "calc(3.5rem + env(safe-area-inset-top) + 5px)";

export default function usePullToRefresh({ onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);

  // Gesture state lives in refs so the touchmove handler never triggers a
  // React render.
  const startYRef = useRef(null);       // touch start Y once we're at the top
  const activeRef = useRef(false);      // a top-of-page pull is in progress
  const refreshingRef = useRef(false);  // single in-flight refresh guard
  const pullDistRef = useRef(0);        // dampened distance we intend to render
  const travelRef = useRef(0);          // distance currently applied to <main>
  const rafRef = useRef(null);          // pending animation frame
  const mainRef = useRef(null);
  const spinnerRef = useRef(null);

  const mainEl = () => {
    if (!mainRef.current) mainRef.current = document.querySelector("main");
    return mainRef.current;
  };

  // Coalesce every touchmove into a single rAF pass. Two scheduled pulls in the
  // same frame collapse into one paint — no dropped frames, no React renders.
  const schedulePaint = useCallback((target) => {
    pullDistRef.current = target;
    if (rafRef.current) return; // a frame is already pending
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = mainEl();
      const dist = pullDistRef.current;
      travelRef.current = dist;

      if (el) {
        // Track the finger 1:1 with no transition while pulling; then a gentle
        // spring brings it back (or locks in place during the refresh hold).
        el.style.transition = dist > 0 ? "none" : "transform 320ms cubic-bezier(0.16, 1, 0.3, 1)";
        el.style.transform = `translateY(${dist}px)`;
      }

      // Spinner lives in the gap between the header and the first card. It
      // fades and scales in proportion to the pull, then holds while spinning.
      if (spinnerRef.current) {
        const progress = Math.min(1, dist / PULL_THRESHOLD);
        const sink = refreshingRef.current ? 20 : Math.min(dist * 0.4, 22);
        spinnerRef.current.style.opacity = String(progress);
        spinnerRef.current.style.transform = `translateY(${sink}px) scale(${0.55 + progress * 0.45})`;
      }
    });
  }, []);

  const handleStart = useCallback((e) => {
    if (refreshingRef.current) return;
    const atTop = (window.scrollY || window.pageYOffset) <= 0;
    startYRef.current = atTop ? (e.touches?.[0]?.clientY ?? null) : null;
    activeRef.current = startYRef.current != null;
  }, []);

  const handleMove = useCallback(
    (e) => {
      if (refreshingRef.current || !activeRef.current) return;
      const y = e.touches?.[0]?.clientY ?? startYRef.current;
      const dy = y - startYRef.current;
      if (dy <= 0) {
        schedulePaint(0);
        return;
      }
      // Elastic resistance — the pull gets heavier as it extends, so it feels
      // natural rather than rigid.
      const dist = Math.min(MAX_PULL, Math.round(Math.sqrt(dy) * 7));
      schedulePaint(dist);
    },
    [schedulePaint]
  );

  const handleEnd = useCallback(() => {
    startYRef.current = null;
    activeRef.current = false;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (travelRef.current <= 3 && pullDistRef.current < PULL_THRESHOLD) return;

    if (pullDistRef.current >= PULL_THRESHOLD && !refreshingRef.current) {
      // Threshold reached — begin the refresh. The content holds pulled-down
      // and the spinner spins until all data arrives, then springs back.
      refreshingRef.current = true;
      setRefreshing(true);
      schedulePaint(46);

      Promise.resolve()
        .then(() => onRefresh())
        .catch(() => {})
        .finally(() => {
          if (!refreshingRef.current) return;
          refreshingRef.current = false;
          setRefreshing(false);
          schedulePaint(0);
        });
    } else {
      schedulePaint(0);
    }
  }, [onRefresh, schedulePaint]);

  // Attach the gesture and contain overscroll on the scrolling container so
  // the browser's native rubber-band doesn't fight the gesture.
  useEffect(() => {
    const el = mainEl();
    if (el) el.style.overscrollBehaviorY = "contain";

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
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (el) el.style.transform = "";
      if (spinnerRef.current) spinnerRef.current.style.opacity = "0";
    };
  }, [handleStart, handleMove, handleEnd]);

  // Non-layout-affecting spinner: absolutely positioned, centered horizontally
  // with a negative margin so the rAF transform never fights the centering.
  const overlay = (
    <div
      ref={spinnerRef}
      className="pointer-events-none fixed left-1/2 z-[60] flex items-center justify-center rounded-full"
      style={{
        top: HEADER_OFFSET,
        marginLeft: -17,
        height: 34,
        width: 34,
        background: "#fdf9f2",
        border: "1px solid #eadccf",
        boxShadow: "0 4px 16px rgba(63,56,48,0.10)",
        opacity: 0,
        willChange: "transform, opacity",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        className={refreshing ? "animate-spin" : ""}
        style={{ display: "block" }}
      >
        <path
          d="M12 4a8 8 0 1 1-6.9 3.9"
          stroke={refreshing ? "#9c5228" : "#3f3830"}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );

  return { refreshing, overlay };
}