/**
 * One source of truth for the fixed header's geometry and the content
 * clearance it requires.
 *
 * The header, its blur footprint and the scroll content's top padding were
 * previously three independent numbers, so raising the blur's reach silently
 * pushed the first card into it. Everything below derives from the same three
 * measurements instead:
 *
 *   safe area
 *   ├── HEADER_BAR_PX .............. the logo row (fixed, never scrolls)
 *   ├── HEADER_BLUR_TAIL_PX ........ how far the blur taper runs past the bar
 *   └── CONTENT_TOP_GAP_PX ......... deliberate air before the first card
 *
 * The first thing in the content stack therefore always begins fully below the
 * blur at rest — whichever card it happens to be (Today, a connection prompt, a
 * sensor notice, several notices stacked). Because the clearance lives on the
 * scroll container rather than on any card, conditional notices join the normal
 * document flow: they push later cards down while present and leave no spacer
 * behind when they go.
 */

// Height of the logo row itself.
export const HEADER_BAR_PX = 56;

// Distance the progressive blur continues below the bar before it reaches zero.
// Keep in step with the tail in HeaderBackdrop — both read this constant.
export const HEADER_BLUR_TAIL_PX = 20;

// Intentional breathing room between the end of the blur and the first card.
export const CONTENT_TOP_GAP_PX = 20;

// Total distance from the top of the safe area to where content may begin.
export const CONTENT_TOP_PX = HEADER_BAR_PX + HEADER_BLUR_TAIL_PX + CONTENT_TOP_GAP_PX;

/** The fixed blur effect's own height (safe area + bar + tail). */
export const HEADER_BLUR_HEIGHT = `calc(env(safe-area-inset-top) + ${
  HEADER_BAR_PX + HEADER_BLUR_TAIL_PX
}px)`;

/** The logo bar's bottom edge, measured from the top of the viewport. */
export const HEADER_BAR_BOTTOM = `calc(env(safe-area-inset-top) + ${HEADER_BAR_PX}px)`;

/** Top padding for every scroll surface that sits under this header. */
export const CONTENT_TOP_PADDING = `calc(env(safe-area-inset-top) + ${CONTENT_TOP_PX}px)`;