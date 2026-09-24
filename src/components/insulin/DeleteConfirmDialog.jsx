import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PALETTE = {
  ink: "#3f3830",
  muted: "#6b6153",
  faint: "#746959",
  hairline: "#eadccf",
  surface: "#fdf9f2",
  canvas: "#f7f1e8",
  danger: "#9c3f2e",
};

/**
 * Small centered "Are you sure?" confirm dialog for removing a meal item.
 * Editorial-overlay style matching the app's warm palette. Portal-rendered
 * so it layers above the MealEditOverlay regardless of scroll position.
 */
export default function DeleteConfirmDialog({
  itemName,
  title = "Remove this item?",
  message = "This will permanently remove it from your meal log.",
  confirmLabel = "Yes, remove",
  cancelLabel = "Keep it",
  onCancel,
  onConfirm,
}) {
  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[120] flex items-center justify-center px-6"
        style={{ background: "rgba(63, 56, 48, 0.35)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
        onClick={onCancel}
      >
        <motion.div
          className="w-full max-w-xs rounded-2xl p-5 text-center"
          style={{
            background: PALETTE.surface,
            border: `1px solid ${PALETTE.hairline}`,
            boxShadow: "0 12px 36px rgba(63, 56, 48, 0.18)",
          }}
          initial={{ opacity: 0, scale: 0.94, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 4 }}
          transition={{ type: "spring", stiffness: 360, damping: 26 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full"
            style={{ background: "rgba(156, 63, 46, 0.08)" }}
          >
            <AlertTriangle className="h-5 w-5" style={{ color: PALETTE.danger }} />
          </div>
          <h3 className="text-base font-semibold" style={{ color: PALETTE.ink }}>
            {title}
          </h3>
          {itemName && (
            <p className="mt-1 text-[13px]" style={{ color: PALETTE.muted }}>
              {itemName}
            </p>
          )}
          <p className="mt-2 text-[12px] leading-relaxed" style={{ color: PALETTE.faint }}>
            {message}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition hover:opacity-70"
              style={{ background: PALETTE.canvas, color: PALETTE.ink, border: `1px solid ${PALETTE.hairline}` }}
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition hover:opacity-70"
              style={{ background: PALETTE.danger, color: "#f7f1e8" }}
            >
              {confirmLabel}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}