/**
 * Progressive backdrop blur for a sticky header. NOTHING but blur.
 *
 * A small stack of transparent sibling layers, each carrying ONLY a
 * backdrop-filter blur of a different radius and a gradient MASK that controls
 * how far down that layer's blur survives. Because each stronger layer fades
 * out earlier while the weakest reaches the bottom, the effect is at full
 * strength directly under the status area and the logo, and tapers smoothly to
 * nothing below — no rectangular band, no lower horizontal seam.
 *
 * There is deliberately no background colour, tint, gradient fill, saturation,
 * brightness, contrast, highlight, border or shadow anywhere in here. The colour
 * you see comes from the page pixels passing underneath (slate field, cream
 * cards), which the blur simply takes out of focus. The gradient is used as a
 * mask, never painted as colour.
 *
 * The container and every layer are pointer-events:none, and none of them sets
 * opacity, filter or a mask on an ancestor of the others, so the backdrop root
 * is never isolated from the content scrolling beneath.
 */

import { HEADER_BAR_PX, HEADER_BLUR_TAIL_PX } from "@/lib/layoutMetrics";

// Strongest blur at the top, weakest reaching furthest down. `fadeStart` is the
// percentage of the effect's height where that layer begins to fall away; every
// layer reaches fully transparent at 100%, so the taper ends at zero.
//
// Radii now sit at 35% of the original approved set (2 / 5 / 9 / 15 → 0.7 / 1.75
// / 3.15 / 5.25), i.e. 0.7× the previous half-strength values. Only the radius
// changed: the layer count, their order, the fade stops, the effect's height and
// everything else about the structure are untouched, so the taper still ends at
// zero with no lower seam and no colour is added anywhere.
const LAYERS = [
  { blur: 0.7, fadeStart: 58 },
  { blur: 1.75, fadeStart: 40 },
  { blur: 3.15, fadeStart: 25 },
  { blur: 5.25, fadeStart: 12 },
];

// How far below the safe-area inset the effect takes to reach zero: the logo
// bar's own height plus a short tail. Both come from the shared layout metrics,
// so the blur footprint and the content's top clearance can never drift apart.
const FADE_DEPTH_PX = HEADER_BAR_PX + HEADER_BLUR_TAIL_PX;

function maskFor(fadeStart) {
  return `linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,1) ${fadeStart}%, rgba(0,0,0,0) 100%)`;
}

export default function HeaderBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0"
      style={{ height: `calc(env(safe-area-inset-top) + ${FADE_DEPTH_PX}px)` }}
    >
      {LAYERS.map(({ blur, fadeStart }) => {
        const mask = maskFor(fadeStart);
        return (
          <div
            key={blur}
            className="header-progressive-blur pointer-events-none absolute inset-0"
            style={{
              backdropFilter: `blur(${blur}px)`,
              WebkitBackdropFilter: `blur(${blur}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          />
        );
      })}
    </div>
  );
}