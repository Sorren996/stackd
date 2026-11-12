import BackButton from "@/components/navigation/BackButton";

/**
 * Editorial sub-page wrapper: simple back chevron + "Title *italicWord*" header.
 * No card boxes, no bordered buttons — flat editorial style.
 *
 * Back returns to the page the person actually came from (a setting can be
 * opened from Settings, from Home or from a search result), falling back to
 * Settings when there is no trustworthy previous page.
 */
export default function SettingsSubPage({ title, italicWord, children }) {
  return (
    <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
      <div className="flex items-center gap-2 px-1 pb-3">
        <BackButton
          fallback="/settings"
          label="Back to Settings"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
          style={{ color: "#f7f1e8" }}
        />
        <h1 className="text-lg font-semibold" style={{ color: "#f7f1e8" }}>
          {title} {italicWord && <span className="font-serif-italic" style={{ fontWeight: 400 }}>{italicWord}</span>}
        </h1>
      </div>
      {children}
    </div>
  );
}