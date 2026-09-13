import { useState, useEffect, useCallback } from "react";

// Stackd theme system.
// "dark" is the default and the visual source of truth; "light" is a
// purpose-built light treatment. The choice is persisted to localStorage and
// reflected on <html data-theme="..."> so a no-flash bootstrap script in
// index.html can apply it before React mounts.
const THEME_KEY = "stackd-theme";

function readInitialTheme() {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return stored === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
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
  }, [theme]);

  const setTheme = useCallback((next) => {
    setThemeState(next === "light" ? "light" : "dark");
  }, []);

  const toggle = useCallback(() => {
    setThemeState((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return { theme, setTheme, toggle, isLight: theme === "light" };
}