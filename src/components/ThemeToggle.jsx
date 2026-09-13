import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/theme";

// Compact Light/Dark mode toggle. Visually belongs beside the existing refresh
// control: same size, same glass treatment. The icon reflects the CURRENTLY
// active theme — Sun when Light Mode is on, Moon when Dark Mode is on.
export default function ThemeToggle() {
  const { isLight, toggle } = useTheme();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
      className="stackd-top-control flex h-9 w-9 items-center justify-center rounded-full backdrop-blur-sm border transition-all"
      style={{
        background: "rgba(255,255,255,0.05)",
        borderColor: "rgba(255,255,255,0.05)",
      }}
    >
      {isLight ? (
        <Sun className="h-4 w-4 text-white/55" />
      ) : (
        <Moon className="h-4 w-4 text-white/55" />
      )}
    </button>
  );
}