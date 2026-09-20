import { useEffect, useRef, useState } from "react";

export const CORNER_RADIUS = 28;
export const DIP_RADIUS = 28;
export const NOTCH_RADIUS = 28;
export const FAB_RADIUS = 28;
export const FAB_SIZE = 56;

/**
 * Nav shape: rounded rect with a downward semicircular dip at the top
 * center. The FAB sits in this dip — the nav's border traces down into
 * the dip and back up, wrapping the FAB's lower half.
 */
export function navShapePath(W, H, cr = CORNER_RADIUS, dipR = DIP_RADIUS) {
  if (!W || !H) return "";
  return [
    `M ${cr},0`,
    `L ${W / 2 - dipR},0`,
    `A ${dipR},${dipR} 0 0 1 ${W / 2 + dipR},0`,
    `L ${W - cr},0`,
    `A ${cr},${cr} 0 0 1 ${W},${cr}`,
    `L ${W},${H - cr}`,
    `A ${cr},${cr} 0 0 1 ${W - cr},${H}`,
    `L ${cr},${H}`,
    `A ${cr},${cr} 0 0 1 0,${H - cr}`,
    `L 0,${cr}`,
    `A ${cr},${cr} 0 0 1 ${cr},0`,
    `Z`,
  ].join(" ");
}

/**
 * Modal shape: rounded rect with an upward semicircular notch at the
 * bottom center. When the modal sits above the nav, this notch wraps
 * the FAB's upper half — mirroring the nav's dip from above.
 */
export function modalShapePath(W, H, cr = CORNER_RADIUS, notchR = NOTCH_RADIUS) {
  if (!W || !H) return "";
  return [
    `M ${cr},0`,
    `L ${W - cr},0`,
    `A ${cr},${cr} 0 0 1 ${W},${cr}`,
    `L ${W},${H - cr}`,
    `A ${cr},${cr} 0 0 1 ${W - cr},${H}`,
    `L ${W / 2 + notchR},${H}`,
    `A ${notchR},${notchR} 0 0 0 ${W / 2 - notchR},${H}`,
    `L ${cr},${H}`,
    `A ${cr},${cr} 0 0 1 0,${H - cr}`,
    `L 0,${cr}`,
    `A ${cr},${cr} 0 0 1 ${cr},0`,
    `Z`,
  ].join(" ");
}

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
 * Nav glass surface — clip-path shape with darker-tinted glass fill,
 * SVG border, and drop shadow. The FAB dip is built into the path so
 * the border traces around the FAB seamlessly.
 */
export function NavGlassShape({ width, height, children }) {
  const path = width > 0 && height > 0 ? navShapePath(width, height) : "";

  return (
    <div className="relative" style={{ width: width || "100%", height }}>
      {path && (
        <div
          className="absolute inset-0"
          style={{ filter: "drop-shadow(0 14px 40px rgba(0,0,0,0.30))" }}
        >
          <div
            className="stackd-nav-glass absolute inset-0"
            style={{
              clipPath: `path("${path}")`,
              WebkitClipPath: `path("${path}")`,
            }}
          />
          <svg
            className="absolute"
            width={width}
            height={height}
            style={{ overflow: "visible" }}
          >
            <path
              d={path}
              fill="none"
              className="stackd-nav-border"
              strokeWidth="1"
            />
          </svg>
        </div>
      )}
      <div className="relative h-full" style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}

/**
 * Modal glass surface — same darker-tinted glass, with an upward notch
 * at the bottom center. Height is measured from content so the shape
 * always wraps the action list.
 */
export function ModalGlassShape({ width, children }) {
  const contentRef = useRef(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!contentRef.current) return;
    const update = () => setHeight(contentRef.current.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, []);

  const path = width > 0 && height > 0 ? modalShapePath(width, height) : "";

  return (
    <div className="relative" style={{ width: width || "100%" }}>
      {path && (
        <div
          className="absolute"
          style={{
            top: 0,
            left: 0,
            width,
            height,
            filter: "drop-shadow(0 -10px 30px rgba(0,0,0,0.25))",
          }}
        >
          <div
            className="stackd-nav-glass absolute"
            style={{
              width,
              height,
              top: 0,
              left: 0,
              clipPath: `path("${path}")`,
              WebkitClipPath: `path("${path}")`,
            }}
          />
          <svg
            className="absolute"
            width={width}
            height={height}
            style={{ overflow: "visible" }}
          >
            <path
              d={path}
              fill="none"
              className="stackd-nav-border"
              strokeWidth="1"
            />
          </svg>
        </div>
      )}
      <div ref={contentRef} className="relative" style={{ zIndex: 1 }}>
        {children}
      </div>
    </div>
  );
}