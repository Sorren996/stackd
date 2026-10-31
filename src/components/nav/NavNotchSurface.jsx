import { useEffect, useRef, useState } from "react";
import { BAR_HEIGHT, barClip, buildContourPath } from "@/components/nav/navGeometry";

/** Measure the bar's pixel width so the SVG contour can be drawn exactly. */
export function useMeasuredWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const update = () => setWidth(ref.current.offsetWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * The bar's background: a rounded pill with a symmetrical recessed notch at the
 * top centre that the raised Log button sits in.
 *
 * The surface is a NEUTRAL FROST — no fill, no colour, no tint. All it does is
 * blur whatever passes behind it, so the page keeps reading through it as soft,
 * uncoloured focus. The silhouette and the 1px contour are built from the same
 * geometry, so the notch is a real void in the shape.
 */
export default function NavNotchSurface({ width }) {
  // Once measured, the contour itself is the clip, so the blur is cut to the
  // notch shape rather than to a rectangle.
  const clip = width > 0 ? `path("${buildContourPath(width)}")` : barClip();

  return (
    <>
      {/* The material: nothing but blur. No background colour of any kind. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          clipPath: clip,
          WebkitClipPath: clip,
          pointerEvents: "none",
          background: "transparent",
          backdropFilter: "blur(var(--dock-blur, 18px))",
          WebkitBackdropFilter: "blur(var(--dock-blur, 18px))",
        }}
      />

      {/* Inner border — one continuous stroked path, so the outline follows the
          notch and gives the frost a clean edge without adding any fill. */}
      {width > 0 && (
        <svg
          aria-hidden="true"
          width={width}
          height={BAR_HEIGHT}
          viewBox={`0 0 ${width} ${BAR_HEIGHT}`}
          className="pointer-events-none absolute left-0 top-0"
          style={{ overflow: "visible" }}
        >
          <path d={buildContourPath(width)} fill="none" stroke="var(--nav-border)" strokeWidth="1" />
        </svg>
      )}
    </>
  );
}