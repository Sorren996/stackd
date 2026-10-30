/**
 * The bar's background: a solid, opaque, straight-edged surface separated from
 * the page by one fine divider along its top edge.
 *
 * Deliberately no blur, transparency, gradient, glow, inner bevel or drop
 * shadow, and no rounding: the navigation is a plane of the page, not a
 * floating object on top of it.
 */
export default function NavSurface() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0"
      style={{
        background: "var(--nav-surface)",
        borderTop: "1px solid var(--nav-border)",
        borderLeft: "1px solid var(--nav-border)",
        borderRight: "1px solid var(--nav-border)",
      }}
    />
  );
}