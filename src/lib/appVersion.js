/* global __APP_BUILD__ */
// Single authoritative source for Stackd version and build identifier.
// APP_BUILD is injected at build time by the stackdBuildVersion Vite plugin
// (vite.config.js) and auto-increments on every publish. The displayed
// patch number counts up from the build counter.
const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 101;

export { APP_BUILD };

export function getAppVersion() {
  return `1.0.${APP_BUILD - 100}`;
}

export function getVersionString() {
  return `Stackd v${getAppVersion()} • Build ${APP_BUILD}`;
}