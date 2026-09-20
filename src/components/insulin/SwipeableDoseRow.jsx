import { useState } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";

const ACTION_WIDTH = 132; // two 56px actions + gap
const OPEN_THRESHOLD = ACTION_WIDTH * 0.4;
// Buttons reach full opacity early in the swipe for a natural feel.
const REVEAL_FRACTION = 0.35;

/**
 * iOS-style swipe-left wrapper for an insulin dose row. The content stays
 * fully transparent — no opaque background. Instead, the edit and delete
 * buttons fade in proportionally to how far the user has swiped left, driven
 * by a motion value on the drag's x position. Releasing past the threshold
 * snaps open; tapping the content while open snaps it closed.
 */
export default function SwipeableDoseRow({ children, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);
  const x = useMotionValue(0);

  const actionsOpacity = useTransform(x, (latest) => {
    const progress = Math.min(1, Math.abs(latest) / (ACTION_WIDTH * REVEAL_FRACTION));
    return progress;
  });

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
      {/* Action buttons — fade in as the user swipes left */}
      <motion.div
        style={{ opacity: actionsOpacity }}
        className="absolute inset-y-0 right-0 flex items-center gap-1 pr-1"
      >
        <button
          type="button"
          onClick={handleEdit}
          className="flex h-9 w-14 items-center justify-center rounded-lg text-white"
          style={{ background: "linear-gradient(145deg, rgba(91,168,138,0.85), rgba(91,163,184,0.72))" }}
          aria-label="Edit dose"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-9 w-14 items-center justify-center rounded-lg text-white"
          style={{ background: "linear-gradient(145deg, rgba(201,112,96,0.85), rgba(180,90,75,0.72))" }}
          aria-label="Delete dose"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </motion.div>

      {/* Draggable content — fully transparent, no background */}
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