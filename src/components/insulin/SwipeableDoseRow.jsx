import { useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Trash2 } from "lucide-react";

const ACTION_WIDTH = 132; // two 56px actions + gap
const OPEN_THRESHOLD = ACTION_WIDTH * 0.4;

/**
 * iOS-style swipe-left wrapper for an insulin dose row. Swiping the content
 * left reveals edit and delete actions beneath it. Tapping the content while
 * open snaps it closed. The underlying InsulinDoseRow is untouched — this is
 * purely a presentation layer around it.
 */
export default function SwipeableDoseRow({ children, onEdit, onDelete }) {
  const [open, setOpen] = useState(false);

  const handleDragEnd = (_, info) => {
    if (open && info.offset.x > OPEN_THRESHOLD) {
      setOpen(false);
    } else if (!open && info.offset.x < -OPEN_THRESHOLD) {
      setOpen(true);
    }
  };

  const handleEdit = () => {
    setOpen(false);
    onEdit?.();
  };

  const handleDelete = () => {
    setOpen(false);
    onDelete?.();
  };

  return (
    <div className="relative overflow-hidden">
      {/* Action buttons — right-aligned, revealed beneath the content */}
      <div className="absolute inset-y-0 right-0 flex items-center gap-1 pr-1">
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
      </div>

      {/* Draggable content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: -ACTION_WIDTH, right: 0 }}
        dragElastic={0.06}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        onClick={open ? () => setOpen(false) : undefined}
        animate={{ x: open ? -ACTION_WIDTH : 0 }}
        transition={{ type: "spring", stiffness: 420, damping: 38 }}
        className="relative z-10 cursor-grab active:cursor-grabbing bg-transparent"
        style={{ touchAction: "pan-y" }}
      >
        {children}
      </motion.div>
    </div>
  );
}