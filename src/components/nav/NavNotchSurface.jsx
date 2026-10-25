import { useEffect, useRef, useState } from "react";
import { BAR_HEIGHT, barClip, buildContourPath, notchMask } from "@/components/nav/navGeometry";

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
 * The fill and the 1px contour are built from the same geometry, so the notch
 * is a real void in the shape — no rectangular edge passes behind the button.
 */
export default function NavNotchSurface({ width }) {
  const mask = notchMask();
  const clip = barClip();
  const shell = {
    clipPath: clip,
    WebkitClipPath: clip,
    maskImage: mask,
    WebkitMaskImage: mask,
    pointerEvents: "none",
  };

  return (
    <>
      {/* Soft shadow — a second copy of the contour, offset and blurred, so the
          shadow follows the notch instead of tracing a plain rectangle. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          ...shell,
          background: "rgba(63,56,48,0.22)",
          transform: "translateY(6px)",
          filter: "blur(12px)",
        }}
      />

      {/* The surface itself */}
      <div aria-hidden="true" className="absolute inset-0" style={{ ...shell, background: "var(--nav-surface)" }} />

      {/* Inner border — one continuous stroked path */}
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