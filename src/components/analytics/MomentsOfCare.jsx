import { motion } from "framer-motion";
import { Heart, Sun, Moon } from "lucide-react";
import { GLASS_SURFACE, WELLNESS_COLORS } from "@/lib/glassTheme";

const MIN_READINGS = 3;
const ELEVATED_THRESHOLD = 20;
const LOW_THRESHOLD = 15;

function InsightCard({ icon: Icon, color, title, segment, message }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border p-4" style={GLASS_SURFACE}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-6 opacity-40"
        style={{ background: `radial-gradient(circle at 0% 0%, ${color}15, transparent 60%)` }}
      />
      <div className="relative z-10 flex items-start gap-3">
        <div className="shrink-0 rounded-xl p-2" style={{ background: `${color}18` }}>
          <Icon className="h-4 w-4" style={{ color }} />
        </div>
        <div className="flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">{title}</p>
          <p className="text-sm font-semibold text-white">{segment.label} · {segment.period}</p>
          <p className="mt-1.5 text-[13px] italic leading-relaxed text-white/50">{message}</p>
          <div className="mt-2 flex gap-2 text-[11px] text-white/30">
            <span>{segment.count} reading{segment.count !== 1 ? "s" : ""}</span>
            {segment.avg !== null && (
              <>
                <span>·</span>
                <span>{segment.avg} mg/dL avg</span>
              </>
            )}
            {segment.inRangePct > 0 && (
              <>
                <span>·</span>
                <span>{Math.round(segment.inRangePct)}% in balance</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MomentsOfCare({ segments }) {
  const valid = segments.filter((s) => s.count >= MIN_READINGS);

  if (!valid.length) {
    return (
      <div className="relative overflow-hidden rounded-3xl border p-6" style={GLASS_SURFACE}>
        <div className="text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white">Moments of Care</p>
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
      title: "Your Most Peaceful Time",
      segment: mostPeaceful,
      message: `Your ${mostPeaceful.label.toLowerCase()} hours have been a beautiful rhythm of balance. Your routine is nurturing you well here.`,
    },
    mostElevated && {
      icon: Sun,
      color: WELLNESS_COLORS.above,
      title: "Where You Tend to Rise",
      segment: mostElevated,
      message: `Your ${mostElevated.label.toLowerCase()} often gently rises above your comfort zone. A mindful pause or a gentle walk here might help your body find its way back to steady ground.`,
    },
    mostLikelyToDip && {
      icon: Moon,
      color: WELLNESS_COLORS.below,
      title: "Where You Tend to Drift Low",
      segment: mostLikelyToDip,
      message: `Your ${mostLikelyToDip.label.toLowerCase()} sometimes drifts a little low. A small, kind snack before this time might keep you gently supported.`,
    },
  ].filter(Boolean);

  return (
    <div>
      <p className="mb-3 px-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white">Moments of Care</p>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <motion.div
            key={insight.title}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 + i * 0.08 }}
          >
            <InsightCard {...insight} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}