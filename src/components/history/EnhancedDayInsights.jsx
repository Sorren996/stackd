import { Sparkles } from "lucide-react";

export default function EnhancedDayInsights({ insights }) {
  if (!insights?.length) return null;

  return (
    <div
      className="rounded-2xl border p-4"
      style={{
        background: "#fdf9f2",
        borderColor: "#eadccf",
        boxShadow: "0 2px 12px rgba(63, 56, 48, 0.06)",
      }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5" style={{ color: "#5b6550" }} />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#5b6550" }}>What stood out</span>
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