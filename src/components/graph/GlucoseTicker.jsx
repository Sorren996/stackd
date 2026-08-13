import { forwardRef, useImperativeHandle, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Per-digit slot that slides old digit out and new digit in simultaneously.
// Direction (up/down) is chosen per-digit per-update for a lively feel.
function DigitSlot({ digit, direction }) {
  const isUp = direction === "up";
  const isAnimated = direction === "up" || direction === "down";
  const duration = isAnimated ? 0.5 : 0;

  return (
    <span
      style={{
        display: "inline-block",
        overflow: "hidden",
        position: "relative",
        verticalAlign: "top",
        lineHeight: "1",
      }}
    >
      {/* Reserve correct width */}
      <span style={{ visibility: "hidden" }}>{digit}</span>
      <AnimatePresence initial={false}>
        <motion.span
          key={digit}
          initial={{ y: isUp ? "100%" : "-100%" }}
          animate={{ y: "0%" }}
          exit={{ y: isUp ? "-100%" : "100%" }}
          transition={{ duration, ease: duration > 0 ? [0.16, 1, 0.3, 1] : "linear" }}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {digit}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

// Renders a glucose number with a Robinhood-style ticker animation.
// Each changed digit independently rolls up or down (randomly chosen),
// all animating simultaneously for a fluid, organic update.
//
// Imperative API via ref:
//   setValue(value, animate) — animate=true triggers per-digit rolling,
//   animate=false updates instantly (used during scroll-driven updates).
const GlucoseTicker = forwardRef(({ className = "", initialValue = "" }, ref) => {
  const [state, setState] = useState({
    digits: initialValue.split(""),
    directions: initialValue.split("").map(() => "none"),
  });
  const lastValueRef = useRef(initialValue);

  useImperativeHandle(
    ref,
    () => ({
      setValue: (value, animate = false) => {
        const newStr = String(value);
        const oldStr = lastValueRef.current;

        if (newStr === oldStr) return; // no change — skip re-render

        lastValueRef.current = newStr;

        // Skip animation if lengths differ (e.g. 99→100) — just snap
        if (!animate || !oldStr || oldStr.length !== newStr.length) {
          setState({ digits: newStr.split(""), directions: newStr.split("").map(() => "none") });
          return;
        }

        const oldDigits = oldStr.split("");
        const newDigits = newStr.split("");
        const newDirs = newDigits.map((d, i) => {
          if (d !== oldDigits[i]) return Math.random() < 0.5 ? "up" : "down";
          return "none";
        });
        setState({ digits: newDigits, directions: newDirs });
      },
    }),
    []
  );

  return (
    <span className={className} style={{ display: "inline-flex" }}>
      {state.digits.map((d, i) => (
        <DigitSlot key={i} digit={d} direction={state.directions[i] || "none"} />
      ))}
    </span>
  );
});

export default GlucoseTicker;