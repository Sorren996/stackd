import { useEffect, useRef, useState, useCallback } from "react";

// Native-style pull-to-refresh for the app's main scroll view, following the
// Facebook/News Feed release pattern:
//
//   - Pull down from the top: <main> follows the finger 1:1 (rAF transform +
//     opacity, no React renders during the gesture).
//   - Release past the threshold: content does NOT snap back — it settles and
//     HOLDS at the hold offset, spinner fully visible in the gap between the
//     sticky header and the first card, spinning for the whole refresh cycle.
//   - The gesture stays live while a refresh runs: pulling down again from the
//     held position extends the content further elastically, and releasing past
//     a re-trigger distance restarts the cycle cleanly (fresh 2.5s min / 6s cap,
//     superseded cycle's state application canceled via the generation counter).
//   - Only when the refresh completes does the held offset spring back to 0 and
//     the spinner fade out — sequence is data-swap first, then release.
//
// Timing contract:
//   - The spinner holds for a minimum of 2.5s so every refresh reads as a
//     complete, deliberate cycle — even on a fast connection.
//   - It dismisses only once every source has settled (or the 6s hard cap
//     fires), then the content relaxes back — no toast, no note.

const PULL_THRESHOLD = 70;      // dampened px needed to begin a refresh
const MAX_PULL = 120;           // absolute translateY ceiling for <main>
const HOLD_OFFSET = 46;         // transform hold during a running refresh
const RE_TRIGGER_EXTRA = 45;    // fresh dampened px past the hold to restart a running cycle
const SPRING_MS = 320;          // spring-back / settle duration (matches the easing below)
const HEADER_OFFSET = "calc(3.5rem + env(safe-area-inset-top) + 5px)";
const MIN_VISIBLE_MS = 2500;
const MAX_DURATION_MS = 6000;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dampen = (dy) => Math.min(MAX_PULL, Math.round(Math.sqrt(Math.max(0, dy)) * 7));

