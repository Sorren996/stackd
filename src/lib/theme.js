import { useState, useEffect, useCallback } from "react";

// Stackd theme system.
// "dark" is the default and the visual source of truth; "light" is a
// purpose-built light treatment. The choice is persisted to localStorage and
// reflected on <html data-theme="..."> so a no-flash bootstrap script in
// index.html can apply it before React mounts.
const THEME_KEY = "stackd-theme";

// Resolve the initial theme from the system preference, mirroring the
// no-flash bootstrap script in index.html so both agree on first paint.
function readInitialTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle("dark", theme === "dark");
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage failure is non-fatal — the in-memory value still drives the UI.
    }
    window.dispatchEvent(new Event("stackd-theme-change"));
  }, [theme]);

  // Follow the OS preference live so switching Dark Mode on the device
  // re-skins the app without a reload.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setThemeState(e.matches ? "dark" : "light");
    onChange(mq);
    mq.addEventListener ? mq.addEventListener("change", onChange) : mq.addListener(onChange);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", onChange) : mq.removeListener(onChange);
    };
  }, []);

  const setTheme = useCallback(() => {
    setThemeState(readInitialTheme());
  }, []);

  const toggle = useCallback(() => {
    setThemeState((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  return { theme, setTheme, toggle, isLight: theme === "light" };
}

// Reactive flag for components that must re-render when the theme changes
// (e.g. the Activity Graph, which picks its palette per theme).
export function useIsLightTheme() {
  const [isLight, setIsLight] = useState(
    () => typeof document !== "undefined" && document.documentElement.dataset.theme === "light"
  );
  useEffect(() => {
    const update = () =>
      setIsLight(document.documentElement.dataset.theme === "light");
    update();
    window.addEventListener("stackd-theme-change", update);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOsChange = () =>
      setIsLight(document.documentElement.dataset.theme === "light");
    mq.addEventListener ? mq.addEventListener("change", onOsChange) : mq.addListener(onOsChange);
    return () => {
      window.removeEventListener("stackd-theme-change", update);
      mq.removeEventListener ? mq.removeEventListener("change", onOsChange) : mq.removeListener(onOsChange);
    };
  }, []);
  return isLight;
}