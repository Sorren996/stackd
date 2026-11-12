/**
 * What a bottom-nav tab tap must do.
 *
 * A tab is a destination, not a bookmark. Tapping it always lands on that
 * tab's own MAIN page: never a journalled day or week, never a settings
 * sub-page, and never a restored sub-path from an earlier visit. Tapping the
 * tab you are already on means "take me to the top of it".
 *
 * Back arrows are what preserve a visit path (see src/lib/navigation); the nav
 * itself never reopens a deeper view.
 */

const isUnderTab = (pathname, tabPath) =>
  tabPath === "/" ? pathname === "/" : pathname === tabPath || pathname.startsWith(`${tabPath}/`);

/**
 * @param {object} input
 * @param {string} input.pathname  current route path
 * @param {string} input.search    current query string, e.g. "?day=2026-11-11"
 * @param {string} input.tabPath   the tapped tab's main page, e.g. "/history"
 * @returns {{ to: string|null, replace: boolean }}
 *   `to: null` means: no navigation, just scroll this already-open main page to
 *   the top. `replace` is true when the tap resets a deeper view of the SAME
 *   tab, so that reset never stacks another history entry.
 */
export function resolveTabPress({ pathname, search, tabPath }) {
  const hasQuery = Boolean(search && search !== "?");
  if (pathname === tabPath && !hasQuery) return { to: null, replace: false };
  return { to: tabPath, replace: isUnderTab(pathname, tabPath) };
}

export default resolveTabPress;