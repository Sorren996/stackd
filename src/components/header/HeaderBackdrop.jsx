/**
 * The sticky top header's backdrop.
 *
 * Two stacked layers, both painted BELOW the logo row (the logo keeps its own
 * z-10 layer), and both transparent to pointers:
 *
 *  1. Blur — a graduated backdrop blur, at full strength along the top edge and
 *     fading to a tenth at the bottom, so the bar reads as out-of-focus page
 *     rather than a panel across the screen.
 *  2. Tint — a slate veil in the header's own slate field (#4C6770). This is
 *     what keeps the bar slate while cream cards scroll underneath: blurring
 *     cream produces cream, so the veil is what stops the header washing out
 *     into white. It carries NO white or cream stop anywhere, starts almost
 *     solid at the very top (status area included) and settles to a light veil
 *     at the bottom edge so it blends into the page.
 */

// #4C6770 as channels, so the veil can be graduated by alpha alone.
const SLATE = "76, 103, 112";

// Nearly solid at the top edge, fading to a light veil where the bar meets the
// page. Slate at every stop — never white, never cream.
const HEADER_TINT = [
  `linear-gradient(to bottom`,
  `rgba(${SLATE}, 0.92) 0%`,
  `rgba(${SLATE}, 0.72) 42%`,
  `rgba(${SLATE}, 0.38) 74%`,
  `rgba(${SLATE}, 0.14) 100%)`,
].join(", ");

// Full blur at the top, a tenth at the bottom.
const HEADER_BLUR_MASK =
  "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.1) 100%)";

export default function HeaderBackdrop() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          maskImage: HEADER_BLUR_MASK,
          WebkitMaskImage: HEADER_BLUR_MASK,
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ backgroundImage: HEADER_TINT }}
      />
    </>
  );
}