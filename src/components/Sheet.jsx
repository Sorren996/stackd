import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, useDragControls, AnimatePresence, useReducedMotion } from "framer-motion";

const DISMISS_OFFSET = 120;
const DISMISS_VELOCITY = 500;

/**
 * Premium Apple-style bottom sheet with drag-to-dismiss.
 *
 * - Portal-rendered, dark frosted-glass surface (visually distinct from dashboard)
 * - Spring-based open / close
 * - Drag indicator with large invisible touch area; real-time tracking + velocity dismissal
 * - Backdrop dim + blur, body scroll lock, escape key, focus management
 * - Reduced-motion aware
 */
export default function Sheet({ open, onClose, children, accentColor }) {
  const dragControls = useDragControls();
  const prefersReducedMotion = useReducedMotion();
  const sheetRef = useRef(null);

  // Lock body scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus the sheet on open
  useEffect(() => {
    if (open && sheetRef.current) sheetRef.current.focus();
  }, [open]);

  const handleDragEnd = (_event, info) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) {
      onClose?.();
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-[6px]"
            onClick={onClose}
          />

          {/* Subtle accent glow at the base */}
          {accentColor && (
            <div
              className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
              style={{
                background: `radial-gradient(ellipse 60% 100% at 50% 100%, ${accentColor}, transparent 70%)`,
              }}
            />
          )}

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 400, damping: 36, mass: 0.8 }
            }
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            className="relative flex h-[90dvh] max-h-[92dvh] flex-col overflow-hidden rounded-t-[28px] border-t"
            // Change from solid gradient to semi-transparent surface with blur
style={{
  background: "rgba(20, 25, 23, 0.11)", // Semi-transparent deep charcoal
  backdropFilter: "blur(24px)",        // The frosted effect
  WebkitBackdropFilter: "blur(24px)", // Required for Safari/iOS
  borderColor: "rgba(255,255,255,0.1)",
  boxShadow: "0 -24px 60px rgba(0,0,0,0.5), inset 0 1px 1px rgba(255,255,255,0.08)",
  willChange: "transform",
}}
          >
            {/* Drag indicator — large invisible touch target, minimal visible bar */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex min-h-[44px] shrink-0 cursor-grab touch-none items-center justify-center py-2 active:cursor-grabbing"
              role="button"
              aria-label="Drag down to dismiss"
            >
              <div className="h-1.5 w-10 rounded-full bg-white/20" />
            </div>

            {children}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}