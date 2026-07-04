// Single authoritative source for Stackd version and build identifier.
// Update these values during releases. All version display across the app
// should import from here — never hard-code version strings elsewhere.
export const APP_VERSION = "1.0.0";
export const APP_BUILD = 100;

export function getVersionString() {
  return `Stackd v${APP_VERSION} • Build ${APP_BUILD}`;
}