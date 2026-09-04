import { format } from "date-fns";
import { Sparkles } from "lucide-react";
import { formatDuration } from "@/lib/dayRecapMetrics";

// Observational, wellness-toned notes derived only from reliable day data.
// Never dosing advice — just "what stood out".
export default function DayInsights({ metrics, carbs }) {
  if (!metrics.hasData || metrics.count < 3) return null;

  const insights = [];

  if (metrics.tir !== null) {
    insights.push(`You spent ${metrics.tir}% of the day in your comfort zone.`);
  }

  if (metrics.longestStableMs >= 30 * 60 * 1000) {
    insights.push(`Your longest steady stretch was ${formatDuration(metrics.longestStableMs)}.`);
  }

  if (metrics.steepestRise >= 40 && metrics.steepestRiseTime) {
    const precedingCarb = (carbs || []).find((c) => {
      const ct = new Date(c.consumed_at).getTime();
      return ct <= metrics.steepestRiseTime && metrics.steepestRiseTime - ct <= 90 * 60 * 1000;
    });
    if (precedingCarb) {
      const name = precedingCarb.food_name || precedingCarb.name || "your meal";
      insights.push(
        `Your steepest rise followed your ${name} around ${format(
          new Date(precedingCarb.consumed_at).getTime(),
          "h:mm a"
        )}.`
      );
    } else {
      insights.push(
        `Your steepest rise (${metrics.steepestRise} mg/dL) happened around ${format(
          metrics.steepestRiseTime,
          "h:mm a"
        )}.`
      );
    }
  }

  if (!insights.length) return null;

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