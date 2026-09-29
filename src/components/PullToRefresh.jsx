import { useRef, useState, useCallback } from "react";

// Native-style pull-to-refresh wrapping the feed content, following the
// Facebook / News Feed release pattern exactly:
//
//   - Pull down to the arming threshold: content rubber-bands after it, then
//     on release it settles and HOLDS at the threshold, spinner visible and
//     spinning for the whole refresh cycle.
//   - The gesture stays live mid-refresh: pulling down again extends the held
//     content elastically, and releasing past a re-arm distance restarts the
//     cycle (fresh 2.5s min / 6s cap). A mild tug simply resumes the hold.
//   - Only after the data swap completes does the content glide back to rest.
//
// All transform/opacity writes are imperative (paint/glide write straight to
// the refs). React re-renders never touch them — that is what keeps the held
// content from snapping back and the gesture free of mid-cycle jank.

const THRESHOLD = 70;   // px pull that arms the refresh
const MAX_PULL  = 110;  // px max visual stretch
const RESIST    = 0.55; // rubber-band damping
const MIN_SPIN  = 2500; // ms minimum spinner time
const MAX_SPIN  = 6000; // ms hard cap

export default function PullToRefresh({ onRefresh, children }) {
  const [spin, setSpin] = useState(false);
  const wrapRef = useRef(null), contentRef = useRef(null), spinRef = useRef(null);
  const S = useRef({ y0: 0, tracking: false, pull: 0, armed: false, refreshing: false, gen: 0 }).current;

  // paint: imperative, rAF-free direct style writes on refs. NEVER setState here.
  const paint = () => {
    const t = Math.max(0, Math.min(S.pull / THRESHOLD, 1));
    contentRef.current.style.transition = "none";
    contentRef.current.style.transform = `translate3d(0,${S.pull}px,0)`;
    spinRef.current.style.transition = "none";
    spinRef.current.style.opacity = String(t);
    spinRef.current.style.transform = `translate3d(0,${S.pull}px,0) scale(${t})`;
  };

  // glide: eased transition to a target offset (used for hold-settle and release)
  const glide = (target, ms = 320, done) => {
    const t = Math.max(0, Math.min(target / THRESHOLD, 1));
    S.pull = target;
    contentRef.current.style.transition = `transform ${ms}ms cubic-bezier(.32,.72,0,1)`;
    contentRef.current.style.transform = `translate3d(0,${target}px,0)`;
    spinRef.current.style.transition = `transform ${ms}ms cubic-bezier(.32,.72,0,1), opacity ${ms}ms`;
    spinRef.current.style.opacity = String(t);
    spinRef.current.style.transform = `translate3d(0,${target}px,0) scale(${t})`;
    if (done) setTimeout(done, ms);
  };

  const runRefresh = useCallback(() => {
    const gen = ++S.gen;                 // generation guard: newest pull owns the UI
    S.refreshing = true;
    S.armed = false;
    setSpin(true);
    glide(THRESHOLD, 280);               // HOLD at threshold the whole cycle — this is the missing piece
    const work = Promise.resolve(onRefresh()).catch(() => {});  // silent failure
    const min  = new Promise(r => setTimeout(r, MIN_SPIN));
    const cap  = new Promise(r => setTimeout(r, MAX_SPIN));
    Promise.race([Promise.all([work, min]), cap]).then(() => {
      if (gen !== S.gen) return;         // superseded by a newer pull: don't touch the UI
      S.refreshing = false;
      setSpin(false);
      glide(0, 350, () => { S.pull = 0; });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRefresh]);

  const onStart = useCallback((e) => {
    if (e.touches.length > 1) return;
    S.y0 = e.touches[0].clientY;
    S.tracking = S.refreshing || wrapRef.current.scrollTop <= 0;  // track even mid-refresh (back-to-back)
  }, [S]);

  const onMove = useCallback((e) => {
    if (!S.tracking) return;
    const dy = e.touches[0].clientY - S.y0;
    if (dy <= 0 && !S.refreshing) return;
    e.preventDefault();
    const base = S.refreshing ? THRESHOLD : 0;                     // extend past the held position mid-refresh
    S.pull = Math.min(base + Math.max(0, dy) * RESIST, MAX_PULL);
    S.armed = S.pull >= THRESHOLD * (S.refreshing ? 1.25 : 1);      // extra pull re-triggers a running cycle
    paint();
  }, [S]);

  const onEnd = useCallback(() => {
    if (!S.tracking) return;
    S.tracking = false;
    if (S.armed) runRefresh();                                     // re-trigger, resets the 2.5s/6s windows
    else if (!S.refreshing) glide(0, 260, () => { S.pull = 0; });  // below threshold: spring back
    else glide(THRESHOLD, 200);                                   // released mid-refresh: resume the hold
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S, runRefresh]);

  return (
    <div style={{ position: "relative", height: "100%" }}>
      <div ref={spinRef} style={{ position: "absolute", top: 4, left: "50%", width: 30, height: 30,
        marginLeft: -15, opacity: 0, pointerEvents: "none", zIndex: 10,
        filter: "drop-shadow(0 1px 3px rgba(20,30,40,0.35))" }}>
        <svg width="30" height="30" viewBox="0 0 30 30" className={spin ? "animate-spin" : ""}>
          <circle cx="15" cy="15" r="13.5" fill="#fdf9f2" stroke="rgba(255,255,255,0.6)" strokeWidth="1" />
          <path
            d="M15 3a12 12 0 1 1-10.2 4.9"
            stroke="#9c5228"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      </div>
      <div ref={wrapRef}
        data-refresh-scroll
        style={{ height: "100%", overflowY: "auto", overscrollBehaviorY: "contain", WebkitOverflowScrolling: "touch" }}
        onTouchStart={onStart} onTouchMove={onMove} onTouchEnd={onEnd} onTouchCancel={onEnd}>
        <div ref={contentRef} style={{ position: "relative", willChange: "transform" }}>
          {children}
        </div>
      </div>
    </div>
  );
}