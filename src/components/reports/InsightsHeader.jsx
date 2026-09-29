import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

/**
 * Insights page header with a back chevron to History, matching the
 * editorial sub-page style used across the app.
 */
export default function InsightsHeader() {
  const navigate = useNavigate();

  return (
    <div className="flex items-center gap-2 px-1 pt-1 pb-3">
      <button
        type="button"
        onClick={() => navigate("/history")}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition"
        style={{ color: "#f7f1e8" }}
        aria-label="Back to History"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h1 className="text-lg font-semibold tracking-tight" style={{ color: "#f7f1e8" }}>
        Your <span className="font-serif-italic" style={{ fontWeight: 400 }}>reports</span>
      </h1>
    </div>
  );
}