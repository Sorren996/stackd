import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LOG_CENTRE_ABOVE_BOTTOM, LOG_SIZE } from "@/components/nav/navGeometry";

const DISC = LOG_SIZE;
const DISC_RADIUS = DISC / 2;
const LABEL_GAP = 6;
const EASE_OUT = [0.16, 1, 0.3, 1];
const DISMISS_PX = 36;

// Every offset below is measured from the FAB's CENTRE, which is exactly what
// this component's root box is: it is sized to the FAB and sits at its origin, so
// "50% 50%" inside it IS the FAB centre. The arc therefore cannot drift with the
// bar's height or with the padding of the layer the FAB is rendered in.
//
// Up is negative. In FAB-centre coordinates:
//   sides  (±x, -120) → disc -148…-92, its label -86…-70
//   middle (0,  -182) → disc -210…-154, its label -148…-132
//
// The FAB's own upper edge is -28, so the closest thing in the arc (a side
// label) still clears it by 42px, and no disc, label or touch box overlaps
// another at any of the widths the bar supports.
const SIDE_Y = -120;
const MIDDLE_Y = -182;
const ARC_TOP = MIDDLE_Y - DISC_RADIUS; // the arc's highest reach above the FAB centre

// The spread grows with the viewport, bounded so the outer options never reach
// the screen edge and the middle label never touches the side labels.
const spreadFor = (width) => Math.max(84, Math.min(112, width * 0.26));

// Approved order: left, centre-higher, right.
const slotFor = (index, count, spread) => {
  if (count === 3) {
    if (index === 0) return { x: -spread, y: SIDE_Y };
    if (index === 1) return { x: 0, y: MIDDLE_Y };
    return { x: spread, y: SIDE_Y };
  }
  if (count === 2) return index === 0 ? { x: -spread, y: SIDE_Y } : { x: spread, y: SIDE_Y };
  return { x: 0, y: SIDE_Y };
};

function useViewport() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const read = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    read();
    window.addEventListener("resize", read);
    window.addEventListener("orientationchange", read);
    return () => {
      window.removeEventListener("resize", read);
      window.removeEventListener("orientationchange", read);
    };
  }, []);
  return size;
}

/**
 * The logging options, fanned out above the Log button.
 *
 * On a viewport too short to hold the whole arc the fan scales down about the
 * FAB centre rather than clipping or dropping an option; the floor keeps every
 * disc at 44px so it stays comfortably tappable. Nothing else changes.
 */
export default function LogFanMenu({ open, actions, onSelect, onClose, reduce }) {
  const { width, height } = useViewport();
  const spread = spreadFor(width || 375);

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
            const { x, y } = slotFor(i, actions.length, spread);
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
                    style={{ color: "var(--nav-accent)" }}
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