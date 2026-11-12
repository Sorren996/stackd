// Change the app route without replacing the WKWebView document.
export default function softNavigation(path = '/') {
  const destination = new URL(path, window.location.origin);
  const safe = destination.origin === window.location.origin
    ? destination.pathname + destination.search + destination.hash : '/';
  window.history.replaceState(window.history.state, '', safe);
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
}