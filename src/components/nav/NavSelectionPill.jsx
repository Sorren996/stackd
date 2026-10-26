import { useLayoutEffect, useRef } from "react";
import { animate, motion, useMotionValue } from "framer-motion";
import {
  PILL_HEIGHT,
  PILL_RADIUS,
  PILL_TOP,
  barClip,
  navSlotRect,
  notchMask,
} from "@/components/nav/navGeometry";

// Liquid-glass travel: the chip stretches toward the destination it is heading
// to (its trailing edge pinned) and settles back into its own shape, so the
// move reads as one surface morphing rather than a block jumping between slots.
const STRETCH = 1.08;
const SETTLE = { duration: 0.36, times: [0, 0.45, 1], ease: "easeInOut" };
const GLIDE = { type: "spring", stiffness: 420, damping: 34, mass: 0.7 };

/**
 * The destination chip: one frosted-glass surface that slides between the four
 * destinations as they are chosen.
 *
 * Drawn on the bar's own sheet rather than on top of it — it carries the same
 * notch mask and rounded ends, so it can never be seen floating inside the
 * notch while it travels past the Log button. Purely decorative: each item
 * already announces itself, so this layer is hidden from assistive technology
 * and never intercepts a tap.
 */
export default function NavSelectionPill({ itemIndex, barWidth, reduce }) {
  const x = useMotionValue(0);
  const stretch = useMotionValue(1);
  // The index the chip is currently drawn at — read during render, so the
  // stretch direction is already right for the move that is about to play.
  const drawnAt = useRef(itemIndex);

  const rect = navSlotRect(itemIndex, barWidth);

  // Layout effect, not a plain one: the chip must already be on its slot in the
  // very first painted frame, never flashing under Home before sliding over.
  useLayoutEffect(() => {
    if (!barWidth) return;
    const next = navSlotRect(itemIndex, barWidth);
    const moved = drawnAt.current !== itemIndex;
    drawnAt.current = itemIndex;

    // Reduced motion, first paint and resizes land straight on the slot.
    if (reduce || !moved) {
      x.set(next.left);
      stretch.set(1);
      return;
    }

    animate(stretch, [1, STRETCH, 1], SETTLE);
    animate(x, next.left, GLIDE);
  }, [itemIndex, barWidth, reduce, x, stretch]);

  // Nothing to draw until the bar has been measured.
  if (!barWidth) return null;

  const travellingRight = itemIndex > drawnAt.current;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        zIndex: 50,
        // The bar's own void and rounded ends: the chip is part of the sheet the
        // bar is cut from, so the notch hides it exactly as it hides the surface.
        clipPath: barClip(),
        WebkitClipPath: barClip(),
        maskImage: notchMask(),
        WebkitMaskImage: notchMask(),
      }}
    >
      <motion.div
        className="absolute left-0"
        style={{
          x,
          scaleX: stretch,
          // Pinned on the trailing edge, so the stretch reaches toward the slot
          // being travelled to.
          transformOrigin: travellingRight ? "left center" : "right center",
          top: PILL_TOP,
          height: PILL_HEIGHT,
          width: rect.width,
          borderRadius: PILL_RADIUS,
          background: "var(--nav-pill)",
          border: "1px solid var(--nav-pill-border)",
          boxShadow: "var(--nav-pill-shadow)",
          backdropFilter: "blur(10px) saturate(1.15)",
          WebkitBackdropFilter: "blur(10px) saturate(1.15)",
          willChange: "transform",
        }}
      />
    </div>
  );
}