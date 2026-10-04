import { useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { motion, useDragControls, useReducedMotion, AnimatePresence } from "framer-motion";

const DISMISS_OFFSET = 110;
const DISMISS_VELOCITY = 500;

const PALETTE = {
  ink: "#3f3830",
  copper: "#9c5228",
  copperText: "#f7f1e8",
  sage: "#5b6550",
  muted: "#6b6153",
  faint: "#746959",
  hairline: "#eadccf",
  surface: "#fdf9f2",
  canvas: "#f7f1e8",
};

/**
 * Shared bottom-sheet shell for ALL log and edit forms.
 *
 * Locked spacing (enforced here, not per-form):
 *   - 24px side padding
 *   - pinned footer with a full-width copper primary button
 *
 * Anatomy: grabber handle → left-aligned title + optional meta line →
 * content (independently scrolling) → pinned footer.
 *
 * Opens with a bottom-to-top slide; drag-to-dismiss via the grabber handle;
 * scrim behind; × to close. Escape, body scroll lock, and focus trap.
 *
 * `detent` controls the sheet height: "default" (~88dvh) or "tall" (~92dvh)
 * for the combined Insulin + Meal form.
 */
export default function LogSheetShell({
  open,
  onClose,
  title,
  meta,
  footer,
  children,
  detent = "default",
  labelledBy,
}) {
  const dragControls = useDragControls();
  const prefersReducedMotion = useReducedMotion();
  const sheetRef = useRef(null);
  const previouslyFocused = useRef(null);
  const autoId = useId();
  const headingId = labelledBy || autoId;

  // Body scroll lock while open.
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape dismisses without saving.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose]);

  // Focus management — focus the sheet on open, restore on close.
  useEffect(() => {
    if (!open) {
      previouslyFocused.current?.focus?.();
      return undefined;
    }
    previouslyFocused.current = document.activeElement;
    const id = requestAnimationFrame(() => sheetRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Focus trap — keep Tab cycling within the sheet.
  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => {
      if (e.key !== "Tab") return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusable = sheet.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (typeof document === "undefined" || !open) return null;

  const sheetHeight = "92dvh";

  const handleDragEnd = (_event, info) => {
    if (info.offset.y > DISMISS_OFFSET || info.velocity.y > DISMISS_VELOCITY) {
      onClose?.();
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex: 90 }}>
          {/* Scrim */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
            className="absolute inset-0"
            style={{ background: "rgba(63,56,48,0.25)" }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            ref={sheetRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={headingId}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { duration: 0.38, ease: [0.32, 0.72, 0.25, 1] }
            }
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.08, bottom: 0.5 }}
            onDragEnd={handleDragEnd}
            className="absolute inset-x-0 bottom-0 flex flex-col overflow-hidden"
            style={{
              background: PALETTE.surface,
              borderRadius: "28px 28px 0 0",
              boxShadow: "0 -12px 40px rgba(63,56,48,0.12)",
              height: sheetHeight,
              willChange: "transform",
            }}
          >
            {/* Grabber handle — drag-to-dismiss */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex shrink-0 cursor-grab touch-none items-center justify-center"
              style={{ minHeight: "20px", paddingTop: "8px", paddingBottom: "2px" }}
              role="button"
              aria-label="Drag down to dismiss"
            >
              <div style={{ height: "5px", width: "40px", borderRadius: "9999px", background: "#d8cec2" }} />
            </div>

            {/* Header — Cancel + centered title (drag-to-dismiss target) */}
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="flex shrink-0 cursor-grab touch-none items-center justify-between px-5 pb-2"
              role="button"
              aria-label="Drag down to dismiss"
            >
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 items-center rounded-full px-1 text-sm font-medium transition active:opacity-60"
                style={{ color: PALETTE.copper }}
              >
                Cancel
              </button>
              <h2 id={headingId} className="text-base font-semibold" style={{ color: PALETTE.ink }}>
                {title}
              </h2>
              <div style={{ width: "52px" }} aria-hidden />
            </div>

            {/* Body — independently scrolling, overscroll contained at top edge */}
            <div
              className="min-h-0 flex-1 overflow-y-auto px-5 pb-4"
              style={{ overscrollBehavior: "contain" }}
            >
              {children}
            </div>

            {/* Pinned footer — borderless, safe-area padded */}
            {footer && (
              <div
                className="shrink-0 px-5 pt-3"
                style={{
                  paddingBottom: "max(env(safe-area-inset-bottom), 16px)",
                  background: PALETTE.surface,
                }}
              >
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  );
}

export { PALETTE as SHELL_PALETTE };