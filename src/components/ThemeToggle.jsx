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
      disabled
      aria-label={isLight ? "Switch to Dark Mode" : "Switch to Light Mode"}
      className="stackd-top-control hidden flex h-9 w-9 items-center justify-center rounded-full border transition-all"
      style={{
        background: "#fdf9f2",
        borderColor: "#eadccf",
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