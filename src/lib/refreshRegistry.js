// Central registry for the app's manual refresh action.
//
// Layout owns the real `handleRefresh` (it re-pulls every cached query and
// forces a Dexcom refresh). Rather than threading that callback through the
// memoized page components, the pages register with this tiny module and
// trigger it via pull-to-refresh gestures.
let activeRefresh = null;

export function setRefreshHandler(fn) {
  activeRefresh = fn;
}

export function triggerRefresh() {
  if (typeof activeRefresh === "function") activeRefresh();
}