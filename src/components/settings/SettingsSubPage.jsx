import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";

export default function SettingsSubPage({ title, children }) {
  const navigate = useNavigate();

  return (
    <div className="mx-auto max-w-md space-y-6 pb-4 pt-2">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:text-white"
          aria-label="Back to Settings"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-white">{title}</h1>
      </div>
      {children}
    </div>
  );
}