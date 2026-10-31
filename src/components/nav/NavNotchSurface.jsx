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
 * The surface is a frost with a low-alpha espresso wash over it: translucency is
 * kept, but the wash steady the surface so the cream labels read the same over a
 * cream card as over the slate field. The silhouette and the 1px contour are
 * built from the same geometry, so the notch is a real void in the shape.
 */
export default function NavNotchSurface({ width }) {
  // Once measured, the contour itself is the clip, so the blur is cut to the
  // notch shape rather than to a rectangle.
  const clip = width > 0 ? `path("${buildContourPath(width)}")` : barClip();

  return (
    <>
      {/* The material: frost plus the espresso wash, both clipped to the contour
          so the notch stays a real void in the shape. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          clipPath: clip,
          WebkitClipPath: clip,
          pointerEvents: "none",
          // A low-alpha espresso wash over the frost: enough to steady the
          // surface whatever passes behind it (cream card or slate field), light
          // enough that the page still reads through. It earns the labels their
          // contrast instead of leaving it to chance.
          background: "var(--dock-wash, rgba(46, 36, 32, 0.72))",
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