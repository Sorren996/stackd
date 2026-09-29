// The feed (PullToRefresh) owns its own scroll container rather than the
// window. Small helpers so features that previously read `window.scrollY` /
// called `window.scrollTo` now target the feed scroller when present, falling
// back to the window for non-feed pages.

export function getFeedScroller() {
  if (typeof document === "undefined") return null;
  return document.querySelector("[data-refresh-scroll]");
}

export function getScrollY() {
  const el = getFeedScroller();
  return el ? el.scrollTop : window.scrollY || window.pageYOffset || 0;
}

export function scrollToTop() {
  const el = getFeedScroller();
  if (el) el.scrollTo({ top: 0, left: 0, behavior: "instant" });
  else window.scrollTo({ top: 0, left: 0, behavior: "instant" });
}