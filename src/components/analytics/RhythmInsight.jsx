import { Check, TrendingUp, Activity } from "lucide-react";
import { WELLNESS_COLORS } from "@/lib/glassTheme";

const PERIOD_LONG = { 7: "7 days", 14: "14 days", 30: "30 days", 60: "60 days", 90: "90 days", 270: "9 months" };

function getInsight(inRangePercent, periodLong) {
  const pct = Math.round(inRangePercent);
  if (inRangePercent >= 70) {
    return {
      icon: Check,
      title: "Strong consistency",
      message: `Your glucose stayed within your comfort zone for most of the last ${periodLong}. ${pct}% of readings were in range.`,
      color: WELLNESS_COLORS.inRange,
    };
  }
  if (inRangePercent >= 50) {
    return {
      icon: TrendingUp,
      title: "Building consistency",
      message: `Your readings spent more time in range than outside it — ${pct}% over the last ${periodLong}.`,
      color: WELLNESS_COLORS.above,
    };
  }
  return {
    icon: Activity,
    title: "More variability recently",
    message: `A larger share of readings fell outside your comfort zone. ${pct}% stayed in range over the last ${periodLong}.`,
    color: WELLNESS_COLORS.below,
  };
}

export default function RhythmInsight({ inRangePercent, rangeDays }) {
  const periodLong = PERIOD_LONG[rangeDays] || `${rangeDays} days`;
  const insight = getInsight(inRangePercent, periodLong);
  const InsightIcon = insight.icon;

  return (
    <div className="flex items-start gap-2.5">
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${insight.color}1a`, color: insight.color }}
      >
        <InsightIcon className="h-3 w-3" strokeWidth={2.5} />
      </span>
      <div className="min-w-0">
        <p className="text-[12px] font-bold" style={{ color: insight.color }}>{insight.title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-white/45">{insight.message}</p>
      </div>
    </div>
  );
}