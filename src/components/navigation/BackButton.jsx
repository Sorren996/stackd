import { ChevronLeft } from "lucide-react";
import useBackNavigation from "@/hooks/useBackNavigation";

/**
 * The one page-level Back control, used by every header back arrow.
 *
 * Styling is owned by the caller (each header keeps its exact existing look);
 * only the behaviour is shared. `fallback` is the documented, deterministic
 * destination used when there is no trustworthy internal previous page.
 */
export default function BackButton({
  fallback = "/",
  label = "Back",
  className = "",
  style,
  iconClassName = "h-5 w-5",
}) {
  const { goBack } = useBackNavigation();

  return (
    <button type="button" onClick={() => goBack(fallback)} aria-label={label} className={className} style={style}>
      <ChevronLeft className={iconClassName} />
    </button>
  );
}