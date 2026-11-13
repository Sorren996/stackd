import { ChevronLeft, ChevronRight } from "lucide-react";
import BackButton from "@/components/navigation/BackButton";

/**
 * The title row shared by the Journal's three views — the month list, a month's
 * week group and a single day's recap — so all three behave identically.
 *
 * It sits in normal document flow at the top of the page content and scrolls
 * out of view with the page, exactly like the title row on every other page. It
 * is deliberately NOT pinned: a pinned band left a strip of moving content
 * between the logo header and the bar, which read as the title being welded to
 * the logo header. Nothing here covers content, so it carries no background,
 * and it uses the same small horizontal inset as the other page titles (and as
 * the cards below it) instead of bleeding into the page gutters.
 *
 * Behaviours are unchanged: Back follows real navigation history, and the day
 * chevrons page between days rather than navigating.
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
    <div className="flex items-center gap-3 px-1 pb-3 pt-2">
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