import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { History } from "lucide-react";

const PALETTE = {
  green: "#58a97c",
  purple: "#8b73f7",
  muted: "#8a9496",
};

function formatElapsed(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

// Surfaces the user's typical response to similar meals (by carb load, with a
// name-match fallback) drawn from the full available MealResponseAnalysis
// history. Hidden entirely when fewer than 3 comparable meals exist so we never
// show a misleading or "no data" comparison.
export default function MealUsualResponse({ carbs, mealName, currentPeak }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!carbs || carbs <= 0) {
      setData(null);
      return;
    }

    base44.entities.MealResponseAnalysis
      .filter({ analysis_status: "complete" }, "-meal_time", 200)
      .then((analyses) => {
        if (cancelled) return;

        const lo = carbs * 0.75;
        const hi = carbs * 1.25;
        const name = (mealName || "").toLowerCase().trim();

        const similar = (analyses || []).filter((a) => {
          const c = Number(a.carbs_logged) || 0;
          if (c <= 0) return false;
          const inRange = c >= lo && c <= hi;
          const matchesName = name && (a.meal_name_normalized || "").toLowerCase().includes(name);
          if (!inRange && !matchesName) return false;
          return Number.isFinite(Number(a.peak_glucose));
        });

        if (similar.length < 3) {
          setData(null);
          return;
        }

        const peaks = similar.map((a) => Number(a.peak_glucose)).filter(Number.isFinite);
        const times = similar
          .map((a) => {
            const pt = new Date(a.peak_time).getTime();
            const mt = new Date(a.meal_time).getTime();
            return Number.isFinite(pt) && Number.isFinite(mt) ? (pt - mt) / 60000 : null;
          })
          .filter((v) => v != null);

        const avgPeak = peaks.length ? peaks.reduce((s, v) => s + v, 0) / peaks.length : null;
        const avgTime = times.length ? times.reduce((s, v) => s + v, 0) / times.length : null;

        setData({ count: similar.length, avgPeak, avgTime });
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });

    return () => {
      cancelled = true;
    };
  }, [carbs, mealName]);

  if (!data || data.avgPeak == null) return null;

  const delta =
    currentPeak != null && Number.isFinite(currentPeak) ? currentPeak - data.avgPeak : null;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <History className="h-3.5 w-3.5" style={{ color: PALETTE.green }} strokeWidth={2} />
        <p className="stackd-section-label" style={{ color: PALETTE.green }}>
          Your Usual Response
        </p>
        <span className="ml-auto text-[10px]" style={{ color: PALETTE.muted }}>
          {data.count} similar meals
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div>
          <p className="text-[10px]" style={{ color: PALETTE.muted }}>
            Average peak
          </p>
          <p className="text-base font-bold text-white">
            {Math.round(data.avgPeak)} <span className="text-[10px] font-medium" style={{ color: PALETTE.muted }}>mg/dL</span>
          </p>
        </div>
        {data.avgTime != null && (
          <div className="text-right">
            <p className="text-[10px]" style={{ color: PALETTE.muted }}>
              Average time to peak
            </p>
            <p className="text-base font-bold text-white">
              {formatElapsed(data.avgTime * 60000)}{" "}
              <span className="text-[10px] font-medium" style={{ color: PALETTE.muted }}>after meal</span>
            </p>
          </div>
        )}
      </div>

      {delta !== null && (
        <p className="text-[10px] leading-relaxed" style={{ color: PALETTE.muted }}>
          This meal peaked at {Math.round(currentPeak)} mg/dL · {delta > 0 ? "+" : ""}
          {Math.round(delta)} vs your average
        </p>
      )}
    </div>
  );
}