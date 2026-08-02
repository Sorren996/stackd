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
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/45 bg-white/30 text-emerald-900/70 transition hover:text-emerald-950"
          aria-label="Back to Settings"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h1 className="text-soft-shadow text-lg font-bold text-emerald-950">{title}</h1>
      </div>
      {children}
    </div>
  );
}