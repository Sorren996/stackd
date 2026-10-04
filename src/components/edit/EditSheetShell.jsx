import { useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  hairline: "#eadccf",
  surface: "#fdf9f2",
  canvas: "#f7f1e8",
};

/**
 * Viewport-safe edit sheet shell — portaled to document.body so it escapes
 * any transformed/scrolling dashboard ancestors. Fixed flex-column layout:
 * non-scrolling header + close, independently scrolling body, non-scrolling
 * footer. Proper dialog semantics, focus trap, Escape dismissal, body scroll
 * lock, dynamic viewport height (100dvh) and bottom safe area.
 */
export default function EditSheetShell({ open, onClose, title, children, footer, labelledBy }) {
  const sheetRef = useRef(null);
  const previouslyFocused = useRef(null);
  const autoId = useId();
  const headingId = labelledBy || autoId;

  // Body scroll lock — prevents page scroll bleed while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape key — dismisses without saving.
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [open, onClose]);

  // Focus management — focus the sheet on open, restore focus on close.
  useEffect(() => {
    if (!open) {
      previouslyFocused.current?.focus?.();
      return;
    }
    previouslyFocused.current = document.activeElement;
    const id = requestAnimationFrame(() => sheetRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  // Focus trap — keep Tab cycling within the sheet.
  useEffect(() => {
    if (!open) return;
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

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center"
      style={{
        background: "rgba(63, 56, 48, 0.25)",
        paddingTop: "max(1rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
        paddingLeft: "max(0.75rem, env(safe-area-inset-left))",
        paddingRight: "max(0.75rem, env(safe-area-inset-right))",
      }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        className="flex w-full max-w-md flex-col overflow-hidden rounded-3xl"
        style={{
          background: PALETTE.surface,
          boxShadow: "0 8px 28px rgba(63, 56, 48, 0.12), 0 2px 8px rgba(63, 56, 48, 0.06)",
          height: "min(90dvh, 100%)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Non-scrolling header */}
        <div
          className="flex shrink-0 items-center justify-between px-5 py-4"
          style={{ borderBottom: `1px solid ${PALETTE.hairline}` }}
        >
          <h2 id={headingId} className="text-lg font-semibold" style={{ color: PALETTE.ink }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 items-center justify-center rounded-full transition hover:opacity-70"
            style={{ background: PALETTE.canvas, color: PALETTE.muted }}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Independently scrolling body */}
        <div className="edit-sheet-body min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        {/* Non-scrolling footer */}
        {footer && (
          <div
            className="shrink-0 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1.25rem)]"
            style={{ borderTop: `1px solid ${PALETTE.hairline}` }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}