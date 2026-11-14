import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import updateGlucoseTicker from "@/lib/glucoseTickerDom";

// React owns the shell only. Stable digit rails roll in place, including while
// panning; callers request instant updates only for re-seats and large jumps.
const GlucoseTicker = forwardRef(function GlucoseTicker({ className = "", initialValue = "", style, ariaHidden = false }, ref) {
  const rootRef = useRef(null);
  const initialRef = useRef(initialValue);
  useLayoutEffect(() => {
    updateGlucoseTicker(rootRef.current, initialRef.current);
    const root = rootRef.current;
    return () => root.getAnimations({ subtree: true }).forEach(animation => animation.cancel());
  }, []);
  useImperativeHandle(ref, () => ({
    setValue: (value, animate = false) => updateGlucoseTicker(rootRef.current, value, animate),
    stopAnimation: () => rootRef.current?.getAnimations({ subtree: true }).forEach(animation => animation.cancel()),
  }), []);
  return <span ref={rootRef} className={className}
    style={{ display: "inline-flex", minWidth: "3ch", justifyContent: "flex-start", fontVariantNumeric: "tabular-nums", ...style }}
    aria-hidden={ariaHidden ? "true" : undefined} />;
});

export default GlucoseTicker;