export default function usePullToRefresh({ onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);

  // Gesture state lives in refs so the touch handlers never trigger a React
  // render. `phaseRef` is the source of truth for the gesture machine.
  const phaseRef = useRef("idle");      // "idle" | "pulling" | "refreshing"
  const baseRef = useRef(0);            // resting offset gestures sit on top of: 0 idle, HOLD_OFFSET refreshing
  const startYRef = useRef(null);
  const activeRef = useRef(false);      // a finger is currently pulling
  const refreshingRef = useRef(false);  // mirrors phase for the spin class + spinner visuals
  const pushDistRef = useRef(0);        // translateY we intend to render
  const animateRef = useRef(false);     // whether the next paint applies a CSS spring transition
  const rafRef = useRef(null);          // pending animation frame
  const generationRef = useRef(0);      // increments each cycle; stale continuations refuse to apply state
  const finishTimerRef = useRef(null);  // spinner-transition cleanup after the exit spring
  const mainRef = useRef(null);
  const spinnerRef = useRef(null);

  const mainEl = () => {
    if (!mainRef.current) mainRef.current = document.querySelector("main");
    return mainRef.current;
  };

  // Single coalesced rAF pass. Each touchmove / boundary writes the desired
  // target + whether to animate; the next frame applies both. Two scheduled
  // paints in one frame collapse into one — no dropped frames, no React.
  const paintFrame = useCallback(() => {
    rafRef.current = null;
    const el = mainEl();
    const target = pushDistRef.current;
    const animate = animateRef.current;

    if (el) {
      el.style.transition = animate
        ? `transform ${SPRING_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`
        : "none";
      el.style.transform = `translateY(${target}px)`;
    }

    if (spinnerRef.current) {
      const s = spinnerRef.current;
      const active = refreshingRef.current;
      // Fully visible at scale 1 while refreshing (held + spinning); otherwise
      // fades/scales in proportion to the current pull.
      const progress = active ? 1 : Math.min(1, target / PULL_THRESHOLD);
      const sink = active ? 22 : Math.min(target * 0.4, 22);
      s.style.opacity = String(progress);
      s.style.transform = `translateY(${sink}px) scale(${0.55 + progress * 0.45})`;
    }
  }, []);

  const schedulePaint = useCallback(
    (target, animate = false) => {
      pushDistRef.current = target;
      animateRef.current = animate;
      if (rafRef.current) return; // a frame is already pending
      rafRef.current = requestAnimationFrame(paintFrame);
    },
    [paintFrame]
  );

  const clearSpinnerTransition = useCallback(() => {
    if (spinnerRef.current) spinnerRef.current.style.transition = "";
  }, []);

  // Begin a brand-new refresh cycle (first release past threshold). Holds the
  // content at HOLD_OFFSET, spins, and runs the fetch + min/cap windows.
  const beginCycle = useCallback(() => {
      phaseRef.current = "refreshing";
      refreshingRef.current = true;
      setRefreshing(true);
      baseRef.current = HOLD_OFFSET;
      clearSpinnerTransition();
      // Settle from wherever the finger let go down/up to the hold offset.
      schedulePaint(HOLD_OFFSET, true);

      const gen = ++generationRef.current;
      const settle = (gen2) => {
        if (gen2 !== generationRef.current || !refreshingRef.current) return;
        const fetchAll = Promise.resolve().then(() => onRefresh()).catch(() => {});
        const settled = Promise.all([fetchAll, delay(MIN_VISIBLE_MS)]);
        const capped = delay(MAX_DURATION_MS);
        Promise.race([settled, capped]).then(() => finishCycle(gen2));
      };
      settle(gen);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onRefresh, schedulePaint, clearSpinnerTransition]
  );

  // Restart an already-running cycle (re-pull released past the re-trigger
  // distance). Bumps the generation so the superseded cycle's finish becomes a
  // no-op, then restarts the fetch + a fresh min/cap window while staying held.
  const restartCycle = useCallback(() => {
    if (finishTimerRef.current) {
      clearTimeout(finishTimerRef.current);
      finishTimerRef.current = null;
    }
    generationRef.current += 1;
    const gen = generationRef.current;
    clearSpinnerTransition();
    schedulePaint(HOLD_OFFSET, true); // re-hold after the released extra pull

    const fetchAll = Promise.resolve().then(() => onRefresh()).catch(() => {});
    const settled = Promise.all([fetchAll, delay(MIN_VISIBLE_MS)]);
    const capped = delay(MAX_DURATION_MS);
    Promise.race([settled, capped]).then(() => finishCycle(gen));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedulePaint, clearSpinnerTransition]);

  // End the cycle: the data swap already happened (onRefresh settled). Spring
  // the content back to 0 and fade the spinner over the same window, then hand
  // control back to the idle gesture. The generation guard makes a superseded
  // cycle a no-op.
  const finishCycle = useCallback(
    (gen) => {
      if (gen !== generationRef.current || !refreshingRef.current) return;

      refreshingRef.current = false;
      setRefreshing(false);
      phaseRef.current = "idle";
      baseRef.current = 0;

      const s = spinnerRef.current;
      if (s) {
        // CSS-driven simultaneous exit: content springs back, spinner fades.
        s.style.transition = `opacity ${SPRING_MS}ms ease, transform ${SPRING_MS}ms ease`;
        s.style.opacity = "0";
        s.style.transform = "translateY(0) scale(1)";
      }
      schedulePaint(0, true);

      // Drop the CSS transition once the spring completes so the next pull's
      // rAF-written opacity/transform are never fought by a stale transition.
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
      finishTimerRef.current = setTimeout(() => {
        finishTimerRef.current = null;
        clearSpinnerTransition();
      }, SPRING_MS + 60);
    },
    [schedulePaint, clearSpinnerTransition]
  );

  const handleStart = useCallback(
    (e) => {
      // Allow grabbing from the top when idle, and always while a refresh holds
      // the content. During a refresh the content is transform-held so scrollY
      // stays at 0, meaning atTop is also true there — the explicit refreshing
      // check just guarantees we never drop the finger mid-cycle.
      const atTop = (window.scrollY || window.pageYOffset) <= 0;
      const refreshingNow = refreshingRef.current;
      if (!refreshingNow && !atTop) return;

      // A fresh finger must not inherit a leftover CSS transition from the exit.
      clearSpinnerTransition();

      startYRef.current = e.touches?.[0]?.clientY ?? null;
      activeRef.current = startYRef.current != null;
      if (activeRef.current) phaseRef.current = "pulling";
    },
    [clearSpinnerTransition]
  );

  const handleMove = useCallback(
    (e) => {
      if (!activeRef.current) return;
      const y = e.touches?.[0]?.clientY ?? startYRef.current;
      const dy = y - startYRef.current;

      if (dy <= 0) {
        // Finger never went below the grab point — sit at the phase's base.
        schedulePaint(baseRef.current, false);
        return;
      }

      // Elastic extension on top of the held/resting base offset.
      const dist = Math.min(MAX_PULL, baseRef.current + dampen(dy));
      schedulePaint(dist, false);
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
    const dist = pushDistRef.current;
    const extra = Math.max(0, dist - baseRef.current);

    if (phaseRef.current === "refreshing") {
      // Released while a cycle runs.
      if (extra >= RE_TRIGGER_EXTRA) {
        restartCycle(); // deliberate re-pull past the re-trigger distance
      } else {
        // Mild tug — just relax back to the held offset, keep spinning.
        schedulePaint(HOLD_OFFSET, true);
      }
      return;
    }

    // Not refreshing.
    if (dist < PULL_THRESHOLD) {
      // Released before the threshold — spring back, no refresh.
      baseRef.current = 0;
      schedulePaint(0, true);
      return;
    }

    beginCycle();
  }, [beginCycle, restartCycle, schedulePaint]);

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
      if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
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