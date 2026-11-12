import BackButton from "@/components/navigation/BackButton";

/**
 * Insights page header with a back chevron, matching the editorial sub-page
 * style used across the app.
 *
 * Back returns to whichever page really opened it — the Journal, Home, or a
 * report link — and falls back to the Journal when there is no trustworthy
 * previous page.
 */
export default function InsightsHeader() {
  return (
    <div className="flex items-center gap-2 px-1 pt-1 pb-3">
      <BackButton
        fallback="/history"
        label="Back to History"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
        style={{ color: "#f7f1e8" }}
      />
      <h1 className="text-lg font-semibold tracking-tight" style={{ color: "#f7f1e8" }}>
        Your <span className="font-serif-italic" style={{ fontWeight: 400 }}>reports</span>
      </h1>
    </div>
  );
}