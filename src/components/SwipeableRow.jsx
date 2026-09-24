import { useState, useRef, useEffect } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";
import DeleteConfirmDialog from "@/components/insulin/DeleteConfirmDialog";

// iOS-style swipe-left action wrapper (Mail pattern). The row content is
// opaque and slides left; two action buttons sit behind the trailing edge
// and are revealed by the drag. Grey "Edit" sits closer to the content,
// red "Delete" at the far edge (destructive farthest out, per Apple).
//
// Coordination: pass `isOpen` + `onOpenChange` from a parent that tracks a
// single open id so only one row is ever revealed at once. A fast/full swipe
// past the destructive threshold auto-triggers Delete. On touch, horizontal
// swipe is captured while vertical scroll is preserved (pan-y). On
// hover-capable pointers (desktop), hovering the row reveals the actions so
// edit/delete stay reachable without touch.

const EDIT_W = 64;
const DELETE_W = 64;
const GAP = 6;
const PAD = 6;
const ACTION_WIDTH = EDIT_W + DELETE_W + GAP + PAD; // 140
const OPEN_THRESHOLD = ACTION_WIDTH * 0.5;
const FULL_SWIPE_THRESHOLD = ACTION_WIDTH * 2.2;
const DRAG_LIMIT = ACTION_WIDTH * 2.8;

const EDIT_BG = "#746959"; // warm taupe-grey, ~4.7:1 on sandstone text
const DELETE_BG = "#9c3f2e"; // error red
const BTN_FG = "#fdf9f2";

export default function SwipeableRow({
  children,
  onEdit,
  onDelete,
  isOpen,
  onOpenChange,
  rowId,
  editLabel = "Edit",
  deleteLabel = "Remove",
  itemLabel,
}) {
  const x = useMotionValue(0);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const openRef = useRef(false);
  const draggingRef = useRef(false);
  const justDraggedRef = useRef(false);

  const [supportsHover] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(hover: hover)").matches
  );

  // External close — another row opened, or parent dismissed.
  useEffect(() => {
    if (!isOpen && openRef.current) {
      openRef.current = false;
      setOpen(false);
      animate(x, 0, { type: "spring", stiffness: 460, damping: 40 });
    }
  }, [isOpen, x]);

  const apply = (nextOpen) => {
    openRef.current = nextOpen;
    setOpen(nextOpen);
    onOpenChange?.(nextOpen);
    animate(x, nextOpen ? -ACTION_WIDTH : 0, {
      type: "spring",
      stiffness: 460,
      damping: 40,
    });
  };

  const handleDragEnd = (_, info) => {
    draggingRef.current = false;
    justDraggedRef.current = true;
    // Full / fast swipe past the destructive threshold -> open confirmation.
    // Never deletes directly; the user must confirm in the dialog.
    if (info.offset.x < -FULL_SWIPE_THRESHOLD || info.velocity.x < -900) {
      apply(false);
      setConfirming(true);
      return;
    }
    if (openRef.current && info.offset.x > OPEN_THRESHOLD) {
      apply(false);
    } else if (!openRef.current && info.offset.x < -OPEN_THRESHOLD) {
      apply(true);
    } else {
      animate(x, openRef.current ? -ACTION_WIDTH : 0, {
        type: "spring",
        stiffness: 460,
        damping: 40,
      });
    }
  };

  const handleEdit = () => {
    apply(false);
    onEdit?.();
  };
  const handleDelete = () => {
    // Revealed-button path also routes through the confirmation dialog.
    apply(false);
    setConfirming(true);
  };
  const confirmDelete = () => {
    setConfirming(false);
    onDelete?.();
  };

  return (
    <div className="relative overflow-hidden" data-row-id={rowId}>
      {/* Action buttons — off-screen to the right, revealed by the drag */}
      <motion.div
        style={{ x, left: "100%", width: ACTION_WIDTH }}
        className="absolute inset-y-0 flex items-stretch gap-[6px] pr-[6px]"
        aria-hidden={!open}
      >
        <button
          type="button"
          onClick={handleEdit}
          className="flex w-16 flex-col items-center justify-center gap-0.5 rounded-lg"
          style={{ background: EDIT_BG, color: BTN_FG }}
          aria-label={editLabel}
        >
          <Pencil className="h-4 w-4" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em]">{editLabel}</span>
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="flex w-16 flex-col items-center justify-center gap-0.5 rounded-lg"
          style={{ background: DELETE_BG, color: BTN_FG }}
          aria-label={deleteLabel}
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.08em]">{deleteLabel}</span>
        </button>
      </motion.div>

      {/* Draggable content — opaque so buttons stay hidden until revealed */}
      <motion.div
        drag="x"
        style={{ x, touchAction: "pan-y", background: "#fdf9f2" }}
        dragConstraints={{ left: -DRAG_LIMIT, right: 0 }}
        dragElastic={0.05}
        dragMomentum={false}
        onDragStart={() => { draggingRef.current = true; }}
        onDragEnd={handleDragEnd}
        onClick={
          open
            ? (e) => {
                if (justDraggedRef.current) { justDraggedRef.current = false; return; }
                apply(false);
              }
            : undefined
        }
        onMouseEnter={supportsHover ? () => apply(true) : undefined}
        onMouseLeave={supportsHover ? () => { if (openRef.current) apply(false); } : undefined}
        className="relative z-10 pr-6"
      >
        {children}
      </motion.div>

      {confirming && (
        <DeleteConfirmDialog
          itemName={itemLabel}
          title="Remove this entry?"
          message="This will permanently remove it from your log."
          confirmLabel="Remove"
          cancelLabel="Cancel"
          onCancel={() => setConfirming(false)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}