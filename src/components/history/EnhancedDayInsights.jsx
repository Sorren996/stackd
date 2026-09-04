import { Sparkles } from "lucide-react";

export default function EnhancedDayInsights({ insights }) {
  if (!insights?.length) return null;

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: "linear-gradient(145deg, rgba(91,168,138,0.06), rgba(255,255,255,0.01))",
        borderColor: "rgba(91,168,138,0.22)",
      }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-teal-300/80" />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200/80">What stood out</span>
      </div>
      <ul className="space-y-1.5">
        {insights.map((line, i) => (
          <li key={i} className="text-xs leading-relaxed text-white/70">
            {line}
          </li>
        ))}
      </ul>
    </div>
  );
}