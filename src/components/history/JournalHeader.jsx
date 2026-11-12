import { ChevronLeft, ChevronRight } from "lucide-react";
import BackButton from "@/components/navigation/BackButton";
import { HEADER_BLUR_HEIGHT } from "@/lib/layoutMetrics";

/**
 * The pinned header shared by the Journal's two sub-views — a month's day list
 * and a single day's recap — so both behave identically.
 *
 * It sticks at the exact edge where the app's fixed logo bar and its
 * progressive blur finish (HEADER_BLUR_HEIGHT, safe-area included), so the
 * title and Back control stay on screen while the page scrolls. The band
 * carries the page's own slate field colour, so nothing shows through it, and
 * it bleeds into the page gutters by the same amount it pads back, which means
 * cards disappear cleanly at the band's edges while the row's content stays on
 * the cards' own left edge.
 *
 * This title is the only place the day's date is shown; the day card below it
 * no longer repeats it.
 */
export default function JournalHeader({
  title,
  subtitle,
  fallback = "/history",
  showDaySteps = false,
  canPrev = false,
  canNext = false,
  onPrevDay,
  onNextDay,
}) {
  return (
    <div
      className="sticky z-30 -mx-4 flex items-center gap-3 px-5 pb-3"
      style={{ top: HEADER_BLUR_HEIGHT, background: "#4c6770" }}
    >
      <BackButton
        fallback={fallback}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition"
        style={{ color: "#f7f1e8" }}
      />
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-semibold truncate" style={{ color: "#f7f1e8" }}>
          {title}
        </h2>
        <p className="text-xs font-medium" style={{ color: "#f7f1e8" }}>{subtitle}</p>
      </div>
      {showDaySteps && (
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPrevDay}
            disabled={!canPrev}
            aria-label="Previous day"
            className="flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-30"
            style={{ color: "#f7f1e8" }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onNextDay}
            disabled={!canNext}
            aria-label="Next day"
            className="flex h-8 w-8 items-center justify-center rounded-full transition disabled:opacity-30"
            style={{ color: "#f7f1e8" }}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}