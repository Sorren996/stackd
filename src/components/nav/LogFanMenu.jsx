import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LOG_CENTRE_ABOVE_BOTTOM, LOG_SIZE } from "@/components/nav/navGeometry";

const DISC = LOG_SIZE;
const DISC_RADIUS = DISC / 2;
const LABEL_GAP = 5;
const EASE_OUT = [0.16, 1, 0.3, 1];
const DISMISS_PX = 36;

// Every offset is measured from the FAB's CENTRE: this component's root box is
// sized to the FAB and sits at its origin, so "50% 50%" inside it IS the FAB
// centre and the arc cannot drift with the bar's height or the layer's padding.
//
// Up is negative. With a 56px disc and a 16px label pill 5px beneath it, in
// FAB-centre coordinates:
//   sides  (±88, -93)  → disc -121…-65, label -60…-44
//   middle (0,  -150)  → disc -178…-122, label -117…-101
//
// The FAB's own top edge is -28 (its ring reaches -31), so the closest element
// in the arc — a side label — clears the FAB by 16px, and 13px to the ring.
// Measured against the real pill heights, not assumed: the -98 first suggested
// would have left 21px, outside the 12-16px asked for.
const SIDE_X = 88;
const SIDE_Y = -93;
const MIDDLE_Y = -150;
const ARC_TOP = MIDDLE_Y - DISC_RADIUS; // -178: the arc's highest reach

// Approved order: left, centre-higher, right.
const slotFor = (index, count) => {
  if (count === 3) {
    if (index === 0) return { x: -SIDE_X, y: SIDE_Y };
    if (index === 1) return { x: 0, y: MIDDLE_Y };
    return { x: SIDE_X, y: SIDE_Y };
  }
  if (count === 2) return index === 0 ? { x: -SIDE_X, y: SIDE_Y } : { x: SIDE_X, y: SIDE_Y };
  return { x: 0, y: SIDE_Y };
};

function useViewportHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const read = () => setHeight(window.innerHeight);
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);
  return height;
}

/**
 * The logging options, fanned out above the Log button.
 *
 * The arc only ever needs to shrink on a viewport too short to hold it; the
 * floor keeps every disc at 44px so it stays comfortably tappable. Dismissal
 * (scrim, X, Escape, drag down) and the option handlers are unchanged.
 */
export default function LogFanMenu({ open, actions, onSelect, onClose, reduce }) {
  const height = useViewportHeight();
  const available = (height || 800) - LOG_CENTRE_ABOVE_BOTTOM - 16;
  const scale = Math.max(0.8, Math.min(1, available / Math.abs(ARC_TOP)));

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="fan"
          className="absolute left-0 top-0"
          style={{ width: LOG_SIZE, height: LOG_SIZE, zIndex: 52, scale }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={(_event, info) => {
            if (info.offset.y > DISMISS_PX || info.velocity.y > 500) onClose?.();
          }}
        >
          {actions.map((action, i) => {
            const { x, y } = slotFor(i, actions.length);
            const { Icon, label, id, mode } = action;
            return (
              <motion.button
                key={id}
                type="button"
                onClick={() => onSelect(mode)}
                aria-label={label}
                className="absolute"
                style={{
                  left: "50%",
                  top: "50%",
                  width: DISC,
                  height: DISC,
                  marginLeft: -DISC_RADIUS,
                  marginTop: -DISC_RADIUS,
                }}
                initial={reduce ? { opacity: 0, x, y } : { opacity: 0, x: 0, y: -10, scale: 0.55 }}
                animate={{ opacity: 1, x, y, scale: 1 }}
                exit={reduce ? { opacity: 0, x, y } : { opacity: 0, x: 0, y: -10, scale: 0.55 }}
                transition={{ duration: reduce ? 0.14 : 0.2, ease: EASE_OUT, delay: reduce ? 0 : i * 0.03 }}
                whileTap={reduce ? undefined : { scale: 0.94 }}
              >
                <span
                  className="flex h-full w-full items-center justify-center rounded-full"
                  style={{
                    background: "var(--nav-disc)",
                    border: "1px solid var(--nav-border)",
                    boxShadow: "0 6px 18px rgba(63,56,48,0.22)",
                  }}
                >
                  <Icon
                    className="h-[22px] w-[22px]"
                    strokeWidth={1.9}
                    style={{ color: "var(--nav-log)" }}
                    aria-hidden="true"
                  />
                </span>
                <span
                  className="absolute left-1/2 top-full -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-semibold leading-none"
                  style={{
                    marginTop: LABEL_GAP,
                    background: "var(--nav-disc)",
                    color: "var(--nav-ink)",
                    boxShadow: "0 2px 8px rgba(63,56,48,0.16)",
                  }}
                >
                  {label}
                </span>
              </motion.button>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}