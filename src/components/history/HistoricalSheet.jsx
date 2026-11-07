import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import Sheet from "@/components/Sheet";

/**
 * Read-only history sheet built on the app's existing bottom sheet.
 *
 * The sheet sits above the dock, owns its own scroll, keeps safe-area padding
 * for the home indicator and the mobile keyboard, dismisses on Escape / scrim /
 * drag, and returns focus to whatever opened it. Nothing is remounted: the
 * selected day stays exactly as it was underneath.
 */
export default function HistoricalSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footerLabel = "Back to your day",
}) {
  const returnFocusRef = useRef(null);

  useEffect(() => {
    if (open) {
      returnFocusRef.current =
        typeof document !== "undefined" ? document.activeElement : null;
      return undefined;
    }
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    target?.focus?.();
    return undefined;
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-1">
          <div className="min-w-0 flex-1">
            <h2
              className="break-words text-lg font-semibold leading-snug"
              style={{ color: "#3f3830" }}
            >
              {title}
            </h2>
            {subtitle && (
              <p className="pt-1 text-xs" style={{ color: "#746959" }}>
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:opacity-60"
            style={{ background: "#f0e8db", color: "#3f3830" }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-5 pb-4 pt-3"
          style={{ overscrollBehavior: "contain" }}
        >
          {children}
        </div>

        <div
          className="shrink-0 px-5 pt-2"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 w-full rounded-full border text-sm font-medium transition active:opacity-70"
            style={{ borderColor: "#eadccf", background: "#f7f1e8", color: "#3f3830" }}
          >
            {footerLabel}
          </button>
        </div>
      </div>
    </Sheet>
  );
}