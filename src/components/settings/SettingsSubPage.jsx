import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

/**
 * Editorial sub-page wrapper: simple back chevron + "Title *italicWord*" header.
 * No card boxes, no bordered buttons — flat editorial style.
 */
export default function SettingsSubPage({ title, italicWord, children }) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
      <div className="flex items-center gap-2 px-1 pb-3">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="flex h-8 w-8 shrink-0 items-center justify-center transition"
          style={{ color: "#8a7f70" }}
          aria-label="Back to Settings"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold" style={{ color: "#3f3830" }}>
          {title} {italicWord && <span className="font-serif-italic" style={{ fontWeight: 400 }}>{italicWord}</span>}
        </h1>
      </div>
      {children}
    </div>
  );
}