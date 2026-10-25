import { motion, AnimatePresence } from "framer-motion";

const DISC = 52;
const ARC_RADIUS = 74;
const EASE_OUT = [0.16, 1, 0.3, 1];
const DISMISS_PX = 36;

// Angles measured from straight up. The centre disc rides higher than the two
// outside it, so the three read as a short arc above the notch.
const ARC_ANGLES = { 1: [0], 2: [-38, 38], 3: [-54, 0, 54] };

const positionFor = (angleDeg) => {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.round(ARC_RADIUS * Math.sin(rad)), y: Math.round(-ARC_RADIUS * Math.cos(rad)) };
};

/**
 * The three logging options, fanned out above the Log button.
 *
 * Rendered inside the button's own layer so each disc orbits the button's
 * centre. The scrim belongs to the bar, not here, so that this layer can sit
 * above it without lifting the page dimming along with it.
 */
export default function LogFanMenu({ open, actions, onSelect, onClose, reduce }) {
  const angles = ARC_ANGLES[actions.length] || ARC_ANGLES[3];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="fan"
          className="absolute left-1/2 top-1/2"
          style={{ zIndex: 52 }}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={(_event, info) => {
            if (info.offset.y > DISMISS_PX || info.velocity.y > 500) onClose?.();
          }}
        >
          {actions.map((action, i) => {
            const { x, y } = positionFor(angles[i] ?? 0);
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
                  marginLeft: -DISC / 2,
                  marginTop: -DISC / 2,
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
                    background: "#fdf9f2",
                    border: "1px solid var(--nav-log)",
                    boxShadow: "0 6px 18px rgba(63,56,48,0.22)",
                  }}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={1.9} style={{ color: "var(--nav-log)" }} aria-hidden="true" />
                </span>
                <span
                  className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-semibold leading-none"
                  style={{ background: "#fdf9f2", color: "var(--nav-ink)", boxShadow: "0 2px 8px rgba(63,56,48,0.16)" }}
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