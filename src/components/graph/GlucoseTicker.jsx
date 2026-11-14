import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import updateGlucoseTicker from "@/lib/glucoseTickerDom";

// React owns the shell only. Stable digit rails are updated in place; active
// scrolling cancels any live tick and writes the new digits synchronously.
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
    style={{ display: "inline-flex", fontVariantNumeric: "tabular-nums", ...style }}
    aria-hidden={ariaHidden ? "true" : undefined} />;
});

export default GlucoseTicker;