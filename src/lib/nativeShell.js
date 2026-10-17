// Detects whether the web app is running inside the native iOS Capacitor shell.
// Capacitor injects window.Capacitor with isNativePlatform() and getPlatform().
// Used to comply with App Store guidelines (e.g. hiding external purchase
// links) and to suppress in-app-only affordances like "Add to Home Screen".

export function isNativeIOS() {
  try {
    const cap = window?.Capacitor;
    if (!cap) return false;
    if (typeof cap.isNativePlatform === "function" && cap.isNativePlatform()) {
      return cap.getPlatform?.() === "ios";
    }
    if (typeof cap.getPlatform === "function") {
      return cap.getPlatform() === "ios";
    }
  } catch {
    // ignore — treat as regular web
  }
  return false;
}