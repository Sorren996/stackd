import { motion } from "framer-motion";
import { Heart, ArrowUp, ArrowDown } from "lucide-react";
import { WELLNESS_COLORS } from "@/lib/glassTheme";

const MIN_READINGS = 3;
const ELEVATED_THRESHOLD = 20;
const LOW_THRESHOLD = 15;

const CARD_SURFACE = {
  background: "linear-gradient(152deg, rgba(255,255,255,0.035), rgba(255,255,255,0.006))",
  borderColor: "rgba(255,255,255,0.08)",
  boxShadow: "0 8px 32px rgba(0,0,0,0.10), inset 0 1px 1px rgba(255,255,255,0.08)",
  backdropFilter: "blur(4px)",
};

const PERIOD_FORMAT = {
  "12am – 6am": "12 AM–6 AM",
  "6am – 12pm": "6 AM–12 PM",
  "12pm – 6pm": "12 PM–6 PM",
  "6pm – 12am": "6 PM–12 AM",
};

function getTimeBucket(label) {
  switch (label) {
    case "Early Morning": return "overnight";
    case "Morning": return "morning";
    case "Afternoon": return "afternoon";
    case "Evening": return "evening";
    default: return null;
  }
}

const OBSERVATIONS = {
  steady: "Your most consistent glucose period.",
  rise: "Glucose tends to climb most during this window.",
  low: "More below-range readings cluster during this window.",
};

const SUGGESTIONS = {
  steady: {
    overnight: "What tends to stay consistent in your evening routine here.",
    morning: "Which parts of your morning rhythm tend to repeat here.",
    afternoon: "What parts of your day tend to stay steady here.",
    evening: "What tends to stay consistent in your evening routine here.",
  },
  rise: {
    overnight: "Whether late nourishment or similar evening routines tend to precede this pattern.",
    morning: "Whether this begins before or after your first meal.",
    afternoon: "Lunch timing, stress, or long stretches of sitting around this period.",
    evening: "Whether dinner or evening snacks tend to line up with this rise.",
  },
  low: {
    overnight: "What tends to happen in the hours before bedtime.",
    morning: "Whether these readings follow activity or longer gaps between nourishment.",
    afternoon: "Whether these readings follow activity or longer gaps between nourishment.",
    evening: "Whether dinner timing or earlier activity lines up with this pattern.",
  },
};

function getSuggestion(type, label) {
  const bucket = getTimeBucket(label);
  return SUGGESTIONS[type]?.[bucket] || "Whether anything in your routine consistently lines up with this window.";
}

function InsightCard({ insight }) {
  const { icon: Icon, color, title, segment, type } = insight;
  const period = PERIOD_FORMAT[segment.period] || segment.period;
  const suggestion = getSuggestion(type, segment.label);

  return (
    <div className="relative overflow-hidden rounded-2xl border p-4" style={CARD_SURFACE}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 opacity-40"
        style={{ background: `radial-gradient(circle at 0% 0%, ${color}14, transparent 60%)` }}
      />
      <div className="relative z-10 flex items-start gap-3">
        <div className="shrink-0 rounded-xl p-2" style={{ background: `${color}18` }}>
          <Icon className="h-4 w-4" strokeWidth={2.5} style={{ color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: `${color}` }}>{title}</p>
          <p className="mt-0.5 text-[13px] font-semibold text-white/90">{segment.label} · {period}</p>
          <p className="mt-2 text-[13px] leading-snug text-white/60">{OBSERVATIONS[type]}</p>
          <p className="mt-2 text-[11px] text-white/35">
            <span className="font-semibold text-white/70">{segment.count}</span> readings
            {" · "}
            {segment.avg !== null && (<><span className="font-semibold text-white/70">{segment.avg}</span> mg/dL avg</>)}
            {" · "}
            <span className="font-semibold text-white/70">{Math.round(segment.inRangePct)}%</span> in range
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-white/40">
            <span className="font-medium text-white/55">Worth noticing:</span> {suggestion}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function MomentsOfCare({ segments }) {
  const valid = segments.filter((s) => s.count >= MIN_READINGS);

  if (!valid.length) {
    return (
      <div className="relative overflow-hidden rounded-3xl border p-6" style={CARD_SURFACE}>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white">Moments of Care</p>
          <p className="mt-3 text-sm leading-relaxed text-white/45">
            Keep logging readings throughout your day to reveal your body's gentle patterns.
          </p>
        </div>
      </div>
    );
  }

  const mostPeaceful = valid.reduce((best, s) => (s.inRangePct > best.inRangePct ? s : best));

  const elevatedCandidates = valid.filter((s) => s.abovePct >= ELEVATED_THRESHOLD && s.label !== mostPeaceful.label);
  const mostElevated = elevatedCandidates.length
    ? elevatedCandidates.reduce((worst, s) => (s.abovePct > worst.abovePct ? s : worst))
    : null;

  const dipCandidates = valid.filter(
    (s) => s.belowPct >= LOW_THRESHOLD && s.label !== mostPeaceful.label && (!mostElevated || s.label !== mostElevated.label)
  );
  const mostLikelyToDip = dipCandidates.length
    ? dipCandidates.reduce((low, s) => (s.belowPct > low.belowPct ? s : low))
    : null;

  const insights = [
    {
      icon: Heart,
      color: WELLNESS_COLORS.inRange,
      title: "Most Steady",
      type: "steady",
      segment: mostPeaceful,
    },
    mostElevated && {
      icon: ArrowUp,
      color: WELLNESS_COLORS.above,
      title: "Where You Tend to Rise",
      type: "rise",
      segment: mostElevated,
    },
    mostLikelyToDip && {
      icon: ArrowDown,
      color: WELLNESS_COLORS.below,
      title: "Where You Tend to Run Low",
      type: "low",
      segment: mostLikelyToDip,
    },
  ].filter(Boolean);

  return (
    <div>
      <p className="mb-3 px-1 text-[10px] font-bold uppercase tracking-[0.22em] text-white">Moments of Care</p>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <motion.div
            key={insight.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
          >
            <InsightCard insight={insight} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}