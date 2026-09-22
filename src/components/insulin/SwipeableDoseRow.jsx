import { useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";

const ACTION_WIDTH = 132; // two 56px actions + gap + padding
const OPEN_THRESHOLD = ACTION_WIDTH * 0.4;

/**
 * iOS-style swipe-left wrapper for an insulin dose row. The content stays
 * fully transparent. The edit and delete buttons are positioned just past
 * the right edge (off-screen) and share the same horizontal motion value as
 * the content, so they slide in from the right alongside the curve — never
 * overlapping it. Releasing past the threshold snaps open; tapping the
 * content while open snaps it closed.
 */
export default function SwipeableDoseRow({ children, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const x = useMotionValue(0);

  const snapTo = (target, nextOpen) => {
    setOpen(nextOpen);
    animate(x, target, { type: "spring", stiffness: 420, damping: 38 });
  };

  const handleDragEnd = (_, info) => {
    let nextOpen = open;
    if (open && info.offset.x > OPEN_THRESHOLD) {
      nextOpen = false;
    } else if (!open && info.offset.x < -OPEN_THRESHOLD) {
      nextOpen = true;
    }
    snapTo(nextOpen ? -ACTION_WIDTH : 0, nextOpen);
  };

  const close = () => snapTo(0, false);

  const handleEdit = () => {
    close();
    onEdit?.();
  };

  const handleDelete = () => {
    close();
    onDelete?.();
  };

  return (
    <div className="relative overflow-hidden">
      {/* Action buttons — start off-screen to the right, slide in with the content */}
      <motion.div
        style={{ x, left: "100%", width: ACTION_WIDTH }}
        className="absolute inset-y-0 flex items-center gap-1 pr-1"
      >
        <button
          type="button"
          onClick={handleEdit}
          className="flex h-9 w-14 items-center justify-center rounded-lg"
          style={{ background: "#5b6550", color: "#fdf9f2" }}
          aria-label="Edit dose"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-9 w-14 items-center justify-center rounded-lg"
          style={{ background: "#c97060", color: "#fdf9f2" }}
          aria-label="Delete dose"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </motion.div>

      {/* Draggable content — fully transparent, slides left to reveal buttons */}
      <motion.div
        drag="x"
        style={{ x, touchAction: "pan-y" }}
        dragConstraints={{ left: -ACTION_WIDTH, right: 0 }}
        dragElastic={0.06}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        onClick={open ? close : undefined}
        className="relative z-10"
      >
        {children}
      </motion.div>
    </div>
  );
}