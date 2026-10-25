// Geometry for the bottom navigation bar, shared by the notch surface (the
// masked fill and its SVG contour) and the raised Log button. Keeping the
// numbers in one place guarantees the cutout and the button can never drift
// apart, whatever the viewport width.
//
// Vertical coordinates are relative to the bar's TOP edge, so LOG_CENTER_Y is
// negative: the button sits above the edge, overlapping it.

export const BAR_HEIGHT = 68;
export const BAR_RADIUS = 34; // half the height — a true pill
export const SIDE_INSET = 16; // bar inset from the screen edges
export const BAR_PADDING_X = 6; // symmetric inner padding around the five slots

// Space kept between the underline's bottom edge and the pill's bottom edge, so
// the active tab never crowds the silhouette's curve. Applied as the row's own
// bottom padding — the safe-area inset is handled below the pill by the nav, so
// the two can never double up.
export const BAR_PADDING_BOTTOM = 12;

export const LOG_SIZE = 56;
export const LOG_CENTER_Y = -8;
export const LOG_RING = 3; // thin light outer ring, drawn outside the button

// Cutout radius = button radius + a visible gap all the way round.
export const NOTCH_RADIUS = 34;

// Where the notch meets the top edge, measured from the bar's centre.
export const NOTCH_HALF_WIDTH = Math.sqrt(NOTCH_RADIUS ** 2 - LOG_CENTER_Y ** 2);

// --- Anchoring the button's own layer ---------------------------------------
// The Log button is drawn in a separate fixed layer (a sibling of the bar's
// masked contour) so the notch can never clip it. Every constant above is
// measured from the bar's TOP edge; a fixed layer is not, so the two numbers
// below convert them into a distance up from the BOTTOM of the bar.
//
// In the bar's coordinates (y positive downwards from the top edge):
//   button centre = LOG_CENTER_Y                → -8  (  8px above the edge)
//   button top    = LOG_CENTER_Y - LOG_SIZE / 2 → -36 ( 36px above the edge)
//   button bottom = LOG_CENTER_Y + LOG_SIZE / 2 → +20 ( 20px below the edge)
//
// Anchoring on the button's own bottom edge is what keeps the button centred
// on the notch: the layer's box then contains the entire raised button.

// Headroom reserved above the button's top edge (36px).
export const LOG_RAISE = LOG_SIZE / 2 - LOG_CENTER_Y;

// Distance from the bottom of the bar up to the button's bottom edge (48px).
export const LOG_LAYER_BOTTOM = BAR_HEIGHT - (LOG_SIZE / 2 + LOG_CENTER_Y);

// How far the button's CENTRE sits above the bottom of the bar (76px). The fan
// uses it to work out how much room its arc has on a short viewport.
export const LOG_CENTRE_ABOVE_BOTTOM = BAR_HEIGHT + Math.abs(LOG_CENTER_Y);

/**
 * The bar's outline as ONE continuous path: a rounded pill whose top edge dips
 * in and back out around the Log button. Because it is a single stroked path,
 * no rectangular edge can show through the notch.
 */
export function buildContourPath(width) {
  const w = width;
  const h = BAR_HEIGHT;
  const r = BAR_RADIUS;
  const cx = w / 2;
  const hw = NOTCH_HALF_WIDTH;
  return [
    `M ${r} 0`,
    `H ${cx - hw}`,
    // Down around the Log button and back up to the top edge (sweep 0).
    `A ${NOTCH_RADIUS} ${NOTCH_RADIUS} 0 0 0 ${cx + hw} 0`,
    `H ${w - r}`,
    `A ${r} ${r} 0 0 1 ${w} ${r}`,
    `V ${h - r}`,
    `A ${r} ${r} 0 0 1 ${w - r} ${h}`,
    `H ${r}`,
    `A ${r} ${r} 0 0 1 0 ${h - r}`,
    `V ${r}`,
    `A ${r} ${r} 0 0 1 ${r} 0`,
    "Z",
  ].join(" ");
}

/**
 * The same notch as a mask, so the bar's background follows the contour rather
 * than being a rectangle with a circle sitting on top of it.
 */
export function notchMask() {
  return `radial-gradient(circle at 50% ${LOG_CENTER_Y}px, transparent ${NOTCH_RADIUS}px, #000 ${
    NOTCH_RADIUS + 1
  }px)`;
}

/** Clip a rect to the bar's rounded ends (used together with the notch mask). */
export function barClip() {
  return `inset(0 round ${BAR_RADIUS}px)`;
}