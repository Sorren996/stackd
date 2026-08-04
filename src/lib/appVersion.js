// Single authoritative source for Stackd version and build identifier.
// The patch number is derived from APP_BUILD so only APP_BUILD needs to
// be bumped on each publish — the displayed version counts up automatically.
export const APP_BUILD = 101;

export function getAppVersion() {
  return `1.0.${APP_BUILD - 100}`;
}

export function getVersionString() {
  return `Stackd v${getAppVersion()} • Build ${APP_BUILD}`;
}