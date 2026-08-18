import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

/**
 * A grouped settings container with a muted uppercase heading and a single
 * rounded card holding compact rows separated by hairline dividers.
 */
export function SettingsGroup({ label, children }) {
  return (
    <section className="space-y-2">
      {label && (
        <h2 className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
          {label}
        </h2>
      )}
      <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm">
        {children}
      </div>
    </section>
  );
}

/**
 * Compact navigation row (~64px) with a small teal icon tile, title, optional
 * subtext, and a right chevron. Rows inside a group are divided by hairlines.
 */
export function SettingsRow({ to, onClick, icon: Icon, title, subtext, danger, last, iconClassName = "" }) {
  const content = (
    <div className={`flex items-center gap-3 px-3.5 py-3 ${!last ? "border-b border-white/[0.05]" : ""}`}>
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
          danger
            ? "border-rose-400/20 bg-rose-500/10"
            : "border-teal-500/20 bg-teal-500/10"
        }`}
      >
        {Icon && <Icon className={`h-4 w-4 ${danger ? "text-rose-300" : "text-teal-400"} ${iconClassName}`} />}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${danger ? "text-rose-200" : "text-white"}`}>{title}</p>
        {subtext && <p className="mt-0.5 truncate text-[11px] text-white/40">{subtext}</p>}
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-white/25" />
    </div>
  );

  if (to) {
    return (
      <Link to={to} className="block transition hover:bg-white/[0.03] active:scale-[0.995]">
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="block w-full text-left transition hover:bg-white/[0.03] active:scale-[0.995]">
      {content}
    </button>
  );
}