import { formatMinutes } from "@/lib/insulinPharmacology";

function DoseTimelineBar({ dose }) {
  const { shortName, units, iob, color, statusLabel, timingInfo } = dose;
  const progress = timingInfo?.progress ?? 0;
  const remainingMin = timingInfo?.remainingMin ?? 0;
  const isSettling = remainingMin <= 1;

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <p className="truncate text-xs font-semibold text-white/75">{shortName}</p>
          <span className="text-[10px] text-white/30">{units}u</span>
        </div>
        <span className="shrink-0 text-sm font-bold text-white">{iob.toFixed(1)}u</span>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.05)" }}>
        <div
          className="absolute inset-y-0 left-0"
          style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${color}15, ${color}30)` }}
        />
        <div
          className="absolute inset-y-0"
          style={{ left: `${progress * 100}%`, right: 0, background: `linear-gradient(90deg, ${color}90, ${color}40)` }}
        />
        <div
          className="absolute h-3.5 w-0.5 rounded-full bg-white/80"
          style={{ left: `${progress * 100}%`, top: "50%", transform: "translate(-50%, -50%)" }}
        />
      </div>

      <div className="mt-1.5 flex items-center justify-between">
        <p className="text-[10px] text-white/35">{statusLabel}</p>
        <p className="text-[10px] font-medium" style={{ color: isSettling ? "rgba(255,255,255,0.3)" : color }}>
          {isSettling ? "Gently settling" : `Estimated ~${formatMinutes(remainingMin)} left`}
        </p>
      </div>
    </div>
  );
}

export default function DoseTimeline({ doses }) {
  if (!doses?.length) return null;
  return (
    <div className="space-y-2">
      {doses.map((dose) => (
        <DoseTimelineBar key={dose.id} dose={dose} />
      ))}
    </div>
  );
}