import { useEffect, useRef, useState } from "react";

export const CORNER_RADIUS = 28;
export const FAB_RADIUS = 28;
export const FAB_SIZE = 56;
export const CUTOUT_RADIUS = 32; // FAB radius + 4px gap so the notch is visible
export const NAV_HEIGHT = 60;

/** Measure an element's pixel width via ResizeObserver. */
export function useMeasuredWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const update = () => setWidth(ref.current.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Unified glass surface — one continuous shape that encompasses both the
 * navigation bar and the expanded menu. A circular cutout at the FAB
 * position is created via CSS mask-image. When the shape is short (closed),
 * the cutout sits at the top edge and reads as a semicircular dip. As the
 * shape grows upward (open), the cutout transitions into a full circular
 * hole in the center — all without any topology change, so the transition
 * is perfectly smooth.
 *
 * The border is drawn as two SVG layers: the rounded-rect stroke with the
 * circle masked out (so no straight line continues behind the FAB), and
 * the circle stroke clipped to the rect (so only the portion inside the
 * shape is visible).
 */
export function UnifiedGlassShape({ width, totalHeight, cutoutCy, children }) {
  const show = width > 0 && totalHeight > 0;
  const maskGradient = `radial-gradient(circle at 50% ${cutoutCy}px, transparent ${CUTOUT_RADIUS}px, black ${CUTOUT_RADIUS + 1}px)`;

  return (
    <div className="relative" style={{ width: width || "100%", height: totalHeight }}>
      {show && (
        <>
          {/* Glass fill — clip to rounded rect, mask out the FAB circle */}
          <div
            className="absolute inset-0"
            style={{ filter: "drop-shadow(0 4px 20px rgba(63,56,48,0.10))", pointerEvents: "none" }}
          >
            <div
              className="stackd-nav-glass absolute inset-0"
              style={{
                clipPath: `inset(0 round ${CORNER_RADIUS}px)`,
                WebkitClipPath: `inset(0 round ${CORNER_RADIUS}px)`,
                maskImage: maskGradient,
                WebkitMaskImage: maskGradient,
                pointerEvents: "none",
              }}
            />
          </div>

          {/* Border — rect with circle masked out + circle clipped to rect */}
          <svg
            width={width}
            height={totalHeight}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ overflow: "visible" }}
          >
            <defs>
              <clipPath id="unified-rect-clip">
                <rect width={width} height={totalHeight} rx={CORNER_RADIUS} />
              </clipPath>
              <mask id="unified-border-mask" maskType="luminance">
                <rect width={width} height={totalHeight} fill="white" />
                <circle cx={width / 2} cy={cutoutCy} r={CUTOUT_RADIUS} fill="black" />
              </mask>
            </defs>
            {/* Rect border — the circle area is masked out so no straight
                edge continues behind the FAB */}
            <rect
              width={width}
              height={totalHeight}
              rx={CORNER_RADIUS}
              fill="none"
              className="stackd-nav-border"
              strokeWidth="1"
              mask="url(#unified-border-mask)"
            />
            {/* Circle border — clipped to the rect so only the portion
                inside the shape is drawn (dip at edge, full circle in middle) */}
            <circle
              cx={width / 2}
              cy={cutoutCy}
              r={CUTOUT_RADIUS}
              fill="none"
              className="stackd-nav-border"
              strokeWidth="1"
              clipPath="url(#unified-rect-clip)"
            />
          </svg>
        </>
      )}

      {/* Content layer — pointer-events none so clicks on transparent areas
          (the cutout) pass through to the backdrop */}
      <div className="relative h-full" style={{ zIndex: 1, pointerEvents: "none" }}>
        {children}
      </div>
    </div>
  );
}