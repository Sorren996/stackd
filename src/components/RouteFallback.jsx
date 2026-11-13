/**
 * The Suspense fallback for a lazily loaded route.
 *
 * A chunk that is still arriving must never paint a spinner over an empty
 * screen. This reserves the page's height and renders nothing visible, so the
 * shell, the header and the dock stay exactly where they are and the arriving
 * page takes its place without a flash or a jump.
 */
export default function RouteFallback() {
  return <div aria-hidden="true" style={{ minHeight: "60vh" }} />;
}