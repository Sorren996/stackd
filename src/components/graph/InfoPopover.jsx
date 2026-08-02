import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

const MARGIN = 8;

// Lightweight, viewport-clamped contextual popover anchored to a screen rect.
// Closes on outside click, Escape, or any scroll (including the chart's).
export default function InfoPopover({ anchorRect, onClose, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: 0, top: 0, ready: false });

  useLayoutEffect(() => {
    if (!anchorRect || !ref.current) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = ref.current.offsetWidth;
    const h = ref.current.offsetHeight;
    let left = anchorRect.left + anchorRect.width / 2 - w / 2;
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
    const spaceBelow = vh - anchorRect.bottom;
    const openBelow = spaceBelow >= h + MARGIN;
    let top = openBelow ? anchorRect.bottom + MARGIN : anchorRect.top - h - MARGIN;
    top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));
    setPos({ left, top, ready: true });
  }, [anchorRect]);

  useEffect(() => {
    const onDocDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    };
    const onEsc = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const onScroll = () => onClose?.();
    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: pos.ready ? 1 : 0, y: pos.ready ? 0 : 6, scale: pos.ready ? 1 : 0.96 }}
        transition={{ duration: 0.14 }}
        className="fixed z-[300] w-[224px] rounded-2xl border p-3 text-left"
        style={{
          left: pos.left,
          top: pos.top,
          borderColor: "rgba(255,255,255,0.12)",
          background: "linear-gradient(165deg, rgba(18,28,23,0.97), rgba(10,16,13,0.98))",
          boxShadow: "0 18px 50px rgba(0,0,0,0.45), inset 0 1px 1px rgba(255,255,255,0.1)",
          backdropFilter: "blur(14px)",
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}