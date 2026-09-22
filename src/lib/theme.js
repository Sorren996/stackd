import { useState, useEffect, useCallback } from "react";

// Stackd theme system.
// "dark" is the default and the visual source of truth; "light" is a
// purpose-built light treatment. The choice is persisted to localStorage and
// reflected on <html data-theme="..."> so a no-flash bootstrap script in
// index.html can apply it before React mounts.
const THEME_KEY = "stackd-theme";

function readInitialTheme() {
  // Warm editorial light mode is the only theme — always return "light".
  return "light";
}

export function useTheme() {
  const [theme, setThemeState] = useState(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    try {
      window.localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Storage failure is non-fatal — the in-memory value still drives the UI.
    }
    window.dispatchEvent(new Event("stackd-theme-change"));
  }, [theme]);

  const setTheme = useCallback(() => {
    setThemeState("light");
  }, []);

  const toggle = useCallback(() => {
    setThemeState("light");
  }, []);

  return { theme, setTheme, toggle, isLight: true };
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
    return () => window.removeEventListener("stackd-theme-change", update);
  }, []);
  return isLight;
}